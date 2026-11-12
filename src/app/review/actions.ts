"use server";

import { revalidatePath } from "next/cache";
import { dayFor } from "@/lib/day-types";
import { requireHousehold } from "@/lib/household";
import { weekDates } from "@/lib/meals";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, localDateOf } from "@/lib/time";
import { clampBatches } from "@/lib/menu";
import { isNewMeal, movesFor, type DraftMeal, type ReviewDraft } from "@/lib/weekly-review";
import { loadChoreDays } from "../chores/data";
import { putMenuOnList } from "../groceries/build";
import { syncHeadsUps } from "../meals/shared";
import { loadRoutines } from "../routines/data";

export type SaveReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Confirm week: saves every change on the review in one go and marks the
 * week as reviewed (so the reminder stops). Days already over are left as
 * they were.
 *
 *   - Chore days: the week's moves are replaced by the ones the draft needs.
 *   - Kinds of day: the review's own one-day breaks are replaced; a day
 *     where someone's kind of day differs from their usual one gets a
 *     one-day break that switches it.
 *   - Meals: changed (kind, which one, who, servings), added or taken off.
 */
export async function saveReview(week: string, draft: ReviewDraft): Promise<SaveReviewResult> {
  const household = await requireHousehold();
  if (!isLocalDate(week)) return { ok: false, error: "That week isn't right." };
  const today = localDateOf(new Date(), household.settings.timeZone);
  const dates = weekDates(week).filter((d) => d >= today);
  const supabase = await createClient();
  const fail = (error: { message: string } | null) => (error ? ({ ok: false, error: error.message } as const) : null);

  if (dates.length > 0) {
    // 1. Chore days.
    const choreDays = await loadChoreDays();
    const moves = movesFor(choreDays, draft, dates);
    const bad =
      fail((await supabase.from("chore_day_moves").delete().in("date", dates)).error) ??
      (moves.length > 0 ? fail((await supabase.from("chore_day_moves").insert(moves.map((m) => ({ ...m, household_id: household.id })))).error) : null);
    if (bad) return bad;

    // 2. Kinds of day, compared with each person's usual day (without the review's own breaks).
    const routines = await loadRoutines(dates[0]);
    const own = routines.breaks.filter((b) => b.from_review && b.start_date === b.end_date && dates.includes(b.start_date));
    if (own.length > 0) {
      const gone = fail((await supabase.from("breaks").delete().in("id", own.map((b) => b.id))).error);
      if (gone) return gone;
    }
    const usual = { ...routines, breaks: routines.breaks.filter((b) => !own.includes(b)) };
    const typeById = new Map(routines.dayTypes.map((t) => [t.id, t]));
    for (const date of dates) {
      const switched = routines.members.flatMap((m) => {
        const want = draft.dayTypes[date]?.[m.id];
        const type = want ? typeById.get(want) : undefined;
        if (!type || type.member_id !== m.id || dayFor(m, usual, date).dayType?.id === type.id) return [];
        return [{ member_id: m.id, type }];
      });
      if (switched.length === 0) continue;
      const names = new Set(switched.map((s) => s.type.name.trim().toLowerCase()));
      const first = switched[0].type;
      const { data, error } = await supabase
        .from("breaks")
        .insert({
          household_id: household.id,
          name: names.size === 1 ? first.name : "Switched days",
          icon: names.size === 1 ? first.icon : "🔀",
          start_date: date,
          end_date: date,
          from_review: true,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      const people = switched.map((s) => ({ household_id: household.id, break_id: data.id, member_id: s.member_id, day_type_id: s.type.id, week_plan_id: null }));
      const bad2 = fail((await supabase.from("break_members").insert(people)).error);
      if (bad2) return bad2;
    }

    // 3. Meals: changed, added or taken off (all meal planning happens here).
    const bad3 = await saveMeals(household.id, household.settings.timeZone, draft, dates);
    if (bad3) return { ok: false, error: bad3 };
  }

  // 5. Chores put off on the chore view.
  for (const [id, delay] of Object.entries(draft.choreDelays ?? {})) {
    if (!isLocalDate(delay.date) || delay.date <= today) continue;
    if (delay.kind === "generated") {
      const bad =
        fail((await supabase.from("task_templates").update({ not_before: delay.date }).eq("id", id).eq("kind", "generated")).error) ??
        // Off today's list too, if it was on it.
        fail((await supabase.from("task_instances").delete().eq("template_id", id).eq("status", "open")).error);
      if (bad) return bad;
    } else {
      const bad = fail((await supabase.from("task_instances").update({ due_date: delay.date, date_kind: "start" }).eq("id", id).eq("status", "open").is("template_id", null)).error);
      if (bad) return bad;
    }
  }

  // 4. The week is reviewed.
  const done = fail(
    (await supabase.from("weekly_reviews").upsert({ household_id: household.id, week_start: week, reviewed_at: new Date().toISOString(), dismissed: draft.dismissed.slice(0, 100) }, { onConflict: "household_id,week_start" })).error,
  );
  if (done) return done;
  // Saving the menu puts its ingredients on the grocery list (no approve step: planning is the approval).
  try {
    await putMenuOnList(household, week);
  } catch (e) {
    return { ok: false, error: `The week is saved, but the grocery list couldn't be made: ${e instanceof Error ? e.message : "try saving again"}.` };
  }
  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "week_reviewed",
    target_type: "household",
    target_id: household.id,
    details: { week },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** A meal's own name, trimmed and short enough to keep (null: none). */
function cleanName(meal: DraftMeal): string | null {
  const name = (meal.name ?? "").trim().slice(0, 60);
  return name.length > 0 ? name : null;
}

/** Writes the draft's meals (and their dishes) on the open days. Returns a problem, or null. */
async function saveMeals(householdId: string, timeZone: string, draft: ReviewDraft, dates: string[]): Promise<string | null> {
  const entries = Object.entries(draft.meals);
  if (entries.length === 0) return null;
  const supabase = await createClient();
  const savedIds = entries.map(([id]) => id).filter((id) => !isNewMeal(id));
  const [rows, recipes, members, kinds, menuMeals] = await Promise.all([
    savedIds.length ? supabase.from("meals").select("id, date").in("id", savedIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("recipes").select("id"),
    supabase.from("members").select("id"),
    supabase.from("dish_kinds").select("id"),
    supabase.from("menu_meals").select("id"),
  ]);
  for (const r of [rows, recipes, members, kinds, menuMeals]) if (r.error) return r.error.message;
  const dateOf = new Map((rows.data ?? []).map((m) => [m.id, m.date as string]));
  const recipeIds = new Set((recipes.data ?? []).map((r) => r.id));
  const memberIds = new Set((members.data ?? []).map((m) => m.id));
  const kindIds = new Set((kinds.data ?? []).map((k) => k.id));
  const menuIds = new Set((menuMeals.data ?? []).map((m) => m.id));
  const open = new Set(dates);

  /** The dishes that can be saved: known dishes and kinds, whole batches. */
  const cleanDishes = (meal: DraftMeal) =>
    meal.dishes
      .map((d) => ({
        kind_id: d.kindId && kindIds.has(d.kindId) ? d.kindId : null,
        recipe_id: d.recipeId && recipeIds.has(d.recipeId) ? d.recipeId : null,
        batches: clampBatches(d.batches),
        spot_position: d.spot,
      }))
      .filter((d) => d.kind_id !== null || d.recipe_id !== null)
      .slice(0, 20);

  const people = async (mealId: string, meal: DraftMeal): Promise<string | null> => {
    await supabase.from("meal_members").delete().eq("meal_id", mealId);
    const chosen = meal.memberIds.filter((id) => memberIds.has(id));
    // Everyone (or nobody) ticked means everyone: no rows.
    if (chosen.length === 0 || chosen.length >= memberIds.size) return null;
    const { error } = await supabase.from("meal_members").insert(chosen.map((member_id) => ({ meal_id: mealId, member_id, household_id: householdId })));
    return error?.message ?? null;
  };

  const dishes = async (mealId: string, list: ReturnType<typeof cleanDishes>): Promise<string | null> => {
    const gone = await supabase.from("meal_dishes").delete().eq("meal_id", mealId);
    if (gone.error) return gone.error.message;
    if (list.length === 0) return null;
    const { error } = await supabase.from("meal_dishes").insert(list.map((d, position) => ({ ...d, position, meal_id: mealId, household_id: householdId })));
    return error?.message ?? null;
  };

  for (const [id, meal] of entries) {
    if (isNewMeal(id)) {
      if (!meal || !open.has(meal.date)) continue;
      const list = cleanDishes(meal);
      // A meal with nothing in it (no name, kind or dishes) isn't worth keeping.
      if (list.length === 0 && !meal.categoryId && !cleanName(meal)) continue;
      const { data, error } = await supabase
        .from("meals")
        .insert({
          household_id: householdId,
          date: meal.date,
          meal_time_id: meal.mealTimeId,
          category_id: meal.categoryId,
          menu_meal_id: meal.menuMealId && menuIds.has(meal.menuMealId) ? meal.menuMealId : null,
          recipe_id: list.find((d) => d.recipe_id)?.recipe_id ?? null,
          name: cleanName(meal),
          sort_order: 10,
        })
        .select("id")
        .single();
      if (error) return error.message;
      const bad = (await dishes(data.id, list)) ?? (await people(data.id, meal));
      if (bad) return bad;
      await syncHeadsUps(householdId, data.id, timeZone);
      continue;
    }
    const date = dateOf.get(id);
    if (!date || !open.has(date)) continue;
    if (meal === null) {
      const { error } = await supabase.from("meals").delete().eq("id", id);
      if (error) return error.message;
      continue;
    }
    const list = cleanDishes(meal);
    const { error } = await supabase
      .from("meals")
      .update({
        category_id: meal.categoryId,
        menu_meal_id: meal.menuMealId && menuIds.has(meal.menuMealId) ? meal.menuMealId : null,
        recipe_id: list.find((d) => d.recipe_id)?.recipe_id ?? null,
        servings: null,
        from_preset: false,
        name: cleanName(meal),
      })
      .eq("id", id);
    if (error) return error.message;
    const bad = (await dishes(id, list)) ?? (await people(id, meal));
    if (bad) return bad;
    await syncHeadsUps(householdId, id, timeZone);
  }
  return null;
}
