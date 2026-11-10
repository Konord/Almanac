import { formatAmount, pluralUnit } from "./meals.ts";

/*
 * Units in recipes (Connor, 2026-11-10).
 *
 * Recipes keep the units you typed: Almanac never converts them on the
 * recipe or in Cooking mode. Tapping a unit shows what it is in other
 * units, and the grocery list adds the same ingredient up across meals
 * ("Milk: 750 ml needed for meals").
 *
 * Canada mixes both systems (and often rounds them), so the values are
 * "Canadian" by default: 1 cup = 250 ml, 1 tbsp = 15 ml, 1 tsp = 5 ml,
 * 1 lb = 454 g, 1 oz = 28 g. A household can switch to US values in
 * Settings (1 cup = 237 ml).
 */

export type Measures = "canadian" | "us";

type Family = "volume" | "weight";
type UnitDef = { key: string; family: Family; /** In ml or g. */ size: Record<Measures, number> };

const UNITS: UnitDef[] = [
  { key: "ml", family: "volume", size: { canadian: 1, us: 1 } },
  { key: "L", family: "volume", size: { canadian: 1000, us: 1000 } },
  { key: "tsp", family: "volume", size: { canadian: 5, us: 4.93 } },
  { key: "tbsp", family: "volume", size: { canadian: 15, us: 14.79 } },
  { key: "cup", family: "volume", size: { canadian: 250, us: 236.6 } },
  { key: "fl oz", family: "volume", size: { canadian: 30, us: 29.57 } },
  { key: "g", family: "weight", size: { canadian: 1, us: 1 } },
  { key: "kg", family: "weight", size: { canadian: 1000, us: 1000 } },
  { key: "oz", family: "weight", size: { canadian: 28, us: 28.35 } },
  { key: "lb", family: "weight", size: { canadian: 454, us: 453.6 } },
];

/** What people type → the unit Almanac knows. */
const SPELLINGS: Record<string, string> = {
  ml: "ml", mls: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "L", litre: "L", litres: "L", liter: "L", liters: "L",
  tsp: "tsp", tsps: "tsp", t: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp", tbl: "tbsp", T: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  cup: "cup", cups: "cup", c: "cup",
  "fl oz": "fl oz", floz: "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
};

const PLAIN_PLURALS: Record<string, string> = {
  cloves: "clove", cans: "can", jars: "jar", heads: "head", bunches: "bunch", slices: "slice", sticks: "stick",
  packets: "packet", packages: "package", bags: "bag", boxes: "box", bottles: "bottle", pinches: "pinch", pieces: "piece",
};

/** The unit as Almanac spells it: "Tablespoons" → "tbsp", "cloves" → "clove", "" → null. */
export function normalUnit(unit: string | null | undefined): string | null {
  const raw = (unit ?? "").trim().replace(/\.$/, "");
  if (!raw) return null;
  // "T" (capital) is tablespoon and "t" is teaspoon, as in old cookbooks.
  if (raw === "T" || raw === "t") return SPELLINGS[raw];
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  if (lower === "each" || lower === "whole" || lower === "x") return null;
  return SPELLINGS[lower] ?? PLAIN_PLURALS[lower] ?? lower;
}

function defOf(unit: string | null): UnitDef | undefined {
  return unit ? UNITS.find((u) => u.key === unit) : undefined;
}

/** Whether a unit can be converted (cups, grams…) rather than counted (cloves, cans). */
export function isMeasure(unit: string | null | undefined): boolean {
  return defOf(normalUnit(unit)) !== undefined;
}

/** "2 cups", "1 L", "500 g", "3 cloves", "4". */
export function measureText(amount: number | null, unit: string | null): string {
  const a = formatAmount(amount);
  const u = normalUnit(unit);
  if (!a) return u ?? "";
  if (!u) return a;
  const def = defOf(u);
  // Metric and spoon units don't take an s.
  const word = def ? (u === "cup" && amount !== null && amount > 1 ? "cups" : u) : amount !== null && amount > 1 ? pluralUnit(u) : u;
  return `${a} ${word}`;
}

/** Rounds to something you'd say: 12.4 → 12, 237 → 240, 0.333 → 1/3 (via formatAmount). */
function friendly(value: number, unit: string): number {
  if (unit === "ml" || unit === "g") {
    if (value >= 100) return Math.round(value / 10) * 10;
    if (value >= 10) return Math.round(value);
    return Math.round(value * 10) / 10;
  }
  if (unit === "L" || unit === "kg") return Math.round(value * 100) / 100;
  // Spoons, cups, pounds: to the nearest eighth while small, then halves, then whole ones.
  if (value >= 10) return Math.round(value);
  if (value >= 4) return Math.round(value * 2) / 2;
  return Math.round(value * 8) / 8;
}

