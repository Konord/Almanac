/*
 * The Meals tabs (Connor, 2026-11-15): Menu | Dishes | Backups. Meals and
 * dishes are organised here and planned in the weekly review; the grocery
 * list lives in Lists (/meals/groceries goes there). Meal times moved to
 * the Routine Manager as meal blocks (Connor, 2026-11-11).
 */
export type MealsTab = "menu" | "library" | "backups";

export const MENU_TABS: { tab: MealsTab; href: string; label: string; sub: string }[] = [
  { tab: "menu", href: "/meals/menu", label: "Menu", sub: "Menu" },
  { tab: "library", href: "/meals/library", label: "Dishes", sub: "Dishes" },
  { tab: "backups", href: "/meals/backups", label: "Backups", sub: "Backup meals" },
];
