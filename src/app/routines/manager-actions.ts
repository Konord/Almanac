"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { draftProblem, isNewId, kindFor, stepPeople, type ManagerDraft } from "@/lib/routine-manager";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { isVisibility } from "../calendar/options";
import { writePresets, type PresetRow } from "../meals/shared";

/** On success, the saved id of each new routine or meal block ("new-…" → its real id). */
export type SaveResult = { ok: true; ids: Record<string, string> } | { ok: false; error: string };

/**
 * Saves everything changed on the Routine Manager in one go: meal blocks
 * (with their weekday presets), routines added, changed or deleted, their
 * steps in order, and who has each on which kind of day. Anything not in
 * the draft is deleted (one-day swaps are left alone). Deleting a meal
 * block also takes away the meals planned in it.
 */
export async function saveRoutineManager(draft: ManagerDraft): Promise<SaveResult> {
  const household = await requireHousehold();
  const problem = draftProblem(draft);
  if (problem) return { ok: false, error: problem };
  if (draft.routines.some((r) => !isVisibility(r.visibility))) return { ok: false, error: "Choose who can see each routine." };

  const supabase = await createClient();
  const [routinesNow, stepsNow, usesNow, mealTimes, mealUsesNow, kinds, menuMeals] = await Promise.all([
    supabase.from("routine_templates").select("id, name"),
    supabase.from("routine_steps").select("id, template_id"),
    supabase.from("routine_assignments").select("id, template_id, member_id, day_type_id").not("day_type_id", "is", null),
    supabase.from("meal_times").select("id"),
    supabase.from("meal_time_uses").select("id, meal_time_id, member_id, day_type_id"),
    supabase.from("meal_categories").select("id"),
    supabase.from("menu_meals").select("id"),
  ]);
  for (const r of [routinesNow, stepsNow, usesNow, mealTimes, mealUsesNow, kinds, menuMeals]) if (r.error) return { ok: false, error: r.error.message };

  // 0. Meal blocks first, so routines can come after a new one.
  const keepMeals = new Set(draft.meals.filter((m) => !isNewId(m.id)).map((m) => m.id));
  const goneMeals = (mealTimes.data ?? []).filter((m) => !keepMeals.has(m.id)).map((m) => m.id);
  if (goneMeals.length > 0) {
    const { error } = await supabase.from("meal_times").delete().in("id", goneMeals);
    if (error) return { ok: false, error: error.message };
  }
  const realId = new Map<string, string>();
  for (const [i, m] of draft.meals.entries()) {
    const row = { name: m.name.trim(), icon: m.icon || null, usual_time: m.usual_time, minutes: m.minutes, sort_order: i + 1 };
    if (isNewId(m.id)) {
      const { data, error } = await supabase.from("meal_times").insert({ ...row, household_id: household.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      realId.set(m.id, data.id);
    } else {
      const { error } = await supabase.from("meal_times").update(row).eq("id", m.id);
      if (error) return { ok: false, error: error.message };
      realId.set(m.id, m.id);
    }
  }
  const mealId = (id: string | null) => (id ? (realId.get(id) ?? id) : null);
  const mealTime = (id: string | null) => draft.meals.find((m) => m.id === id)?.usual_time ?? null;

  // Who has which meal block on which kind of day.
  const wantedMeals = new Set(draft.mealUses.map((u) => `${mealId(u.meal_id)}|${u.member_id}|${u.day_type_id}`));
  const haveMeals = new Set<string>();
  const dropMealUses: string[] = [];
  for (const u of mealUsesNow.data ?? []) {
    if (!keepMeals.has(u.meal_time_id)) continue;
    const key = `${u.meal_time_id}|${u.member_id}|${u.day_type_id}`;
    if (wantedMeals.has(key) && !haveMeals.has(key)) haveMeals.add(key);
    else dropMealUses.push(u.id);
  }
  if (dropMealUses.length > 0) {
    const { error } = await supabase.from("meal_time_uses").delete().in("id", dropMealUses);
    if (error) return { ok: false, error: error.message };
  }
  const addMealUses = [...wantedMeals].filter((key) => !haveMeals.has(key)).map((key) => {
    const [meal_time_id, member_id, day_type_id] = key.split("|");
    return { household_id: household.id, meal_time_id, member_id, day_type_id };
  });
  if (addMealUses.length > 0) {
    const { error } = await supabase.from("meal_time_uses").insert(addMealUses);
    if (error) return { ok: false, error: error.message };
  }

  // Weekday presets (Tuesday dinner is Tacos).
  const kindIds = new Set((kinds.data ?? []).map((k) => k.id));
  const menuMealIds = new Set((menuMeals.data ?? []).map((m) => m.id));
  const presets: PresetRow[] = draft.meals.flatMap((m) =>
    m.presets.flatMap((value, weekday) => {
      if (!value) return [];
      const id = value.slice(2);
      const isKind = value.startsWith("c:");
      if (isKind ? !kindIds.has(id) : !menuMealIds.has(id)) return [];
      return [{ household_id: household.id, weekday, meal_time_id: mealId(m.id)!, category_id: isKind ? id : null, menu_meal_id: isKind ? null : id }];
    }),
  );
  const presetProblem = await writePresets(supabase, household.id, localDateOf(new Date(), household.settings.timeZone), presets);
  if (presetProblem) return { ok: false, error: presetProblem };

  // 1. Routines: delete the ones taken away, then add and update the rest.
  const keep = new Set(draft.routines.filter((r) => !isNewId(r.id)).map((r) => r.id));
  const gone = (routinesNow.data ?? []).filter((r) => !keep.has(r.id));
  if (gone.length > 0) {
    const { error } = await supabase.from("routine_templates").delete().in("id", gone.map((r) => r.id));
    if (error) return { ok: false, error: error.message };
  }
  for (const [i, r] of draft.routines.entries()) {
    const row = {
      name: r.name.trim(),
      kind: kindFor(r, mealTime(r.anchor_meal_time_id)),
      anchor: r.anchor,
      anchor_meal_time_id: r.anchor === "meal" ? mealId(r.anchor_meal_time_id) : null,
      anchor_offset: r.anchor_offset,
      usual_start: r.anchor === "clock" ? r.usual_start : null,
      usual_minutes: r.usual_minutes,
      loose: r.loose,
      habit_since: r.habit_since,
      visibility: r.visibility,
      is_template: r.is_template,
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
    const row = { text: s.text.trim(), icon: s.icon || null, habit_since: s.habit_since, daily_list: s.daily_list, position: at, target_time: null };
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
  revalidatePath("/", "layout");
  return { ok: true, ids: Object.fromEntries(realId) };
}
