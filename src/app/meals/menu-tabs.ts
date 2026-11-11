/*
 * The Menu Manager's tabs (Connor, 2026-11-10): meals and dishes are
 * organised here; they're planned in the weekly review, and the grocery
 * list lives in the List Manager. Backup meals are hidden for now (Connor,
 * 2026-11-10); their screen stays at /meals/backups for when they return.
 * Meal times moved to the Routine Manager as meal blocks (Connor, 2026-11-11).
 */
export type MealsTab = "menu" | "library" | "backups";

export const MENU_TABS: { tab: MealsTab; href: string; label: string }[] = [
  { tab: "menu", href: "/meals/menu", label: "Meals" },
  { tab: "library", href: "/meals/library", label: "Dishes" },
];
