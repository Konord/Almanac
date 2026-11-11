/**
 * Small helpers for Meals that don't touch the database: weeks, amounts,
 * scaling, aisles and where a meal sits on the day.
 * Only imports plain .ts files so `node --test` can run the tests.
 */

import { addDays, type LocalDate } from "./time.ts";

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** 0 = Sunday … 6 = Saturday, for a local date. */
export function weekdayOf(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The first day of the week holding a date (Sunday or Monday first). */
export function weekStartOf(date: LocalDate, weekStartsOn: 0 | 1): LocalDate {
  const back = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addDays(date, -back);
}

/** The seven dates of the week starting on a date. */
export function weekDates(start: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/** 1.5 → "1½", 0.25 → "¼", 2 → "2", 0.4 → "0.4". */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "";
  const whole = Math.floor(value + 1e-9);
  const part = value - whole;
  if (part < 0.02) return String(whole);
  const near = FRACTIONS.find(([f]) => Math.abs(part - f) < 0.02);
  if (near) return whole > 0 ? `${whole}${near[1]}` : near[1];
  return String(Math.round(value * 100) / 100);
}

/** An amount for a whole number of batches (×1, ×2, ×3: never halved). */
export function batchAmount(amount: number | null, batches: number | null | undefined): number | null {
  if (amount === null) return null;
  const n = Math.min(3, Math.max(1, Math.round(batches ?? 1)));
  return Math.round(amount * n * 1000) / 1000;
}

/** The batch choices a dish offers. */
export const BATCHES = [1, 2, 3] as const;

/** An amount for more or fewer people than the recipe makes. */
export function scaleAmount(amount: number | null, servings: number | null | undefined, serves: number): number | null {
  if (amount === null) return null;
  if (!servings || servings === serves || serves <= 0) return amount;
  return Math.round(((amount * servings) / serves) * 1000) / 1000;
}

/** "2 cups", "1 lb", "3" or "" (for salt to taste). */
export function amountText(amount: number | null, unit: string | null): string {
  const a = formatAmount(amount);
  if (!a) return unit ?? "";
  if (!unit) return a;
  return `${a} ${amount !== null && amount > 1 ? pluralUnit(unit) : unit}`;
}

const PLURAL: Record<string, string> = {
  cup: "cups",
  clove: "cloves",
  can: "cans",
  jar: "jars",
  packet: "packets",
  package: "packages",
  bunch: "bunches",
  head: "heads",
  slice: "slices",
  stick: "sticks",
  loaf: "loaves",
  bag: "bags",
  box: "boxes",
  bottle: "bottles",
  pinch: "pinches",
  piece: "pieces",
  jug: "jugs",
  tub: "tubs",
  dozen: "dozen",
};

export function pluralUnit(unit: string): string {
  return PLURAL[unit] ?? unit;
}

// ---------------------------------------------------------------------------
// Aisles
// ---------------------------------------------------------------------------

export const DEFAULT_AISLES = ["Produce", "Meat", "Dairy", "Bakery", "Pantry", "Frozen", "Other"] as const;

const AISLE_WORDS: [RegExp, string][] = [
  [/\bfrozen\b/i, "Frozen"],
  [/\b(ice cream|popsicle|peas and carrots)\b/i, "Frozen"],
  [/\b(beef|chicken|pork|turkey|ham|bacon|sausage|steak|lamb|fish|salmon|tuna steak|shrimp|ground|mince|chops?|roast|thighs?|breasts?|drumsticks?|wings?|meatballs?|hot dogs?|deli)\b/i, "Meat"],
  [/\b(milk|cheese|cheddar|mozzarella|parmesan|ricotta|feta|butter|cream|yogurt|yoghurt|eggs?|sour cream)\b/i, "Dairy"],
  [/\b(bread|buns?|rolls?|bagels?|tortillas?|wraps?|pitas?|naan|baguette|croissants?|english muffins?|taco shells?)\b/i, "Bakery"],
  [/\b(apples?|bananas?|oranges?|lemons?|limes?|grapes?|berries|strawberries|blueberries|lettuce|spinach|kale|tomato(es)?|onions?|garlic|potato(es)?|carrots?|celery|peppers?|cucumbers?|zucchini|broccoli|cauliflower|mushrooms?|avocados?|cilantro|parsley|basil|rosemary|thyme|ginger|scallions?|green onions?|corn|squash|cabbage|herbs?)\b/i, "Produce"],
  [/\b(rice|pasta|spaghetti|macaroni|noodles?|lasagne|lasagna|flour|sugar|salt|pepper|oil|vinegar|sauce|seasoning|spices?|beans|lentils|chickpeas|stock|broth|cans?|canned|cereal|oats|crackers?|chips|peanut butter|jam|honey|syrup|ketchup|mustard|mayo|mayonnaise|salsa|soup|tomato paste|crushed tomatoes|baking|yeast|cumin|paprika|oregano|chili powder|cinnamon|vanilla)\b/i, "Pantry"],
];

/** A good first guess at the aisle for a grocery item, e.g. "ground beef" → Meat. */
export function guessAisle(name: string): string {
  for (const [re, aisle] of AISLE_WORDS) if (re.test(name)) return aisle;
  return "Other";
}

// ---------------------------------------------------------------------------
// Where a meal sits on the day
// ---------------------------------------------------------------------------

/** How long a meal's block on the timeline lasts: the eating. */
export const EATING_MINUTES = 30;

/**
 * A meal on the timeline is just the eating time (tasks rework, step 3).
 * Tidying up is an ordinary routine anchored after the meal, and there's
 * no prep block: the cook gets a "Start dinner" task instead, `cookMinutes`
 * (the recipe's hands-on time, or a sensible default) before eating.
 */
export function mealSlot(
  usualTime: string,
  recipe: { hands_on_minutes: number | null; total_minutes: number | null } | null,
  eatingMinutes: number = EATING_MINUTES,
): {
  start: number;
  minutes: number;
  cookMinutes: number;
} {
  const [h, m] = usualTime.split(":").map(Number);
  const eat = h * 60 + m;
  const cookMinutes = recipe?.hands_on_minutes ?? (recipe?.total_minutes ? Math.min(recipe.total_minutes, 60) : 30);
  return { start: eat, minutes: eatingMinutes, cookMinutes: Math.min(cookMinutes, eat) };
}