const SPOONS: Record<string, number> = { tsp: 1, tbsp: 3, cup: 48 };

/**
 * What an amount is in other units, for the pill you tap on a recipe:
 * 1 cup → 250 ml · 16 tbsp. Counted units (3 cloves) have none.
 */
export function conversions(amount: number | null, unit: string | null, measures: Measures = "canadian"): { amount: number; unit: string; text: string }[] {
  const def = defOf(normalUnit(unit));
  if (!def) return [];
  const base = (amount ?? 1) * def.size[measures];
  const targets: Record<string, string[]> = {
    ml: ["tsp", "tbsp", "cup"],
    L: ["cup", "ml"],
    tsp: ["ml", "tbsp"],
    tbsp: ["ml", "tsp", "cup"],
    cup: ["ml", "tbsp", "fl oz"],
    "fl oz": ["ml", "cup", "tbsp"],
    g: ["oz", "lb"],
    kg: ["lb", "g"],
    oz: ["g", "lb"],
    lb: ["g", "kg", "oz"],
  };
  return (targets[def.key] ?? [])
    .map((key) => {
      const to = UNITS.find((u) => u.key === key)!;
      // Between spoons and cups the kitchen counts hold: 1 cup = 16 tbsp, 1 tbsp = 3 tsp.
      const exact = def.key in SPOONS && key in SPOONS ? ((amount ?? 1) * SPOONS[def.key]) / SPOONS[key] : base / to.size[measures];
      const value = friendly(exact, key);
      return { amount: value, unit: key, text: measureText(value, key) };
    })
    .filter((c) => c.amount > 0 && formatAmount(c.amount) !== "" && c.amount < 10000)
    // A spoon count that's silly big (64 tsp) or a cup that's tiny isn't useful.
    .filter((c) => !((c.unit === "tsp" || c.unit === "tbsp") && c.amount > 48) && !(c.unit === "cup" && c.amount < 0.125))
    .slice(0, 3);
}

export type NeedPart = { label: string; amount: number | null; unit: string | null };
export type Need = { amount: number | null; unit: string | null };

/**
 * Adds up one ingredient across meals. Same units add as they are
 * (2 cups + 1 cup = 3 cups). Different measures of the same kind become
 * metric (1 cup + 250 ml = 500 ml; 1 lb + 500 g = 950 g). Counted things
 * add by their unit (2 onions + 1 onion = 3). What can't be added stays
 * separate ("2 + 1 cup"). "To taste" (no amount) adds nothing.
 */
export function addUp(parts: { amount: number | null; unit: string | null }[], measures: Measures = "canadian"): Need[] {
  const groups = new Map<string, { units: Set<string | null>; total: number; any: boolean; family: Family | null }>();
  for (const p of parts) {
    const unit = normalUnit(p.unit);
    const def = defOf(unit);
    const key = def ? def.family : `unit:${unit ?? ""}`;
    const g = groups.get(key) ?? { units: new Set(), total: 0, any: false, family: def?.family ?? null };
    g.units.add(unit);
    if (p.amount !== null && p.amount > 0) {
      g.total += def ? p.amount * def.size[measures] : p.amount;
      g.any = true;
    }
    groups.set(key, g);
  }
  const out: Need[] = [];
  for (const g of groups.values()) {
    const units = [...g.units];
    if (!g.any) {
      out.push({ amount: null, unit: units[0] ?? null });
      continue;
    }
    if (!g.family) {
      out.push({ amount: Math.round(g.total * 1000) / 1000, unit: units[0] ?? null });
      continue;
    }
    if (units.length === 1) {
      const def = defOf(units[0])!;
      out.push({ amount: Math.round((g.total / def.size[measures]) * 1000) / 1000, unit: def.key });
      continue;
    }
    const big = g.family === "volume" ? "L" : "kg";
    const small = g.family === "volume" ? "ml" : "g";
    out.push(g.total >= 1000 ? { amount: friendly(g.total / 1000, big), unit: big } : { amount: friendly(g.total, small), unit: small });
  }
  // Counted things first ("2 + 1 cup" reads better than "1 cup + 2").
  return out.sort((a, b) => Number(isMeasure(a.unit)) - Number(isMeasure(b.unit)));
}

/**
 * How a grocery line says what's needed. Counted things are plain ("3",
 * "2 heads"); measured things say they're for meals, since you don't buy
 * milk by the millilitre ("750 ml needed for meals").
 */
export function needText(needs: Need[]): string {
  const shown = needs.filter((n) => n.amount !== null || n.unit);
  if (shown.length === 0) return "";
  const text = shown.map((n) => measureText(n.amount, n.unit)).join(" + ");
  return shown.some((n) => isMeasure(n.unit)) ? `${text} needed for meals` : text;
}
