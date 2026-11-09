"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { draftProblem, isNewId, ruleColumns, type ChoreManagerDraft } from "@/lib/chore-manager";
import { addDays, localDateOf } from "@/lib/time";
import { spreadFirstDue, upcomingDue, type ChoreRule } from "@/lib/chores";
import { loadChores } from "./data";

/** On success, the saved id of each new thing ("new-…" → its real id). */
export type SaveResult = { ok: true; ids: Record<string, string> } | { ok: false; error: string };

function refresh() {
  revalidatePath("/chores");
  revalidatePath("/lists");
  revalidatePath("/review");
  revalidatePath("/");
}

/**
 * Saves everything changed on the Chore Manager in one go: chore days,
 * their regular chores in order, and the occasional chores with their
 * heads-ups. Anything left out of the draft is deleted. A chore that
 * changed loses today's open task, so the daily list makes it again to
 * match.
 */
export async function saveChoreManager(draft: ChoreManagerDraft): Promise<SaveResult> {
  const household = await requireHousehold();
  const problem = draftProblem(draft);
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const [daysNow, choresNow, linksNow, headsNow] = await Promise.all([
    supabase.from("chore_days").select("id, is_free"),
    supabase
      .from("task_templates")
      .select(
        "id, kind, name, icon, tags, at_time, default_assignee_id, notes, active, visibility, repeat_every, repeat_unit, preferred_weekday, snap, repeat_from, start_date, only_seasons, only_months, season_start, season_end",
      ),
    supabase.from("task_template_chore_days").select("template_id, chore_day_id"),
    supabase.from("heads_ups").select("id, chore_id, label, minutes_before, makes").not("chore_id", "is", null),
  ]);
  for (const r of [daysNow, choresNow, linksNow, headsNow]) if (r.error) return { ok: false, error: r.error.message };
  const fail = (error: { message: string } | null): SaveResult | null => (error ? { ok: false, error: error.message } : null);
  const realId = new Map<string, string>();

  // 1. Chore days: remove the ones taken away (never the Free day), then add and update.
  const keepDays = new Set(draft.days.filter((d) => !isNewId(d.id)).map((d) => d.id));
  const goneDays = (daysNow.data ?? []).filter((d) => !d.is_free && !keepDays.has(d.id)).map((d) => d.id);
  if (goneDays.length > 0) {
    const bad = fail((await supabase.from("chore_days").delete().in("id", goneDays)).error);
    if (bad) return bad;
  }
  for (const [i, d] of draft.days.entries()) {
    const row = {
      name: d.name.trim(),
      icon: d.icon || null,
      max_tasks: d.max_tasks,
      max_big: d.max_big,
      sort_order: d.is_free ? 1000 : i,
      // The Free day fills days with nothing else: no weekdays, never restrictive.
      ...(d.is_free ? {} : { weekdays: [...d.weekdays].sort(), span: d.span, restrictive: d.restrictive }),
    };
    if (isNewId(d.id)) {
      const { data, error } = await supabase.from("chore_days").insert({ ...row, household_id: household.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      realId.set(d.id, data.id);
    } else {
      const bad = fail((await supabase.from("chore_days").update(row).eq("id", d.id)).error);
      if (bad) return bad;
      realId.set(d.id, d.id);
    }
  }
  const dayId = (id: string) => realId.get(id) ?? id;

  // 2. Chores: remove the ones taken away.
  const keepChores = new Set([...draft.regular, ...draft.occasional].filter((c) => !isNewId(c.id)).map((c) => c.id));
  const goneChores = (choresNow.data ?? []).filter((c) => !keepChores.has(c.id)).map((c) => c.id);
  if (goneChores.length > 0) {
    const bad = fail((await supabase.from("task_templates").delete().in("id", goneChores)).error);
    if (bad) return bad;
  }
  const before = new Map((choresNow.data ?? []).map((c) => [c.id, c]));
  const linksOf = new Map<string, string[]>();
  for (const l of linksNow.data ?? []) linksOf.set(l.template_id, [...(linksOf.get(l.template_id) ?? []), l.chore_day_id]);
  const changed: string[] = [];

  /** Saves one chore and its chore days; notes whether it changed. */
  const saveChore = async (draftId: string, row: Record<string, unknown>, choreDayIds: string[]): Promise<SaveResult | null> => {
    let id = draftId;
    if (isNewId(draftId)) {
      const { data, error } = await supabase
        .from("task_templates")
        .insert({ ...row, household_id: household.id } as never)
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    } else {
      const old = before.get(id) as Record<string, unknown> | undefined;
      const differs = !old || Object.entries(row).some(([k, v]) => k !== "sort_order" && JSON.stringify(normal(old[k])) !== JSON.stringify(normal(v)));
      if (differs) {
        const bad = fail((await supabase.from("task_templates").update(row as never).eq("id", id)).error);
        if (bad) return bad;
        changed.push(id);
      } else {
        const bad = fail((await supabase.from("task_templates").update({ sort_order: row.sort_order as number }).eq("id", id)).error);
        if (bad) return bad;
      }
    }
    realId.set(draftId, id);
    const wanted = [...new Set(choreDayIds.map(dayId))].sort();
    const have = [...(linksOf.get(id) ?? [])].sort();
    if (JSON.stringify(wanted) !== JSON.stringify(have)) {
      const gone = fail((await supabase.from("task_template_chore_days").delete().eq("template_id", id)).error);
      if (gone) return gone;
      if (wanted.length > 0) {
        const bad = fail(
          (
            await supabase
              .from("task_template_chore_days")
              .insert(wanted.map((chore_day_id) => ({ household_id: household.id, template_id: id, chore_day_id })))
          ).error,
        );
        if (bad) return bad;
      }
      if (!isNewId(draftId)) changed.push(id);
    }
    return null;
  };

  // 3. Regular chores, in order within each chore day.
  for (const [i, c] of draft.regular.entries()) {
    const bad = await saveChore(
      c.id,
      {
        kind: "preset",
        name: c.name.trim(),
        icon: c.icon || null,
        tags: [],
        at_time: c.due_time || null,
        default_assignee_id: c.assignee_id,
        notes: c.notes?.trim() || null,
        active: c.active,
        sort_order: i,
        repeat_every: 1,
        repeat_unit: "week",
        preferred_weekday: null,
        snap: "none",
        repeat_from: "done",
        start_date: null,
        only_seasons: null,
        only_months: null,
        season_start: null,
        season_end: null,
      },
      [c.chore_day_id],
    );
    if (bad) return bad;
  }

  // 4. Occasional chores and their heads-ups.
  const headsOf = new Map<string, { id: string; label: string; minutes_before: number; makes: string }[]>();
  for (const h of headsNow.data ?? []) if (h.chore_id) headsOf.set(h.chore_id, [...(headsOf.get(h.chore_id) ?? []), h]);
  // A new occasional chore's first time goes on a quiet day, so chores
  // made together don't keep coming due together.
  const firstDue = new Map<string, string | null>();
  const fresh = draft.occasional.filter((c) => isNewId(c.id));
  if (fresh.length > 0) {
    const timeZone = household.settings.timeZone;
    const today = localDateOf(new Date(), timeZone);
    const until = addDays(today, 70);
    const { chores } = await loadChores(today, timeZone);
    const others = chores
      .filter((c) => c.kind === "generated" && c.active && keepChores.has(c.id))
      .flatMap((c) => upcomingDue(c.timing.dueOn, c, today, until));
    for (const c of fresh) {
      const rule = { ...ruleColumns(c), first_due: null } as ChoreRule;
      const picked = c.active ? spreadFirstDue(rule, today, others) : null;
      firstDue.set(c.id, picked);
      if (picked) others.push(...upcomingDue(picked, rule, today, until));
    }
  }

  for (const [i, c] of draft.occasional.entries()) {
    const bad = await saveChore(
      c.id,
      {
        kind: "generated",
        name: c.name.trim(),
        icon: c.icon || null,
        tags: c.tags,
        at_time: c.at_time || null,
        default_assignee_id: c.assignee_id,
        notes: c.notes?.trim() || null,
        active: c.active,
        visibility: c.visibility,
        sort_order: 100 + i,
        ...ruleColumns(c),
        ...(firstDue.has(c.id) ? { first_due: firstDue.get(c.id) } : {}),
      },
      c.chore_day_ids,
    );
    if (bad) return bad;
    const choreId = realId.get(c.id) as string;
    const old = headsOf.get(choreId) ?? [];
    const keep = new Set(c.heads_ups.filter((h) => !isNewId(h.id)).map((h) => h.id));
    const gone = old.filter((h) => !keep.has(h.id)).map((h) => h.id);
    if (gone.length > 0) {
      const err = fail((await supabase.from("heads_ups").delete().in("id", gone)).error);
      if (err) return err;
    }
    for (const [at, h] of c.heads_ups.entries()) {
      const row = { label: h.label.trim(), minutes_before: h.minutes_before, makes: h.makes, sort_order: at };
      if (isNewId(h.id)) {
        const err = fail((await supabase.from("heads_ups").insert({ ...row, household_id: household.id, chore_id: choreId })).error);
        if (err) return err;
      } else {
        const was = old.find((x) => x.id === h.id);
        if (was && (was.label !== row.label || was.minutes_before !== row.minutes_before || was.makes !== row.makes)) {
          const err = fail((await supabase.from("heads_ups").update(row).eq("id", h.id)).error);
          if (err) return err;
        }
      }
    }
  }

  // 5. A changed chore's open task is made again to match. An occasional
  // chore on today's list (perhaps put there with "+") stays, updated.
  const regularIds = new Set(draft.regular.map((c) => realId.get(c.id)));
  const changedIds = [...new Set(changed)];
  if (changedIds.length > 0) {
    const today = localDateOf(new Date(), household.settings.timeZone);
    const { data: openRows, error: openError } = await supabase
      .from("task_instances")
      .select("id, template_id, due_date")
      .in("template_id", changedIds)
      .eq("status", "open");
    if (openError) return { ok: false, error: openError.message };
    const remake = (openRows ?? []).filter((t) => regularIds.has(t.template_id ?? undefined) || t.due_date !== today).map((t) => t.id);
    if (remake.length > 0) {
      const bad = fail((await supabase.from("task_instances").delete().in("id", remake)).error);
      if (bad) return bad;
    }
    for (const t of (openRows ?? []).filter((r) => !remake.includes(r.id))) {
      const c = draft.occasional.find((x) => realId.get(x.id) === t.template_id);
      if (!c) continue;
      const bad = fail(
        (
          await supabase
            .from("task_instances")
            .update({
              title: c.name.trim(),
              icon: c.icon || "🧹",
              at_time: c.at_time,
              assignee_id: c.assignee_id,
              must_do: c.tags.includes("essential"),
              visibility: c.visibility,
            })
            .eq("id", t.id)
        ).error,
      );
      if (bad) return bad;
    }
  }

  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "chores_saved",
    target_type: "task_template",
    target_id: null,
    details: {
      chore_days: String(draft.days.length),
      regular: String(draft.regular.length),
      occasional: String(draft.occasional.length),
      removed: String(goneChores.length + goneDays.length),
    },
  });
  refresh();
  return { ok: true, ids: Object.fromEntries(realId) };
}

