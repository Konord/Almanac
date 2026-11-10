import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Household } from "@/lib/household";
import { batchAmount, weekDates } from "@/lib/meals";
import { partLabel } from "@/lib/menu";
import { addUp, type NeedPart } from "@/lib/units";
import { zonedToUtc, type LocalDate } from "@/lib/time";

/*
 * Putting a week's menu on the grocery list (Connor, 2026-11-10). Saving
 * the weekly review calls this: there's no approve step, because planning
 * the menu is the approval. You cross off what you already have on the
 * list itself, the same way you tick things off in the store.
 *
 *   - Every planned dish's ingredients, times its batches, added together
 *     by item ("Onions: 3", "Milk: 750 ml needed for meals"). Each line
 *     remembers its parts, so a combined line can show which meals it's for.
 *
 * Things bought every so often (milk every week) are repeating groceries:
 * they put themselves on the list when due (./data.ts), review or not.
 *
 * Changing a meal and saving again redoes the week's lines, but anything
 * ticked off (or cleared) stays as it is, and things added by hand are
 * never touched.
 */

type Line = {
  item_id: string;
  amount: number | null;
  unit: string | null;
  source: "meal";
  detail: string | null;
  parts: NeedPart[];
};

export async function putMenuOnList(household: Household, week: LocalDate): Promise<{ count: number }> {
  const supabase = await createClient();
  const dates = weekDates(week);
  const { locale, timeZone, measures } = household.settings;

  const [meals, kept] = await Promise.all([
    supabase
      .from("meals")
      .select("date, status, meal_dishes(recipe_id, batches, recipes(name, is_backup))")
      .eq("status", "planned")
      .gte("date", dates[0])
      .lte("date", dates[6]),
    // Lines already ticked off (or cleared) this week: the menu doesn't put them back.
    supabase.from("shopping_list").select("item_id").eq("week_of", week).or("checked.eq.true,hidden.eq.true"),
  ]);
  for (const r of [meals, kept]) if (r.error) throw r.error;
  const done = new Set((kept.data ?? []).map((k) => k.item_id));

  // Each planned dish, with its batches and the day it's for.
  type Planned = { recipeId: string; name: string; batches: number; day: string };
  const day = (d: string) => new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(zonedToUtc(d, "12:00", timeZone));
  const planned: Planned[] = (meals.data ?? []).flatMap((m) =>
    (m.meal_dishes ?? []).flatMap((d) => {
      const recipe = d.recipes as unknown as { name: string; is_backup: boolean } | null;
      // Backup meals come from what's on hand, not the shop.
      if (!d.recipe_id || !recipe || recipe.is_backup) return [];
      return [{ recipeId: d.recipe_id, name: recipe.name, batches: d.batches, day: day(m.date) }];
    }),
  );

  const lines: Line[] = [];
  const recipeIds = [...new Set(planned.map((p) => p.recipeId))];
  if (recipeIds.length) {
    const { data: ingredients, error } = await supabase.from("recipe_ingredients").select("recipe_id, item_id, amount, unit").in("recipe_id", recipeIds).order("position");
    if (error) throw error;
    const partsOf = new Map<string, NeedPart[]>();
    for (const dish of planned) {
      for (const ing of (ingredients ?? []).filter((i) => i.recipe_id === dish.recipeId)) {
        if (done.has(ing.item_id)) continue;
        const amount = batchAmount(ing.amount === null ? null : Number(ing.amount), dish.batches);
        partsOf.set(ing.item_id, [...(partsOf.get(ing.item_id) ?? []), { label: partLabel(dish.name, dish.batches, dish.day), amount, unit: ing.unit }]);
      }
    }
    for (const [itemId, parts] of partsOf) {
      const needs = addUp(parts, measures);
      const one = needs.length === 1 ? needs[0] : null;
      lines.push({
        item_id: itemId,
        amount: one?.amount ?? null,
        unit: one?.unit ?? null,
        source: "meal",
        detail: [...new Set(parts.map((p) => p.label.split(" · ")[0].replace(/ ×\d$/, "")))].join(", ").slice(0, 200),
        parts: parts.slice(0, 20),
      });
    }
  }

  // The week's lines from the menu (not ticked yet) are made again.
  const { error: clearError } = await supabase
    .from("shopping_list")
    .delete()
    .eq("week_of", week)
    .eq("source", "meal")
    .eq("checked", false)
    .eq("hidden", false);
  if (clearError) throw clearError;
  if (lines.length) {
    const { error } = await supabase
      .from("shopping_list")
      .insert(lines.map((l) => ({ ...l, parts: l.parts as unknown as NonNullable<Json>, household_id: household.id, week_of: week, status: "approved" })));
    if (error) throw error;
  }
  return { count: lines.length };
}
