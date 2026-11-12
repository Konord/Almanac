import { seasonOf, type Season } from "./chores.ts";
import { birthdayDate, holidayDate, type HolidayRule } from "./holidays.ts";
import type { LocalDate } from "./time.ts";

/*
 * The art screen saver (Connor, 2026-11-12). Like a Samsung Frame TV: the
 * kitchen screen shows a painting in a thin white mat. It comes on after
 * no one has touched the screen for a while, during dinner (or other meal
 * blocks), at set times, and overnight (or the screen turns off then).
 * One tap anywhere goes straight back to Almanac.
 *
 * The paintings are image files in folders on the computer that runs
 * Almanac (the ART_FOLDER setting in .env.local). Folders are found by
 * name, nothing to set up:
 *   General                        any day
 *   Spring, Summer, Autumn/Fall, Winter   in that season
 *   a holiday's name ("Halloween") on and before that holiday
 *   a birthday's name ("Ava")      on that birthday only
 *
 * Each holiday has two numbers on the Holidays screen: for how many days
 * before it ONLY its art shows, and for how many days before that its art
 * is mixed in with the rest.
 *
 * This file holds the plain rules, so they can be tested.
 */

export type MatColour = "white" | "cream" | "charcoal";
export type PaintingEvery = "day" | "twice" | "2h" | "start";
export type SeasonalShare = "rarely" | "half" | "mostly";
export type OvernightMode = "none" | "art" | "off";

/** A set time the screen saver comes on: on these weekdays (0 = Sunday), from start to end ("HH:MM"). */
export type SetTime = { days: number[]; start: string; end: string };

export type ScreenSaverSettings = {
  /** Minutes with no touch before the art comes on (0: never, only at the times below). */
  idleMinutes: number;
  /** Meal blocks during which the art shows (their eating time). Null: the block called Dinner. */
  duringMeals: string[] | null;
  /** In a meal or a set time, how long after a tap before the art comes back. */
  backAfterMinutes: number;
  times: SetTime[];
  overnight: { mode: OvernightMode; start: string; end: string };
  /** How often the painting changes. */
  every: PaintingEvery;
  /** On ordinary days, how often the painting is seasonal rather than General. */
  seasonal: SeasonalShare;
  mat: MatColour;
};

export const DEFAULT_SCREEN_SAVER: ScreenSaverSettings = {
  idleMinutes: 10,
  duringMeals: null,
  backAfterMinutes: 2,
  times: [],
  overnight: { mode: "off", start: "23:00", end: "06:00" },
  every: "day",
  seasonal: "half",
  mat: "white",
};

export const IDLE_CHOICES = [0, 5, 10, 15, 30, 60] as const;
export const BACK_AFTER_CHOICES = [1, 2, 5, 10] as const;
/** The most set times (one column of the Settings card, nothing scrolls). */
export const MAX_SET_TIMES = 3;
/** The most days before a holiday its art can show. */
export const MAX_ONLY_DAYS = 14;
export const MAX_MIX_DAYS = 60;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function isSetTime(v: unknown): v is SetTime {
  if (!isObject(v)) return false;
  const days = v.days;
  return (
    Array.isArray(days) &&
    days.length > 0 &&
    days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) &&
    typeof v.start === "string" &&
    TIME.test(v.start) &&
    typeof v.end === "string" &&
    TIME.test(v.end) &&
    v.start !== v.end
  );
}

