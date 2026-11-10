/*
 * Dishes and meals (Connor, 2026-11-10), without the database.
 *
 * A dish is one recipe. A meal on the menu is a list of spots: each spot
 * is a set dish ("Mashed potatoes") or one you pick from a kind ("any
 * Veggie"). A planned meal copies its menu meal's spots into dishes of
 * its own, so swapping a side changes that day only. Open spots start on
 * whatever was picked the last time that meal was planned.
 */

export type SpotLike = { position: number; kind_id: string | null; recipe_id: string | null; batches: number };
export type MenuMealLike = { id: string; name: string | null; icon: string | null; category_ids: string[]; spots: SpotLike[] };
export type DishLike = { id: string; name: string; icon: string | null; kind_ids: string[]; is_backup?: boolean };

/** A dish on a planned meal, as the weekly review keeps it. */
export type DraftDish = {
  /** What it fills (Main, Veggie…); null for a dish added with no kind. */
  kindId: string | null;
  /** Null while it's still to pick. */
  recipeId: string | null;
  /** ×1, ×2 or ×3. */
  batches: number;
  /** The menu meal's spot it fills; null for a dish added on the day. */
  spot: number | null;
};

/** The key "last time's pick" is kept under. */
export function pickKey(menuMealId: string, spot: number): string {
  return `${menuMealId}|${spot}`;
}

/** Whole batches only: 1, 2 or 3. */
export function clampBatches(n: unknown): number {
  const v = typeof n === "number" ? Math.round(n) : Number.parseInt(String(n), 10);
  return Number.isFinite(v) ? Math.min(3, Math.max(1, v)) : 1;
}

/** A menu meal's name: its own, else its first set dish's. */
export function menuMealName(meal: MenuMealLike, dishes: Map<string, DishLike>): string {
  if (meal.name?.trim()) return meal.name.trim();
  const first = meal.spots.toSorted((a, b) => a.position - b.position).find((s) => s.recipe_id && dishes.has(s.recipe_id));
  return first ? dishes.get(first.recipe_id!)!.name : "Meal";
}

/** Its picture: its own, else its first set dish's. */
export function menuMealIcon(meal: MenuMealLike, dishes: Map<string, DishLike>): string | null {
  if (meal.icon) return meal.icon;
  const first = meal.spots.toSorted((a, b) => a.position - b.position).find((s) => s.recipe_id && dishes.has(s.recipe_id));
  return first ? (dishes.get(first.recipe_id!)!.icon ?? null) : null;
}

/** "One dish", "3 set dishes", "2 set, 1 to pick". */
export function spotSummary(meal: MenuMealLike): string {
  const set = meal.spots.filter((s) => s.recipe_id).length;
  const open = meal.spots.length - set;
  if (meal.spots.length === 1 && set === 1) return "One dish";
  if (open === 0) return `${set} set dishes`;
  if (set === 0) return `${open} to pick`;
  return `${set} set, ${open} to pick`;
}

/** The dishes a planned meal starts with: the set ones, and last time's picks for the open spots. */
export function startDishes(meal: MenuMealLike, lastPicks: Map<string, string> = new Map(), known?: Set<string>): DraftDish[] {
  return meal.spots
    .toSorted((a, b) => a.position - b.position)
    .map((s) => {
      const last = s.recipe_id ? null : (lastPicks.get(pickKey(meal.id, s.position)) ?? null);
      const recipeId = s.recipe_id ?? (last && (!known || known.has(last)) ? last : null);
      return { kindId: s.kind_id, recipeId, batches: clampBatches(s.batches), spot: s.position };
    });
}

/** The dishes that can fill a kind (all of them for no kind), backups left out. */
export function dishesOfKind<D extends DishLike>(dishes: D[], kindId: string | null): D[] {
  return dishes.filter((d) => !d.is_backup && (kindId === null || d.kind_ids.includes(kindId)));
}

/** The menu meals under a kind of meal (category), or every one for null. */
export function mealsUnder<M extends MenuMealLike>(meals: M[], categoryId: string | null): M[] {
  return categoryId === null ? meals : meals.filter((m) => m.category_ids.includes(categoryId));
}

/** Whether a planned meal still has a dish to pick. */
export function hasOpenDish(dishes: DraftDish[]): boolean {
  return dishes.some((d) => d.recipeId === null);
}

/** The first picked dish: what Today, the calendar and Cooking mode call the meal. */
export function mainDish(dishes: DraftDish[]): string | null {
  return dishes.find((d) => d.recipeId !== null)?.recipeId ?? null;
}

/** The spots a "Save as meal" makes from the dishes on a planned meal (open ones stay open). */
export function spotsFrom(dishes: DraftDish[]): SpotLike[] {
  return dishes
    .filter((d) => d.recipeId !== null || d.kindId !== null)
    .map((d, i) => ({ position: i, kind_id: d.kindId, recipe_id: d.recipeId, batches: clampBatches(d.batches) }));
}

/**
 * Last time's picks: for each menu meal's open spot, the dish picked the
 * most recent time it was planned. `history` is newest first.
 */
export function lastPicksFrom(history: { menu_meal_id: string | null; spot_position: number | null; recipe_id: string | null }[]): Map<string, string> {
  const picks = new Map<string, string>();
  for (const h of history) {
    if (!h.menu_meal_id || h.spot_position === null || !h.recipe_id) continue;
    const key = pickKey(h.menu_meal_id, h.spot_position);
    if (!picks.has(key)) picks.set(key, h.recipe_id);
  }
  return picks;
}

/** "Beef tacos ×2 · Tue": a dish's line on the grocery list's breakdown. */
export function partLabel(dishName: string, batches: number, day: string): string {
  return `${dishName}${batches > 1 ? ` ×${batches}` : ""} · ${day}`;
}
