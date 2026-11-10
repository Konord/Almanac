/*
 * The Menu Manager's tabs (Connor, 2026-11-10): meals and dishes are
 * organised here; they're planned in the weekly review, and the grocery
 * list lives in the List Manager.
 */
export type MealsTab = "menu" | "library" | "backups" | "setup";

export const MENU_TABS: { tab: MealsTab; href: string; label: string }[] = [
  { tab: "menu", href: "/meals/menu", label: "Meals" },
  { tab: "library", href: "/meals/library", label: "Dishes" },
  { tab: "backups", href: "/meals/backups", label: "Backup meals" },
  { tab: "setup", href: "/meals/setup", label: "Meal times" },
];