/** Reads the screen saver settings from the household's settings, filling any gaps. */
export function parseScreenSaver(raw: unknown): ScreenSaverSettings {
  const v = isObject(raw) ? raw : {};
  const d = DEFAULT_SCREEN_SAVER;
  const night = isObject(v.overnight) ? v.overnight : {};
  return {
    idleMinutes: typeof v.idleMinutes === "number" && Number.isInteger(v.idleMinutes) && v.idleMinutes >= 0 && v.idleMinutes <= 240 ? v.idleMinutes : d.idleMinutes,
    duringMeals:
      v.duringMeals === null || v.duringMeals === undefined
        ? null
        : Array.isArray(v.duringMeals) && v.duringMeals.length <= 20 && v.duringMeals.every((x) => typeof x === "string")
          ? (v.duringMeals as string[])
          : null,
    backAfterMinutes:
      typeof v.backAfterMinutes === "number" && Number.isInteger(v.backAfterMinutes) && v.backAfterMinutes >= 1 && v.backAfterMinutes <= 60 ? v.backAfterMinutes : d.backAfterMinutes,
    times: Array.isArray(v.times) ? v.times.filter(isSetTime).slice(0, MAX_SET_TIMES) : d.times,
    overnight: {
      mode: night.mode === "none" || night.mode === "art" || night.mode === "off" ? night.mode : d.overnight.mode,
      start: typeof night.start === "string" && TIME.test(night.start) ? night.start : d.overnight.start,
      end: typeof night.end === "string" && TIME.test(night.end) ? night.end : d.overnight.end,
    },
    every: v.every === "day" || v.every === "twice" || v.every === "2h" || v.every === "start" ? v.every : d.every,
    seasonal: v.seasonal === "rarely" || v.seasonal === "half" || v.seasonal === "mostly" ? v.seasonal : d.seasonal,
    mat: v.mat === "white" || v.mat === "cream" || v.mat === "charcoal" ? v.mat : d.mat,
  };
}

/** What's wrong with the settings, in words for the screen, or null. */
export function screenSaverProblem(s: ScreenSaverSettings): string | null {
  for (const t of s.times) {
    if (t.days.length === 0) return "Pick at least one day for each set time.";
    if (!TIME.test(t.start) || !TIME.test(t.end)) return "Each set time needs a start and an end.";
    if (t.start === t.end) return "A set time can't start and end at the same time.";
  }
  if (s.times.length > MAX_SET_TIMES) return `Up to ${MAX_SET_TIMES} set times.`;
  if (s.overnight.mode !== "none" && s.overnight.start === s.overnight.end) return "Overnight can't start and end at the same time.";
  return null;
}

// ---------------------------------------------------------------------------
// When it's on
// ---------------------------------------------------------------------------

/** "HH:MM" as minutes after midnight. */
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Whether a minute of the day is in a window that may cross midnight (start included, end not). */
export function inWindow(minute: number, start: string, end: string): boolean {
  const a = toMinutes(start);
  const b = toMinutes(end);
  return a <= b ? minute >= a && minute < b : minute >= a || minute < b;
}

/** A meal's eating time today, as minutes after midnight. */
export type MealWindow = { start: number; end: number };

export type SaverInput = {
  /** Minutes after midnight, and the weekday (0 = Sunday), in the household's time zone. */
  minute: number;
  weekday: number;
  /** Milliseconds since the screen was last touched. */
  idleMs: number;
  settings: ScreenSaverSettings;
  meals: MealWindow[];
  /** An app (Jellyfin, a game) is open on top of Almanac. */
  appOpen: boolean;
};

/** Why it's on now, for the screen saver to decide: art, screen off, or nothing. */
export type SaverMode = "none" | "art" | "off";

/** Whether a set time covers now (one that crosses midnight belongs to the day it starts on). */
function inSetTime(t: SetTime, minute: number, weekday: number): boolean {
  const a = toMinutes(t.start);
  const b = toMinutes(t.end);
  if (a < b) return t.days.includes(weekday) && minute >= a && minute < b;
  return (t.days.includes(weekday) && minute >= a) || (t.days.includes((weekday + 6) % 7) && minute < b);
}

/**
 * What the screen should show now. During a meal, a set time or
 * overnight, the art comes on (or back) once nobody has touched the screen
 * for a short while; the rest of the time it waits the longer idle time.
 * Nothing happens while an app is open, so it never covers a film.
 */
export function saverMode(i: SaverInput): SaverMode {
  if (i.appOpen) return "none";
  const s = i.settings;
  const back = s.backAfterMinutes * 60_000;
  if (s.overnight.mode !== "none" && inWindow(i.minute, s.overnight.start, s.overnight.end)) {
    return i.idleMs >= back ? s.overnight.mode : "none";
  }
  const scheduled = i.meals.some((m) => i.minute >= m.start && i.minute < m.end) || s.times.some((t) => inSetTime(t, i.minute, i.weekday));
  if (scheduled) return i.idleMs >= back ? "art" : "none";
  return s.idleMinutes > 0 && i.idleMs >= s.idleMinutes * 60_000 ? "art" : "none";
}

