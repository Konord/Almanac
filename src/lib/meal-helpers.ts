/**
 * Step helpers: timers, heads-ups, oven and doneness checks that Almanac
 * spots in the words of a recipe step. They're only suggestions: the
 * recipe card shows them with a dotted edge until you keep them.
 * Only imports plain .ts files so `node --test` can run the tests.
 */

export type HelperKind = "timer" | "heads_up" | "oven" | "doneness";

export type Helper = {
  kind: HelperKind;
  /** timer: its length. heads_up: how long before eating it's due. */
  minutes: number | null;
  /** oven and doneness: the temperature in the household's unit (°C or °F). */
  temperature: number | null;
  label: string | null;
};

/** Steps this long or longer (slow cooker, marinating) become a heads-up to start early. */
export const LONG_STEP_MINUTES = 120;

/** "Night before" as minutes before a 6 p.m. dinner (about 8 p.m. the night before). */
export const NIGHT_BEFORE_MINUTES = 22 * 60;

const UNIT = String.raw`(hours?|hrs?|h|minutes?|mins?|m)\b`;
const NUMBER = String.raw`(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|eight|ten|twelve|fifteen|twenty|thirty|forty|forty-five|half an?)`;
const DURATION = new RegExp(String.raw`\b${NUMBER}(?:\s*(?:-|–|to)\s*(\d+))?\s*${UNIT}`, "gi");

const WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  eight: 8,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  "forty-five": 45,
};

function toNumber(word: string): number {
  const w = word.toLowerCase();
  if (w.startsWith("half")) return 0.5;
  return WORDS[w] ?? Number(w);
}

