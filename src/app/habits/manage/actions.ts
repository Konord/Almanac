"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { managerProblem, type HabitManagerDraft } from "@/lib/habit-manager";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The Habit Manager's one Save: habits and health trackers together.
 * Every row carries the id the screen gave it, so each is added or updated
 * by id; rows left out of the draft are deleted (their logs go with them).
 */
export async function saveHabitManager(draft: HabitManagerDraft): Promise<Result> {
  const household = await requireHousehold();
  const problem = managerProblem(draft);
  if (problem) return { ok: false, error: problem };
  const ids = [...draft.habits.map((h) => h.id), ...draft.trackers.flatMap((t) => [t.id, ...t.choices.map((c) => c.id)])];
  if (!ids.every((id) => UUID.test(id))) return { ok: false, error: "Something went wrong with an id. Try again." };

  const supabase = await createClient();
  const hid = household.id;
  const [habitsNow, trackersNow, choicesNow, members] = await Promise.all([
    supabase.from("habits").select("id"),
    supabase.from("health_trackers").select("id"),
    supabase.from("health_choices").select("id"),
    supabase.from("members").select("id"),
  ]);
  for (const r of [habitsNow, trackersNow, choicesNow, members]) if (r.error) return { ok: false, error: r.error.message };
  const people = new Set((members.data ?? []).map((m) => m.id));
  const fail = (e: { message: string } | null) => (e ? ({ ok: false, error: e.message } as const) : null);

  // --- Habits ---
  const keepHabits = new Set(draft.habits.map((h) => h.id));
  const goneHabits = (habitsNow.data ?? []).map((h) => h.id).filter((id) => !keepHabits.has(id));
  if (goneHabits.length) {
    const bad = fail((await supabase.from("habits").delete().in("id", goneHabits)).error);
    if (bad) return bad;
  }
  if (draft.habits.length) {
    const rows = draft.habits.map((h, i) => ({
      id: h.id,
      household_id: hid,
      name: h.name.trim(),
      icon: h.icon || null,
      measure: h.measure,
      goal: h.measure === "count" ? h.goal : 1,
      unit: h.measure === "count" ? h.unit.trim() || null : null,
      step: h.measure === "count" ? h.step : 1,
      frequency: h.frequency,
      weekdays: h.frequency === "days" ? [...new Set(h.weekdays)].sort() : [],
      times: h.frequency === "week" || h.frequency === "month" ? h.times : 1,
      since: h.since,
      sort_order: i,
    }));
    let bad = fail((await supabase.from("habits").upsert(rows)).error);
    if (bad) return bad;
    bad = fail((await supabase.from("habit_members").delete().in("habit_id", draft.habits.map((h) => h.id))).error);
    if (bad) return bad;
    const links = draft.habits.flatMap((h) => [...new Set(h.member_ids)].filter((m) => people.has(m)).map((member_id) => ({ habit_id: h.id, member_id, household_id: hid })));
    if (links.length) {
      bad = fail((await supabase.from("habit_members").insert(links)).error);
      if (bad) return bad;
    }
  }

  // --- Health trackers ---
  const keepTrackers = new Set(draft.trackers.map((t) => t.id));
  const goneTrackers = (trackersNow.data ?? []).map((t) => t.id).filter((id) => !keepTrackers.has(id));
  if (goneTrackers.length) {
    const bad = fail((await supabase.from("health_trackers").delete().in("id", goneTrackers)).error);
    if (bad) return bad;
  }
  const keepChoices = new Set(draft.trackers.flatMap((t) => (t.kind === "medicine" ? t.choices.map((c) => c.id) : [])));
  const goneChoices = (choicesNow.data ?? []).map((c) => c.id).filter((id) => !keepChoices.has(id));
  if (goneChoices.length) {
    const bad = fail((await supabase.from("health_choices").delete().in("id", goneChoices)).error);
    if (bad) return bad;
  }
  if (draft.trackers.length) {
    const rows = draft.trackers.map((t, i) => ({
      id: t.id,
      household_id: hid,
      name: t.name.trim(),
      icon: t.icon || null,
      kind: t.kind,
      unit: t.kind === "number" ? t.unit.trim() || null : null,
      alert_above: t.kind === "number" ? t.alert_above : null,
      sort_order: i,
    }));
    let bad = fail((await supabase.from("health_trackers").upsert(rows)).error);
    if (bad) return bad;
    bad = fail((await supabase.from("health_tracker_members").delete().in("tracker_id", draft.trackers.map((t) => t.id))).error);
    if (bad) return bad;
    const links = draft.trackers.flatMap((t) => [...new Set(t.member_ids)].filter((m) => people.has(m)).map((member_id) => ({ tracker_id: t.id, member_id, household_id: hid })));
    if (links.length) {
      bad = fail((await supabase.from("health_tracker_members").insert(links)).error);
      if (bad) return bad;
    }
    const choices = draft.trackers.flatMap((t) =>
      t.kind === "medicine"
        ? t.choices.map((c, i) => ({
            id: c.id,
            household_id: hid,
            tracker_id: t.id,
            name: c.name.trim(),
            icon: c.icon || null,
            wait_minutes: c.wait_minutes,
            max_per_day: c.max_per_day,
            sort_order: i,
          }))
        : [],
    );
    if (choices.length) {
      bad = fail((await supabase.from("health_choices").upsert(choices)).error);
      if (bad) return bad;
      bad = fail((await supabase.from("health_choice_amounts").delete().in("choice_id", choices.map((c) => c.id))).error);
      if (bad) return bad;
      const amounts = draft.trackers.flatMap((t) =>
        t.kind === "medicine"
          ? t.choices.flatMap((c) =>
              Object.entries(c.amounts)
                .filter(([m, a]) => a.trim() && people.has(m) && t.member_ids.includes(m))
                .map(([member_id, amount]) => ({ choice_id: c.id, member_id, household_id: hid, amount: amount.trim() })),
            )
          : [],
      );
      if (amounts.length) {
        bad = fail((await supabase.from("health_choice_amounts").insert(amounts)).error);
        if (bad) return bad;
      }
    }
  }

  revalidatePath("/habits");
  revalidatePath("/habits/manage");
  revalidatePath("/habits/health");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}