/** Which meal blocks count, when the setting is "the one called Dinner". */
export function dinnerBlocks(times: { id: string; name: string }[]): string[] {
  const dinner = times.filter((t) => /dinner|supper/i.test(t.name));
  return dinner.map((t) => t.id);
}

// ---------------------------------------------------------------------------
// Which painting
// ---------------------------------------------------------------------------

/**
 * The name a painting is picked for: the date, plus the half day or the
 * two hours when it changes more often. "Each time it starts" uses the
 * moment it started, so every start is new.
 */
export function slotFor(every: PaintingEvery, date: LocalDate, minute: number, startedAt: string | null): string {
  switch (every) {
    case "day":
      return date;
    case "twice":
      return `${date} ${minute < 12 * 60 ? "am" : "pm"}`;
    case "2h":
      return `${date} ${String(Math.floor(minute / 120) * 2).padStart(2, "0")}h`;
    case "start":
      return `start ${startedAt ?? date}`;
  }
}

/** A name with case, spaces, apostrophes and the like taken out, so "Valentines day" finds "Valentine's Day". */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const SEASON_NAMES: Record<string, Season> = { spring: "spring", summer: "summer", autumn: "fall", fall: "fall", winter: "winter" };

export type ArtFolder = { name: string; files: string[] };
export type HolidayArt = { id: string; name: string; rule: HolidayRule; art_only_days: number; art_mix_days: number };
export type BirthdayArt = { id: string; name: string; month: number; day: number };

/** What a folder is for, found from its name. */
export type FolderUse =
  | { kind: "general" }
  | { kind: "season"; season: Season }
  | { kind: "holiday"; holidayId: string; name: string }
  | { kind: "birthday"; birthdayId: string; name: string }
  | { kind: "none" };

/** Holiday folders can leave off "Day": "Christmas" is Christmas Day's folder. */
const holidayKey = (name: string) => nameKey(name).replace(/day$/, "");

/** Birthday folders may also be called "Ava's birthday" or "Ava birthday". */
const birthdayKey = (name: string) => nameKey(name).replace(/s?birthday$/, "");

export function folderUse(folder: string, holidays: { id: string; name: string }[], birthdays: { id: string; name: string }[]): FolderUse {
  const key = nameKey(folder);
  if (!key) return { kind: "none" };
  if (key === "general") return { kind: "general" };
  if (SEASON_NAMES[key]) return { kind: "season", season: SEASON_NAMES[key] };
  const h = holidays.find((x) => holidayKey(x.name) === holidayKey(folder));
  if (h) return { kind: "holiday", holidayId: h.id, name: h.name };
  const b = birthdays.find((x) => nameKey(x.name) && (nameKey(x.name) === key || nameKey(x.name) === birthdayKey(folder)));
  if (b) return { kind: "birthday", birthdayId: b.id, name: b.name };
  return { kind: "none" };
}

/** The folder a holiday or birthday uses (by name), if there is one with paintings in it. */
export function folderNamed(folders: ArtFolder[], name: string, birthday = false): ArtFolder | null {
  const key = nameKey(name);
  if (!key) return null;
  return (
    folders.find(
      (f) => f.files.length > 0 && (nameKey(f.name) === key || (birthday ? birthdayKey(f.name) === key : holidayKey(f.name) === holidayKey(name))),
    ) ?? null
  );
}

const SHARE: Record<SeasonalShare, number> = { rarely: 0.25, half: 0.5, mostly: 0.75 };