/** Every length of time in a step, in minutes (a range gives its shorter end). */
export function durations(text: string): number[] {
  const found: number[] = [];
  for (const m of text.matchAll(DURATION)) {
    const n = toNumber(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const hours = /^h/i.test(m[3]);
    // "half an hour" is written with the unit "hour".
    found.push(Math.round(hours ? n * 60 : n));
  }
  return found;
}

/** A short name for a step: its first few words, e.g. "Bake" or "Simmer the sauce". */
export function shortLabel(text: string): string {
  const first = text.split(/[,.;:(]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 4).join(" ");
  return words.length > 40 ? `${words.slice(0, 39)}…` : words;
}

const MEATS: [RegExp, string][] = [
  [/\b(chicken|turkey|poultry)\b/i, "Chicken"],
  [/\b(pork)\b/i, "Pork"],
  [/\bground (beef|meat)|burgers?\b/i, "Ground beef"],
  [/\b(beef|steak|roast)\b/i, "Beef"],
  [/\b(lamb)\b/i, "Lamb"],
  [/\b(fish|salmon|cod|halibut)\b/i, "Fish"],
];

function meatLabel(text: string): string {
  for (const [re, label] of MEATS) if (re.test(text)) return label;
  return "Inside";
}

const DONENESS_WORDS = /\b(reach|reaches|reached|internal|thermometer|registers|until it reads)\b/i;
const OVEN_WORDS = /\b(oven|bake|baking|preheat|roast|broil)\b/i;

/**
 * A temperature written in a step, in the household's unit. Without a °F
 * or °C we guess from the number: ovens run about 150–260 °C or
 * 300–500 °F, and food is done well under 100 °C.
 */
function readTemperature(value: number, written: string | undefined, kind: "oven" | "doneness", want: "celsius" | "fahrenheit"): number {
  const unit = written ? written.toUpperCase() : kind === "oven" ? (value >= 300 ? "F" : "C") : value > 100 ? "F" : "C";
  if (unit === "F" && want === "celsius") return Math.round(((value - 32) * 5) / 9);
  if (unit === "C" && want === "fahrenheit") return Math.round((value * 9) / 5 + 32);
  return value;
}

/** Is this temperature an oven setting (rather than how hot the middle of the food gets)? */
function isOven(value: number, written: string | undefined, text: string): boolean {
  if (DONENESS_WORDS.test(text)) return false;
  if (written) return written.toUpperCase() === "C" ? value >= 120 : value >= 250;
  return value >= 250 || (value >= 120 && OVEN_WORDS.test(text));
}

/** The helpers Almanac spots in a step's words. */
export function spotHelpers(text: string, temperatureUnit: "celsius" | "fahrenheit" = "fahrenheit"): Helper[] {
  const helpers: Helper[] = [];
  const lower = text.toLowerCase();

  // Heads-ups: things to do well before cooking.
  if (/\b(the )?night before\b|\bthe day before\b|\bovernight\b/.test(lower)) {
    helpers.push({ kind: "heads_up", minutes: NIGHT_BEFORE_MINUTES, temperature: null, label: headsUpLabel(text) });
  }
  const ahead = /(\d+)\s*(hours?|hrs?)\s*(ahead|before|in advance|earlier)/i.exec(text);
  if (ahead) helpers.push({ kind: "heads_up", minutes: Number(ahead[1]) * 60, temperature: null, label: headsUpLabel(text) });

  // Temperatures.
  for (const m of text.matchAll(/(\d{2,3})\s*(?:°|degrees|º)\s*(?:([FC])(?:ahrenheit|elsius)?)?(?![a-z])/gi)) {
    const value = Number(m[1]);
    const written = m[2];
    if (isOven(value, written, text)) {
      if (!helpers.some((h) => h.kind === "oven")) helpers.push({ kind: "oven", minutes: null, temperature: readTemperature(value, written, "oven", temperatureUnit), label: null });
    } else {
      helpers.push({ kind: "doneness", minutes: null, temperature: readTemperature(value, written, "doneness", temperatureUnit), label: meatLabel(text) });
    }
  }

  // Times: short ones are timers; long ones (slow cooker, marinade) mean starting early.
  if (!ahead) {
    for (const minutes of durations(text)) {
      if (minutes >= LONG_STEP_MINUTES) {
        if (!helpers.some((h) => h.kind === "heads_up")) {
          helpers.push({ kind: "heads_up", minutes, temperature: null, label: `Start: ${shortLabel(text)}` });
        }
      } else {
        helpers.push({ kind: "timer", minutes, temperature: null, label: shortLabel(text) });
      }
    }
  }
  return helpers;
}

function headsUpLabel(text: string): string {
  const cleaned = text.replace(/\b(the )?night before|the day before|overnight|\d+\s*(hours?|hrs?)\s*(ahead|before|in advance|earlier)/gi, "").replace(/\s+/g, " ");
  return shortLabel(cleaned.replace(/^[\s,.-]+|[\s,.-]+$/g, "")) || "Get ready";
}

/** "45 min", "1 h 30", "Night before", "375°F" … */
export function helperText(helper: Helper, temperatureUnit: "celsius" | "fahrenheit" = "fahrenheit"): string {
  const deg = temperatureUnit === "celsius" ? "°C" : "°F";
  switch (helper.kind) {
    case "timer":
      return `Timer ${minutesText(helper.minutes ?? 0)}`;
    case "heads_up":
      return helper.minutes === NIGHT_BEFORE_MINUTES ? "Heads-up · night before" : `Heads-up · ${minutesText(helper.minutes ?? 0)} ahead`;
    case "oven":
      return `Oven ${helper.temperature}${deg}`;
    case "doneness":
      return `${helper.label ?? "Inside"} ${helper.temperature}${deg}`;
  }
}

/** 45 → "45 min", 90 → "1 h 30", 480 → "8 h". */
export function minutesText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** Safe inside temperatures, for the doneness card. */
export const DONENESS: { label: string; fahrenheit: number; celsius: number }[] = [
  { label: "Chicken and turkey", fahrenheit: 165, celsius: 74 },
  { label: "Ground beef and pork", fahrenheit: 160, celsius: 71 },
  { label: "Pork chops and roasts", fahrenheit: 145, celsius: 63 },
  { label: "Beef steak, medium", fahrenheit: 145, celsius: 63 },
  { label: "Fish", fahrenheit: 145, celsius: 63 },
  { label: "Leftovers, reheated", fahrenheit: 165, celsius: 74 },
];
