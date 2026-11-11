/*
 * Meal blocks (Connor, 2026-11-11): Lunch, Dinner and so on live in the
 * Routine Manager, given to people's kinds of day like routines. A day
 * has a meal when someone's kind of day that day has its block, and the
 * meal is for those people.
 */

export type MealBlockUse = { meal_time_id: string; member_id: string; day_type_id: string };

/**
 * Who has each meal block on a day, given each person's kind of day
 * (member id → kind of day id). Blocks nobody has that day are left out.
 */
export function blocksOn(uses: MealBlockUse[], dayTypes: Record<string, string | null | undefined>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const u of uses) {
    if (dayTypes[u.member_id] !== u.day_type_id) continue;
    const list = out.get(u.meal_time_id) ?? [];
    if (!list.includes(u.member_id)) list.push(u.member_id);
    out.set(u.meal_time_id, list);
  }
  return out;
}

/** Who a new meal is for, as stored: nobody listed means everyone. */
export function storedEaters(eaters: string[], everyone: string[]): string[] {
  if (eaters.length === 0) return [];
  return everyone.every((id) => eaters.includes(id)) ? [] : everyone.filter((id) => eaters.includes(id));
}