/** Days from one date to a later one. */
function daysUntil(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** A group of paintings a day can pick from, and why. */
export type ArtChoice = { label: string; why: "birthday" | "holiday" | "mixed in" | "season" | "general"; files: string[]; weight: number };

/**
 * The groups of paintings a date picks from. A birthday with a folder
 * shows only that folder. A holiday within its "only this art" days shows
 * only its own (the nearest one, if two overlap). Any other day picks
 * General or seasonal, where seasonal means the season's folder and any
 * holiday that's mixing in, shared equally. A day with none of those
 * picks from everything else, so there's always a painting.
 */
export function artChoices(date: LocalDate, folders: ArtFolder[], holidays: HolidayArt[], birthdays: BirthdayArt[], seasonal: SeasonalShare): ArtChoice[] {
  const year = Number(date.slice(0, 4));
  for (const b of birthdays) {
    if (birthdayDate(b, year) !== date) continue;
    const f = folderNamed(folders, b.name, true);
    if (f) return [{ label: b.name, why: "birthday", files: f.files, weight: 1 }];
  }

  let only: { h: HolidayArt; f: ArtFolder; days: number } | null = null;
  const mixing: ArtChoice[] = [];
  for (const h of holidays) {
    const f = folderNamed(folders, h.name);
    if (!f) continue;
    // This year's date, or next year's for New Year's Day seen from December.
    const next = [holidayDate(h.rule, year), holidayDate(h.rule, year + 1)].find((d): d is LocalDate => d !== null && d >= date);
    if (!next) continue;
    const days = daysUntil(date, next);
    if (days <= h.art_only_days) {
      if (!only || days < only.days) only = { h, f, days };
    } else if (days <= Math.max(h.art_mix_days, h.art_only_days)) {
      mixing.push({ label: h.name, why: "mixed in", files: f.files, weight: 0 });
    }
  }
  if (only) return [{ label: only.h.name, why: "holiday", files: only.f.files, weight: 1 }];

  const general = folders.find((f) => f.files.length > 0 && nameKey(f.name) === "general");
  const season = seasonOf(date).season;
  const seasonFolder = folders.find((f) => f.files.length > 0 && SEASON_NAMES[nameKey(f.name)] === season);
  const side: ArtChoice[] = [...(seasonFolder ? [{ label: seasonFolder.name, why: "season" as const, files: seasonFolder.files, weight: 0 }] : []), ...mixing];
  const share = general ? (side.length ? SHARE[seasonal] : 0) : 1;
  const out: ArtChoice[] = side.map((c) => ({ ...c, weight: share / side.length }));
  if (general && share < 1) out.push({ label: general.name, why: "general", files: general.files, weight: 1 - share });
  const found = out.filter((c) => c.weight > 0 && c.files.length > 0);
  if (found.length) return found;

  // Nothing for today (no General folder yet, say): any painting that isn't
  // saved for a holiday or a birthday, or failing that, any painting at all.
  const kept = new Set([...holidays.map((h) => folderNamed(folders, h.name)), ...birthdays.map((b) => folderNamed(folders, b.name, true))]);
  const free = folders.filter((f) => !kept.has(f)).flatMap((f) => f.files);
  const any = free.length ? free : folders.flatMap((f) => f.files);
  return any.length ? [{ label: "All paintings", why: "general", files: any, weight: 1 }] : [];
}

/**
 * Picks a painting: first a group by its weight (so 3 Halloween
 * paintings aren't lost among 400 general ones), then a painting in it.
 * Paintings never shown come first; once all have been, one from the
 * quarter shown longest ago, so nothing repeats until its turn comes round.
 */
export function pickPainting(choices: ArtChoice[], lastShown: Map<string, string>, random: () => number = Math.random): { file: string; choice: ArtChoice } | null {
  const total = choices.reduce((n, c) => n + c.weight, 0);
  if (total <= 0) return null;
  let r = random() * total;
  const choice = choices.find((c) => (r -= c.weight) < 0) ?? choices[choices.length - 1];
  const fresh = choice.files.filter((f) => !lastShown.has(f));
  let pool = fresh;
  if (pool.length === 0) {
    const byAge = choice.files.toSorted((a, b) => lastShown.get(a)!.localeCompare(lastShown.get(b)!));
    pool = byAge.slice(0, Math.max(1, Math.ceil(byAge.length / 4)));
  }
  const file = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return { file, choice };
}

/** Days before a holiday, cleaned for saving. */
export function cleanArtDays(only: number, mix: number): { only: number; mix: number } {
  const o = Math.max(0, Math.min(MAX_ONLY_DAYS, Math.round(only) || 0));
  const m = Math.max(0, Math.min(MAX_MIX_DAYS, Math.round(mix) || 0));
  return { only: o, mix: m };
}