/** Empty lists and missing values compare the same; times compare as "19:00". */
function normal(v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v)) return v.length === 0 ? null : v;
  if (typeof v === "string" && /^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
  return v;
}

/**
 * "+" on an occasional chore: puts it on today's daily list. Done today,
 * and its repeat counts from today. Left undone, it goes back to the day
 * the generator had it on.
 */
export async function doChoreToday(choreId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const household = await requireHousehold();
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const { data: chore, error } = await supabase
    .from("task_templates")
    .select("id, kind, name, icon, at_time, tags, default_assignee_id, link, visibility, active")
    .eq("id", choreId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!chore || chore.kind !== "generated") return { ok: false, error: "That chore isn't there any more." };
  if (!chore.active) return { ok: false, error: `${chore.name} is paused. Turn it back on first.` };

  // Already on today's list: nothing to do. On another day: moved to today.
  const { data: open } = await supabase.from("task_instances").select("id, due_date").eq("template_id", choreId).eq("status", "open");
  if ((open ?? []).some((t) => t.due_date === today)) return { ok: true };
  if ((open ?? []).length > 0) await supabase.from("task_instances").delete().eq("template_id", choreId).eq("status", "open");
  const { data: list } = await supabase.from("task_lists").select("id").order("sort_order").order("name").limit(1).maybeSingle();
  if (!list) return { ok: false, error: "Make a list first, on Lists." };
  const { error: insertError } = await supabase.from("task_instances").insert({
    household_id: household.id,
    template_id: chore.id,
    list_id: list.id,
    title: chore.name,
    icon: chore.icon ?? "🧹",
    due_date: today,
    date_kind: "start",
    at_time: chore.at_time,
    must_do: (chore.tags as string[]).includes("essential"),
    assignee_id: chore.default_assignee_id,
    link: chore.link,
    visibility: chore.visibility,
  });
  // Two taps at once: the unique index keeps one.
  if (insertError && insertError.code !== "23505") return { ok: false, error: insertError.message };
  // Asked for today: any "wait until" from a skip is over.
  await supabase.from("task_templates").update({ not_before: null }).eq("id", choreId);
  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "chore_done_today",
    target_type: "task_template",
    target_id: chore.id,
    details: { name: chore.name },
  });
  refresh();
  return { ok: true };
}
