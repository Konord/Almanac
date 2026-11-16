import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Household } from "@/lib/household";
import { DEFAULT_AISLES, weekDates } from "@/lib/meals";
import { clampBatches } from "@/lib/menu";
import { planGroceryLines, type PlannedDish } from "@/lib/grocery-plan";
import { measureText, needText, addUp } from "@/lib/units";
import { isNewMeal, type ReviewDraft } from "@/lib/weekly-review";
import { localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";

/*
 * Putting a week's menu on the grocery list (Connor, 2026-11-10; review
 * step Nov 15 2026). Saving the Planner first shows "Review what to buy":
 * the lines the week's meals would put on the list (previewMenuLines).
 * Anything you already have is tapped off there; then putMenuOnList saves
 * the rest, and keeps the skipped ones as hidden lines so saving the week
 * again doesn't bring them back.
 *
 *   - Every planned dish's ingredients, times its batches, added together
 *     by item ("Onions: 3", "Milk: 750 ml needed for meals"). Each line
 *     remembers its parts, so a combined line can show which meals it's for.
 *     The adding up is planGroceryLines (src/lib/grocery-plan.ts, tested).
 *
 * Things bought every so often (milk every week) are repeating groceries:
 * they put themselves on the list when due (./data.ts), review or not.
 *
 * Changing a meal and saving again redoes the week's lines, but anything
 * ticked off, cleared or skipped stays as it is, and things added by hand
 * are never touched.
 */

/** The week's planned dishes (as saved, or as the Planner's draft would save them) and the items already done. */
async function weekPlan(household: Household, week: LocalDate, draft?: ReviewDraft) {
  const supabase = await createClient();
  const dates = weekDates(week);
  const { locale, timeZone } = household.settings;

  const [meals, kept] = await Promise.all([
    supabase
      .from("meals")
      .select("id, date, status, meal_dishes(recipe_id, batches)")
      .eq("status", "planned")
      .gte("date", dates[0])
      .lte("date", dates[6]),
    // Lines already ticked off, cleared or skipped this week: the menu doesn't put them back.
    supabase.from("shopping_list").select("item_id").eq("week_of", week).or("checked.eq.true,hidden.eq.true"),
  ]);
  for (const r of [meals, kept]) if (r.error) throw r.error;
  const done = new Set((kept.data ?? []).map((k) => k.item_id));

  type Dish = { date: string; recipeId: string; batches: number };
  let dishes: Dish[] = (meals.data ?? []).flatMap((m) =>
    (m.meal_dishes ?? []).flatMap((d) => (d.recipe_id ? [{ date: m.date as string, recipeId: d.recipe_id, batches: d.batches }] : [])),
  );
  if (draft) {
    // The draft changes days from today on (as saving it does); earlier days stay as saved.
    const today = localDateOf(new Date(), timeZone);
    const open = (date: string) => date >= today && dates.includes(date);
    const changed = new Set((meals.data ?? []).filter((m) => m.id in draft.meals && open(m.date)).map((m) => m.id));
    dishes = (meals.data ?? []).flatMap((m) => {
      if (!changed.has(m.id)) return (m.meal_dishes ?? []).flatMap((d) => (d.recipe_id ? [{ date: m.date as string, recipeId: d.recipe_id, batches: d.batches }] : []));
      const now = draft.meals[m.id];
      return now ? now.dishes.flatMap((d) => (d.recipeId ? [{ date: m.date as string, recipeId: d.recipeId, batches: clampBatches(d.batches) }] : [])) : [];
    });
    for (const [id, m] of Object.entries(draft.meals)) {
      if (!isNewMeal(id) || !m || !open(m.date)) continue;
      for (const d of m.dishes) if (d.recipeId) dishes.push({ date: m.date, recipeId: d.recipeId, batches: clampBatches(d.batches) });
    }
  }

  const recipeIds = [...new Set(dishes.map((d) => d.recipeId))];
  if (recipeIds.length === 0) return { planned: [] as PlannedDish[], ingredients: [], done };
  const [recipes, ingredients] = await Promise.all([
    supabase.from("recipes").select("id, name, is_backup").in("id", recipeIds),
    supabase.from("recipe_ingredients").select("recipe_id, item_id, amount, unit").in("recipe_id", recipeIds).order("position"),
  ]);
  for (const r of [recipes, ingredients]) if (r.error) throw r.error;
  const recipe = new Map((recipes.data ?? []).map((r) => [r.id, r]));
  const day = (d: string) => new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(zonedToUtc(d, "12:00", timeZone));
  const planned: PlannedDish[] = dishes
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .flatMap((d) => {
      const r = recipe.get(d.recipeId);
      // Backup meals come from what's on hand, not the shop.
      return r ? [{ recipeId: d.recipeId, name: r.name, batches: d.batches, day: day(d.date), isBackup: r.is_backup }] : [];
    });
  return {
    planned,
    ingredients: (ingredients.data ?? []).map((i) => ({ ...i, amount: i.amount === null ? null : Number(i.amount) })),
    done,
  };
}

/** A line on "Review what to buy". */
export type PreviewLine = {
  itemId: string;
  name: string;
  icon: string | null;
  aisle: string;
  /** "3", "800 g", "1 pack" */
  need: string;
  /** The dishes it's for. More than one: it's a combined line. */
  meals: string[];
};

/** What saving the week (with this draft) would put on the grocery list, by aisle. */
export async function previewMenuLines(household: Household, week: LocalDate, draft: ReviewDraft): Promise<PreviewLine[]> {
  const { planned, ingredients, done } = await weekPlan(household, week, draft);
  const lines = planGroceryLines(planned, ingredients, done, household.settings.measures);
  if (lines.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("items").select("id, name, icon, aisle").in("id", lines.map((l) => l.item_id));
  if (error) throw error;
  const item = new Map((data ?? []).map((i) => [i.id, i]));
  const aisleOrder = (a: string) => {
    const i = (DEFAULT_AISLES as readonly string[]).indexOf(a);
    return i < 0 ? 50 : i;
  };
  return lines
    .flatMap((l) => {
      const it = item.get(l.item_id);
      if (!it) return [];
      const need = l.amount !== null || l.unit ? measureText(l.amount, l.unit) : needText(addUp(l.parts, household.settings.measures));
      return [
        {
          itemId: l.item_id,
          name: it.name,
          icon: it.icon,
          aisle: it.aisle,
          need: need.replace(/ needed for meals$/, ""),
          meals: l.meals,
        },
      ];
    })
    .toSorted((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle) || a.aisle.localeCompare(b.aisle));
}

/**
 * Puts the week's menu on the grocery list. `skipped` are items marked
 * "already have" on the review: they're written as hidden lines, so they
 * don't show and a later save doesn't put them back.
 */
export async function putMenuOnList(household: Household, week: LocalDate, skipped: readonly string[] = []): Promise<{ count: number }> {
  const supabase = await createClient();
  const { planned, ingredients, done } = await weekPlan(household, week);
  const lines = planGroceryLines(planned, ingredients, done, household.settings.measures);
  const skip = new Set(skipped);

  // The week's lines from the menu (not ticked, cleared or skipped yet) are made again.
  const { error: clearError } = await supabase
    .from("shopping_list")
    .delete()
    .eq("week_of", week)
    .eq("source", "meal")
    .eq("checked", false)
    .eq("hidden", false);
  if (clearError) throw clearError;
  if (lines.length) {
    const { error } = await supabase.from("shopping_list").insert(
      lines.map((l) => ({
        item_id: l.item_id,
        amount: l.amount,
        unit: l.unit,
        source: "meal",
        detail: l.detail || null,
        parts: l.parts as unknown as NonNullable<Json>,
        hidden: skip.has(l.item_id),
        household_id: household.id,
        week_of: week,
        status: "approved",
      })),
    );
    if (error) throw error;
  }
  return { count: lines.filter((l) => !skip.has(l.item_id)).length };
}
