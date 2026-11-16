import { batchAmount } from "./meals.ts";
import { partLabel } from "./menu.ts";
import { addUp, type Measures, type NeedPart } from "./units.ts";

/*
 * Working out a week's grocery lines from its planned meals, without the
 * database (Glance Planner, Nov 15 2026). Both the "Review what to buy"
 * sheet (what would go on the list) and putMenuOnList (what does) use it,
 * so the review shows exactly what Save will write.
 *
 *   - Every planned dish's ingredients, times its batches, added together
 *     by item ("Onions: 3"). Each line keeps its parts, so a combined line
 *     can show which meals it's for.
 *   - Backup dishes are left out: they come from what's on hand.
 *   - Items already ticked off or cleared this week (`done`) are left out,
 *     so saving again doesn't put them back.
 */

/** A dish planned on a day of the week. */
export type PlannedDish = { recipeId: string; name: string; batches: number; day: string; isBackup?: boolean };
/** One ingredient of a dish. */
export type PlanIngredient = { recipe_id: string; item_id: string; amount: number | null; unit: string | null };

export type PlanLine = {
  item_id: string;
  /** The added-up amount, when it comes to one amount; null otherwise (the parts say). */
  amount: number | null;
  unit: string | null;
  /** The meals it's for, by name ("Spaghetti, Beef stew"). */
  detail: string;
  /** Each meal's share ("Beef tacos · Wed", 1 pack). */
  parts: NeedPart[];
  /** The dishes it's for, each once, in the order they come up. */
  meals: string[];
};

export function planGroceryLines(
  planned: PlannedDish[],
  ingredients: PlanIngredient[],
  done: ReadonlySet<string> = new Set(),
  measures?: Measures,
): PlanLine[] {
  const partsOf = new Map<string, NeedPart[]>();
  const mealsOf = new Map<string, string[]>();
  for (const dish of planned) {
    if (dish.isBackup) continue;
    for (const ing of ingredients) {
      if (ing.recipe_id !== dish.recipeId || done.has(ing.item_id)) continue;
      const amount = batchAmount(ing.amount, dish.batches);
      partsOf.set(ing.item_id, [...(partsOf.get(ing.item_id) ?? []), { label: partLabel(dish.name, dish.batches, dish.day), amount, unit: ing.unit }]);
      const meals = mealsOf.get(ing.item_id) ?? [];
      if (!meals.includes(dish.name)) mealsOf.set(ing.item_id, [...meals, dish.name]);
    }
  }
  return [...partsOf].map(([itemId, parts]) => {
    const needs = addUp(parts, measures);
    const one = needs.length === 1 ? needs[0] : null;
    const meals = mealsOf.get(itemId) ?? [];
    return {
      item_id: itemId,
      amount: one?.amount ?? null,
      unit: one?.unit ?? null,
      detail: meals.join(", ").slice(0, 200),
      parts: parts.slice(0, 20),
      meals,
    };
  });
}
