"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { draftProblem, isNewId, kindFor, stepPeople, type ManagerDraft } from "@/lib/routine-manager";
import { createClient } from "@/lib/supabase/server";
import { isVisibility } from "../calendar/options";

/** On success, the saved id of each new routine ("new-…" → its real id). */
export type SaveResult = { ok: true; ids: Record<string, string> } | { ok: false; error: string };

/**
 * Saves everything changed on the Routine Manager in one go: routines
 * added, changed or deleted, their steps in order, and who has them on
 * which kind of day. Anything not in the draft is deleted (one-day swaps
 * are left alone).
 */
export async function saveRoutineManager(draft: ManagerDraft): Promise<SaveResult> {
  const household = await requireHousehold();
  const problem = draftProblem(draft);
  if (problem) return { ok: false, error: problem };
  if (draft.routines.some((r) => !isVisibility(r.visibility))) return { ok: false, error: "Choose who can see each routine." };

  const supabase = await createClient();
  const [routinesNow, stepsNow, usesNow, mealTimes] = await Promise.all([
    supabase.from("routine_templates").select("id, name"),
    supabase.from("routine_steps").select("id, template_id"),
    supabase.from("routine_assignments").select("id, template_id, member_id, day_type_id").not("day_type_id", "is", null),
    supabase.from("meal_times").select("id, usual_time"),
  ]);
  for (const r of [routinesNow, stepsNow, usesNow, mealTimes]) if (r.error) return { ok: false, error: r.error.message };
  const mealTime = (id: string | null) => (mealTimes.data ?? []).find((m) => m.id === id)?.usual_time?.slice(0, 5) ?? null;

  // 1. Routines: delete the ones taken away, then add and update the rest.
  const keep = new Set(draft.routines.filter((r) => !isNewId(r.id)).map((r) => r.id));
  const gone = (routinesNow.data ?? []).filter((r) => !keep.has(r.id));
  if (gone.length > 0) {
    const { error } = await supabase.from("routine_templates").delete().in("id", gone.map((r) => r.id));
    if (error) return { ok: false, error: error.message };
  }
  const realId = new Map<string, string>();
  for (const [i, r] of draft.routines.entries()) {
    const row = {
      name: r.name.trim(),
      kind: kindFor(r, mealTime(r.anchor_meal_time_id)),
      anchor: r.anchor,
      anchor_meal_time_id: r.anchor === "meal" ? r.anchor_meal_time_id : null,
      anchor_offset: r.anchor_offset,
      usual_start: r.anchor === "clock" ? r.usual_start : null,
      usual_minutes: r.usual_minutes,
      loose: r.loose,
      habit_since: r.habit_since,
      visibility: r.visibility,
      sort_order: i,
    };
    if (isNewId(r.id)) {
      const { data, error } = await supabase.from("routine_templates").insert({ ...row, household_id: household.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      realId.set(r.id, data.id);
    } else {
      const { error } = await supabase.from("routine_templates").update(row).eq("id", r.id);
      if (error) return { ok: false, error: error.message };
      realId.set(r.id, r.id);
    }
  }
  const routineId = (id: string) => realId.get(id) ?? id;

  // 2. Steps: delete removed ones, then save each in order.
  const keptSteps = new Set(draft.steps.filter((s) => !isNewId(s.id)).map((s) => s.id));
  const goneSteps = (stepsNow.data ?? []).filter((s) => keep.has(s.template_id) && !keptSteps.has(s.id));
  if (goneSteps.length > 0) {
    const { error } = await supabase.from("routine_steps").delete().in("id", goneSteps.map((s) => s.id));
    if (error) return { ok: false, error: error.message };
  }
  const position = new Map<string, number>();
  const stepIds: string[] = [];
  const stepMembers: { step_id: string; member_id: string; household_id: string }[] = [];
  for (const s of draft.steps) {
    const at = position.get(s.routine_id) ?? 0;
    position.set(s.routine_id, at + 1);
    const row = { text: s.text.trim(), icon: s.icon || null, habit: s.habit, daily_list: s.daily_list, position: at, target_time: null };
    let id = s.id;
    if (isNewId(s.id)) {
      const { data, error } = await supabase
        .from("routine_steps")
        .insert({ ...row, household_id: household.id, template_id: routineId(s.routine_id) })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    } else {
      const { error } = await supabase.from("routine_steps").update(row).eq("id", s.id);
      if (error) return { ok: false, error: error.message };
    }
    stepIds.push(id);
    // Who does it (only people who still have the routine; none = everyone).
    for (const member_id of stepPeople(draft, s)) stepMembers.push({ step_id: id, member_id, household_id: household.id });
  }
  if (stepIds.length > 0) {
    const { error } = await supabase.from("routine_step_members").delete().in("step_id", stepIds);
    if (error) return { ok: false, error: error.message };
  }
  if (stepMembers.length > 0) {
    const { error } = await supabase.from("routine_step_members").insert(stepMembers);
    if (error) return { ok: false, error: error.message };
  }

  // 3. Who has which routine on which kind of day.
  const wanted = new Set(draft.uses.map((u) => `${routineId(u.routine_id)}|${u.member_id}|${u.day_type_id}`));
  const have = new Set<string>();
  const dropUses: string[] = [];
  for (const u of usesNow.data ?? []) {
    if (!keep.has(u.template_id)) continue;
    const key = `${u.template_id}|${u.member_id}|${u.day_type_id}`;
    if (wanted.has(key) && !have.has(key)) have.add(key);
    else dropUses.push(u.id);
  }
  if (dropUses.length > 0) {
    const { error } = await supabase.from("routine_assignments").delete().in("id", dropUses);
    if (error) return { ok: false, error: error.message };
  }
  const add = [...wanted].filter((key) => !have.has(key)).map((key) => {
    const [template_id, member_id, day_type_id] = key.split("|");
    return { household_id: household.id, template_id, member_id, day_type_id };
  });
  if (add.length > 0) {
    const { error } = await supabase.from("routine_assignments").insert(add);
    if (error) return { ok: false, error: error.message };
  }

  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "routines_saved",
    target_type: "routine",
    target_id: null,
    details: { routines: String(draft.routines.length), removed: String(gone.length) },
  });
  revalidatePath("/routines");
  revalidatePath("/");
  return { ok: true, ids: Object.fromEntries(realId) };
}
