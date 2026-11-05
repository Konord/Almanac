/**
 * Bringing a recipe in from somewhere else, without any extra library:
 *
 * - Pasted text: split at "Ingredients" and "Directions", one line each.
 * - A web page: most recipe sites include a tidy copy of the recipe for
 *   search engines (schema.org "Recipe" data). We read that.
 *
 * Either way the result lands in the recipe card for checking before saving.
 * Only imports plain .ts files so `node --test` can run the tests.
 */

export type ImportedIngredient = { amount: number | null; unit: string | null; name: string; note: string | null };

export type ImportedRecipe = {
  name: string;
  serves: number | null;
  handsOnMinutes: number | null;
  totalMinutes: number | null;
  ingredients: ImportedIngredient[];
  steps: string[];
  sourceUrl: string | null;
};

// ---------------------------------------------------------------------------
// One ingredient line
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": " 1/2",
  "⅓": " 1/3",
  "⅔": " 2/3",
  "¼": " 1/4",
  "¾": " 3/4",
  "⅛": " 1/8",
};

/** Unit words → the short form we keep. */
const UNITS: [RegExp, string][] = [
  [/^(cups?|c\.?)$/i, "cup"],
  [/^(tablespoons?|tbsps?\.?|tbs\.?|T)$/, "tbsp"],
  [/^(teaspoons?|tsps?\.?|t)$/, "tsp"],
  [/^(pounds?|lbs?\.?)$/i, "lb"],
  [/^(ounces?|oz\.?)$/i, "oz"],
  [/^(grams?|g)$/i, "g"],
  [/^(kilograms?|kgs?)$/i, "kg"],
  [/^(millilitres?|milliliters?|ml)$/i, "ml"],
  [/^(litres?|liters?|l)$/i, "L"],
  [/^cloves?$/i, "clove"],
  [/^cans?$/i, "can"],
  [/^jars?$/i, "jar"],
  [/^(packets?|packages?|pkgs?\.?|envelopes?)$/i, "packet"],
  [/^bunch(es)?$/i, "bunch"],
  [/^heads?$/i, "head"],
  [/^slices?$/i, "slice"],
  [/^sticks?$/i, "stick"],
  [/^pinch(es)?$/i, "pinch"],
  [/^dash(es)?$/i, "dash"],
  [/^loa(f|ves)$/i, "loaf"],
  [/^bags?$/i, "bag"],
  [/^box(es)?$/i, "box"],
  [/^bottles?$/i, "bottle"],
  [/^pieces?$/i, "piece"],
  [/^dozen$/i, "dozen"],
];

function unitOf(word: string): string | null {
  for (const [re, unit] of UNITS) if (re.test(word)) return unit;
  return null;
}

/** "1 1/2" → 1.5, "3/4" → 0.75, "2" → 2, "1.5" → 1.5. */
export function parseNumber(text: string): number | null {
  const parts = text.trim().split(/\s+/);
  let total = 0;
  for (const p of parts) {
    const frac = /^(\d+)\/(\d+)$/.exec(p);
    if (frac) total += Number(frac[1]) / Number(frac[2]);
    else if (/^\d+(\.\d+)?$/.test(p)) total += Number(p);
    else return null;
  }
  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

/** "2 1/2 cups shredded cheddar, divided" → 2.5, cup, "shredded cheddar", "divided". */
export function parseIngredientLine(line: string): ImportedIngredient | null {
  let text = line.replace(/^[\s•*·-]+/, "").trim();
  for (const [f, r] of Object.entries(UNICODE_FRACTIONS)) text = text.replaceAll(f, r);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  // The amount: whole numbers and fractions at the start; a range keeps its first number.
  const amountMatch = /^(\d+ \d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*[\d/.]+)?\s*/.exec(text);
  let amount: number | null = null;
  if (amountMatch) {
    amount = parseNumber(amountMatch[1]);
    text = text.slice(amountMatch[0].length);
  }

  // A size in brackets after the amount, e.g. "1 (14 oz) can".
  let note: string | null = null;
  const bracket = /^\(([^)]*)\)\s*/.exec(text);
  if (bracket) {
    note = bracket[1].trim();
    text = text.slice(bracket[0].length);
  }

  // The unit, if the next word is one.
  let unit: string | null = null;
  const firstWord = /^([A-Za-z.]+)\s+/.exec(text);
  if (firstWord && amount !== null) {
    const u = unitOf(firstWord[1]);
    if (u) {
      unit = u;
      text = text.slice(firstWord[0].length).replace(/^of\s+/i, "");
    }
  }

  // Anything after a comma, or in brackets, is a note: "diced", "divided".
  const comma = text.indexOf(",");
  if (comma > 0) {
    const extra = text.slice(comma + 1).trim();
    note = note ? `${note}, ${extra}` : extra;
    text = text.slice(0, comma);
  }
  const inner = /\s*\(([^)]*)\)\s*/.exec(text);
  if (inner) {
    note = note ? `${note}, ${inner[1]}` : inner[1];
    text = text.replace(inner[0], " ");
  }
  const name = text.trim();
  if (!name) return null;
  return { amount, unit, name: name.slice(0, 60), note: note ? note.slice(0, 80) : null };
}

