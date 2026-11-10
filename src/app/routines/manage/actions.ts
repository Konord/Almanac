"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { daysProblem, groupKey, isNewId, type DaysDraft } from "@/lib/set-days";
import { syncEventAndChoreHeadsUps } from "../../heads-ups/sync";
import { createClient } from "@/lib/supabase/server";

export type SaveDaysResult = { ok: true } | { ok: false; error: string };

/**
 * Saves everything changed on Set days in one go: kinds of day, weeks,
 * which week each person is on, and breaks. Kinds of day and weeks not in
 * the draft are deleted. `knownBreakIds` are the breaks the screen showed
 * (past ones aren't shown, so they're left alone); any of them missing from
 * the draft are deleted.
 */
export async function saveSetDays(draft: DaysDraft, knownBreakIds: string[]): Promise<SaveDaysResult> {
  const household = await requireHousehold();
  const supabase = await createClient();
  const [members, typesNow, plansNow] = await Promise.all([
    supabase.from("members").select("id, name"),
    supabase.from("day_types").select("id"),
    supabase.from("week_plans").select("id"),
  ]);
  for (const r of [members, typesNow, plansNow]) if (r.error) return { ok: false, error: r.error.message };
  const names = Object.fromEntries((members.data ?? []).map((m) => [m.id, m.name]));
  // Everyone in the household has to be in the draft, so nobody loses their days.
  const draftMembers = new Set(draft.members.map((m) => m.member_id));
  if ((members.data ?? []).some((m) => !draftMembers.has(m.id))) return { ok: false, error: "Someone new joined while you were editing. Undo changes and try again." };
  const problem = daysProblem(draft, names);
  if (problem) return { ok: false, error: problem };
  const fail = (error: { message: string } | null) => (error ? ({ ok: false, error: error.message } as const) : null);

  // 1. Kinds of day: add new ones, update the rest (deleting comes last).
  const typeId = new Map<string, string>();
  const order = new Map<string, number>();
  for (const t of draft.dayTypes) {
    const at = order.get(t.member_id) ?? 0;
    order.set(t.member_id, at + 1);
    const row = { name: t.name.trim(), icon: t.icon || null, wake_time: t.wake, bed_time: t.bed, errands: t.errands, sort_order: at };
    if (isNewId(t.id)) {
      const { data, error } = await supabase.from("day_types").insert({ ...row, household_id: household.id, member_id: t.member_id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      typeId.set(t.id, data.id);
    } else {
      const bad = fail((await supabase.from("day_types").update(row).eq("id", t.id)).error);
      if (bad) return bad;
      typeId.set(t.id, t.id);
    }
  }
  const realType = (id: string | null) => (id ? (typeId.get(id) ?? id) : null);

  // 2. Weeks, and which kind of day each weekday is.
  const planId = new Map<string, string>();
  order.clear();
  for (const p of draft.weekPlans) {
    const at = order.get(p.member_id) ?? 0;
    order.set(p.member_id, at + 1);
    const row = { name: p.name.trim(), sort_order: at };
    if (isNewId(p.id)) {
      const { data, error } = await supabase.from("week_plans").insert({ ...row, household_id: household.id, member_id: p.member_id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      planId.set(p.id, data.id);
    } else {
      const bad = fail((await supabase.from("week_plans").update(row).eq("id", p.id)).error);
      if (bad) return bad;
      planId.set(p.id, p.id);
    }
  }
  const realPlan = (id: string | null) => (id ? (planId.get(id) ?? id) : null);
  if (draft.planDays.length > 0) {
    const rows = draft.planDays.map((d) => ({
      household_id: household.id,
      week_plan_id: realPlan(d.plan_id) as string,
      weekday: d.weekday,
      day_type_id: realType(d.day_type_id) as string,
    }));
    const bad = fail((await supabase.from("week_plan_days").upsert(rows, { onConflict: "week_plan_id,weekday" })).error);
    if (bad) return bad;
  }

  // 3. Which week each person is on.
  for (const m of draft.members) {
    const bad = fail(
      (
        await supabase
          .from("members")
          .update({ current_week_plan_id: realPlan(m.current_week_plan_id), week_plans_rotate: m.rotate, rotation_start: m.rotate ? m.rotation_start : null })
          .eq("id", m.member_id)
      ).error,
    );
    if (bad) return bad;
  }

  // 4. Weeks and kinds of day taken away. (Their routines go with them.)
  const keepPlans = new Set(draft.weekPlans.map((p) => p.id));
  const gonePlans = (plansNow.data ?? []).filter((p) => !keepPlans.has(p.id)).map((p) => p.id);
  if (gonePlans.length > 0) {
    const bad = fail((await supabase.from("week_plans").delete().in("id", gonePlans)).error);
    if (bad) return bad;
  }
  const keepTypes = new Set(draft.dayTypes.map((t) => t.id));
  const goneTypes = (typesNow.data ?? []).filter((t) => !keepTypes.has(t.id)).map((t) => t.id);
  if (goneTypes.length > 0) {
    const bad = fail((await supabase.from("day_types").delete().in("id", goneTypes)).error);
    if (bad) return bad;
  }

  // 5. Breaks: delete the ones taken away, save the rest with who's on them.
  const keepBreaks = new Set(draft.breaks.map((b) => b.id));
  const goneBreaks = knownBreakIds.filter((id) => !keepBreaks.has(id));
  if (goneBreaks.length > 0) {
    const bad = fail((await supabase.from("breaks").delete().in("id", goneBreaks)).error);
    if (bad) return bad;
  }
  for (const b of draft.breaks) {
    const row = { name: b.name.trim(), icon: b.icon || null, start_date: b.start, end_date: b.end, away: Boolean(b.away) };
    let id = b.id;
    if (isNewId(b.id)) {
      const { data, error } = await supabase.from("breaks").insert({ ...row, household_id: household.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    } else {
      const bad = fail((await supabase.from("breaks").update(row).eq("id", b.id)).error) ?? fail((await supabase.from("break_members").delete().eq("break_id", b.id)).error);
      if (bad) return bad;
    }
    const people = b.people.map((p) => ({
      household_id: household.id,
      break_id: id,
      member_id: p.member_id,
      day_type_id: realType(p.day_type_id),
      week_plan_id: realPlan(p.week_plan_id),
    }));
    const bad = fail((await supabase.from("break_members").insert(people)).error);
    if (bad) return bad;
  }

  // 6. A kind of day renamed: events, templates and heads-ups that name it follow.
  const finalName = new Map<string, string>();
  for (const t of draft.dayTypes) if (!finalName.has(t.group)) finalName.set(t.group, t.name.trim());
  for (const [group, name] of finalName) {
    if (isNewId(group) || groupKey(name) === group) continue;
    // Matched without caring about capitals (ilike), with its wildcards taken literally.
    const old = group.replace(/[\\%_]/g, (c) => `\\${c}`);
    const bad =
      fail((await supabase.from("events").update({ day_kind: name }).ilike("day_kind", old)).error) ??
      fail((await supabase.from("event_templates").update({ day_kind: name }).ilike("day_kind", old)).error) ??
      fail((await supabase.from("heads_ups").update({ day_kind: name }).ilike("day_kind", old)).error);
    if (bad) return bad;
  }

  // 7. Heads-ups on kinds of day: take away, change and add.
  const { data: headsUpsNow, error: headsUpsError } = await supabase.from("heads_ups").select("id").not("day_kind", "is", null);
  if (headsUpsError) return { ok: false, error: headsUpsError.message };
  const keptHeadsUps = draft.headsUps.filter((h) => finalName.has(h.group));
  const keepIds = new Set(keptHeadsUps.filter((h) => !isNewId(h.id)).map((h) => h.id));
  const goneHeadsUps = (headsUpsNow ?? []).filter((h) => !keepIds.has(h.id)).map((h) => h.id);
  if (goneHeadsUps.length > 0) {
    // Done to-dos they made are kept as history; open ones go with them.
    await supabase.from("task_instances").update({ heads_up_id: null }).in("heads_up_id", goneHeadsUps).neq("status", "open");
    const bad = fail((await supabase.from("heads_ups").delete().in("id", goneHeadsUps)).error);
    if (bad) return bad;
  }
  for (const [i, h] of keptHeadsUps.entries()) {
    const row = { day_kind: finalName.get(h.group) as string, label: h.label.trim(), minutes_before: h.minutes_before, makes: h.makes, sort_order: i };
    const bad = isNewId(h.id)
      ? fail((await supabase.from("heads_ups").insert({ ...row, household_id: household.id })).error)
      : fail((await supabase.from("heads_ups").update(row).eq("id", h.id)).error);
    if (bad) return bad;
  }
  await syncEventAndChoreHeadsUps(household, true);

  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "days_saved",
    target_type: "day_type",
    target_id: null,
    details: { kinds: String(draft.dayTypes.length), breaks: String(draft.breaks.length) },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
