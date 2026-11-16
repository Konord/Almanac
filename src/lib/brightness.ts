/*
 * The kitchen screen's brightness through the day (Connor, 2026-11-16).
 *
 * Two levels: a day level from a morning time, and a dimmer evening level
 * from an evening time. At each of those times the screen changes by
 * itself. The tray's slider still works in between, until the next change.
 * The evening can also be warmer (less blue), like a phone's night mode.
 * Overnight the screen is off (Settings › Screen saver › Overnight), and a
 * touch in the night wakes it at the evening level, since the evening runs
 * on until the morning time.
 *
 * The monitor's backlight is set by the launcher helper over the video
 * cable (DDC/CI), so only the kitchen screen does any of this.
 *
 * Kept free of other imports so `node --test` can run the tests.
 */

export type BrightnessPart = "day" | "evening";
/** The evening's warmer colour: how much the monitor's blue is turned down (none: normal colour). */
export type Warmth = "none" | "weak" | "medium" | "strong";

export type BrightnessSettings = {
  /** False: the screen stays wherever the slider puts it. */
  scheduled: boolean;
  day: { start: string; percent: number };
  evening: { start: string; percent: number; warmth: Warmth };
};

export const DEFAULT_BRIGHTNESS: BrightnessSettings = {
  scheduled: true,
  day: { start: "05:45", percent: 80 },
  evening: { start: "19:30", percent: 45, warmth: "weak" },
};

/** The levels Settings offers (big buttons, no fiddly slider). */
export const LEVEL_CHOICES = [10, 20, 30, 45, 60, 70, 80, 90, 100] as const;
/** The lowest a level may be: a black-looking screen seems broken. Off is the screen saver's job. */
export const LOWEST_PERCENT = 5;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function part(raw: unknown, fallback: { start: string; percent: number }) {
  const v = isObject(raw) ? raw : {};
  return {
    start: typeof v.start === "string" && HHMM.test(v.start) ? v.start : fallback.start,
    percent:
      typeof v.percent === "number" && Number.isInteger(v.percent) && v.percent >= LOWEST_PERCENT && v.percent <= 100 ? v.percent : fallback.percent,
  };
}

/** Reads the brightness settings from the household's settings, filling any gaps. */
export function parseBrightness(raw: unknown): BrightnessSettings {
  const v = isObject(raw) ? raw : {};
  const d = DEFAULT_BRIGHTNESS;
  return {
    scheduled: typeof v.scheduled === "boolean" ? v.scheduled : d.scheduled,
    day: part(v.day, d.day),
    evening: {
      ...part(v.evening, d.evening),
      warmth: isObject(v.evening) && (["none", "weak", "medium", "strong"] as unknown[]).includes(v.evening.warmth) ? (v.evening.warmth as Warmth) : d.evening.warmth,
    },
  };
}

/** What's wrong with the settings, in words for the screen, or null. */
export function brightnessProblem(s: BrightnessSettings): string | null {
  if (!s.scheduled) return null;
  if (!HHMM.test(s.day.start) || !HHMM.test(s.evening.start)) return "Pick when the day and the evening start.";
  if (s.day.start === s.evening.start) return "The day and the evening can't start at the same time.";
  return null;
}

/**
 * Which part of the day it is, and a name for this stretch of it that
 * changes at each start time (so the screen knows when to change by itself).
 * `date` is today's local date, `minute` the minutes since local midnight.
 */
export function brightnessNow(
  s: BrightnessSettings,
  date: string,
  minute: number,
  yesterday: string,
): { part: BrightnessPart; percent: number; warmth: Warmth; stretch: string } {
  const day = minutesOf(s.day.start);
  const evening = minutesOf(s.evening.start);
  const isDay = day < evening ? minute >= day && minute < evening : minute >= day || minute < evening;
  const p: BrightnessPart = isDay ? "day" : "evening";
  // The stretch began today, or (before its start time, when it runs past midnight) yesterday.
  const began = minute >= minutesOf(s[p].start) ? date : yesterday;
  return { part: p, percent: s[p].percent, warmth: p === "evening" ? s.evening.warmth : "none", stretch: `${began} ${p}` };
}