// ---------------------------------------------------------------------------
// Pasted text
// ---------------------------------------------------------------------------

const INGREDIENTS_HEADING = /^\s*(ingredients?)\s*:?\s*$/i;
const STEPS_HEADING = /^\s*(directions?|instructions?|method|steps|preparation|how to make it)\s*:?\s*$/i;

/** Drops "1." / "Step 2:" / bullets from the start of a step. */
function cleanStep(line: string): string {
  return line
    .replace(/^\s*(step\s*)?\d+\s*[.):-]?\s+/i, "")
    .replace(/^[\s•*·-]+/, "")
    .trim();
}

/** Splits pasted recipe text into a name, ingredients and steps. */
export function parseRecipeText(raw: string): ImportedRecipe {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const ingAt = lines.findIndex((l) => INGREDIENTS_HEADING.test(l));
  const stepsAt = lines.findIndex((l) => STEPS_HEADING.test(l));
  const before = lines.slice(0, ingAt >= 0 ? ingAt : stepsAt >= 0 ? stepsAt : 0).filter(Boolean);
  const name = before[0] ?? "";

  let ingLines: string[];
  let stepLines: string[];
  if (ingAt >= 0) {
    ingLines = lines.slice(ingAt + 1, stepsAt > ingAt ? stepsAt : undefined);
    stepLines = stepsAt > ingAt ? lines.slice(stepsAt + 1) : [];
  } else {
    // No headings: lines starting with an amount are ingredients, the rest are steps.
    const body = lines.slice(name ? 1 : 0);
    ingLines = body.filter((l) => /^[\d½¼¾⅓⅔⅛]/.test(l) && l.length < 80);
    stepLines = body.filter((l) => !ingLines.includes(l));
  }

  const servesMatch = /\b(serves|servings|makes|yield)\s*:?\s*(\d+)/i.exec(before.join(" ") + " " + raw.slice(0, 400));
  return {
    name: name.slice(0, 80),
    serves: servesMatch ? Number(servesMatch[2]) : null,
    handsOnMinutes: null,
    totalMinutes: null,
    ingredients: ingLines.filter(Boolean).map(parseIngredientLine).filter((i): i is ImportedIngredient => i !== null),
    steps: stepLines.map(cleanStep).filter((l) => l.length > 1).map((l) => l.slice(0, 400)),
    sourceUrl: null,
  };
}

// ---------------------------------------------------------------------------
// A recipe web page
// ---------------------------------------------------------------------------

/** "PT1H30M" → 90. */
export function isoMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(value.trim());
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecipe(node: Json): node is { [key: string]: Json } {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const type = node["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

function findRecipe(node: Json): { [key: string]: Json } | null {
  if (isRecipe(node)) return node;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipe(n);
      if (found) return found;
    }
  } else if (node && typeof node === "object") {
    for (const key of ["@graph", "mainEntity", "itemListElement"]) {
      if (key in node) {
        const found = findRecipe(node[key]);
        if (found) return found;
      }
    }
  }
  return null;
}

function instructionTexts(node: Json): string[] {
  if (typeof node === "string") return node.split(/\n+/).map(decodeEntities).filter(Boolean);
  if (Array.isArray(node)) return node.flatMap(instructionTexts);
  if (node && typeof node === "object") {
    if (node.itemListElement) return instructionTexts(node.itemListElement);
    if (typeof node.text === "string") return [decodeEntities(node.text)];
    if (typeof node.name === "string") return [decodeEntities(node.name)];
  }
  return [];
}

function yieldNumber(value: Json): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "number") return first;
  if (typeof first === "string") {
    const m = /\d+/.exec(first);
    return m ? Number(m[0]) : null;
  }
  return null;
}

/** The recipe in a web page's schema.org data, or null if it has none. */
export function parseRecipeHtml(html: string, url: string | null = null): ImportedRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let data: Json;
    try {
      data = JSON.parse(block[1].trim()) as Json;
    } catch {
      continue;
    }
    const recipe = findRecipe(data);
    if (!recipe) continue;
    const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
      .filter((i): i is string => typeof i === "string")
      .map((i) => parseIngredientLine(decodeEntities(i)))
      .filter((i): i is ImportedIngredient => i !== null);
    const prep = isoMinutes(recipe.prepTime);
    const cook = isoMinutes(recipe.cookTime);
    const total = isoMinutes(recipe.totalTime) ?? (prep !== null || cook !== null ? (prep ?? 0) + (cook ?? 0) : null);
    return {
      name: decodeEntities(typeof recipe.name === "string" ? recipe.name : "").slice(0, 80),
      serves: yieldNumber(recipe.recipeYield ?? null),
      handsOnMinutes: prep,
      totalMinutes: total,
      ingredients,
      steps: instructionTexts(recipe.recipeInstructions ?? null)
        .map(cleanStep)
        .filter(Boolean)
        .map((s) => s.slice(0, 400)),
      sourceUrl: url,
    };
  }
  return null;
}
