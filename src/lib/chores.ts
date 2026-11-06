/**
 * When each chore is next due. Chores come back a set time after they were
 * last done ("clean the fridge about monthly"), or once a year inside a
 * season window ("winter tires on, Oct 15 to Nov 30").
 *
 * Skipping counts like doing for the clock: the chore simply comes back
 * next time instead of piling up as overdue (the design doc's "skip
 * without guilt"). Free of other imports so `node --test` can run the tests.
 */
import { addMonths, dayOfWeek } from "./calendar-layout.ts";
import { addDays, type LocalDate } from "./time.ts";

export type RepeatUnit = "day" | "week" | "month" | "year";
export type EnergyMode = "normal" | "low" | "survival";

const ENERGY_LEVEL: Record<EnergyMode, number> = { survival: 0, low: 1, normal: 2 };

/**
 * Whether a chore shows on a day with this energy mode. A chore's
 * min_energy_mode is the hardest kind of day it still shows on: "normal"
 * chores hide on low and survival days, "low" ones hide on survival days.
 */
export function showsInMode(minMode: EnergyMode, dayMode: EnergyMode): boolean {
  return ENERGY_LEVEL[dayMode] >= ENERGY_LEVEL[minMode];
}
export type ChoreSize = "small" | "medium" | "big";

export type ChoreRule = {
  repeat_every: number;
  repeat_unit: RepeatUnit;
  /** 0 = Sunday … 6 = Saturday, or null for any day. */
  preferred_weekday: number | null;
  /** "MM-DD", or null when the chore has no season. */
  season_start: string | null;
  season_end: string | null;
  /** For a chore never done: the first day it's due (else today). */
  first_due?: LocalDate | null;
};

/** A done or skipped round of a chore. */
export type ChoreRound = { status: "done" | "skipped"; completed_on: LocalDate };

export type ChoreState =
  /** Due today or earlier. */
  | "due"
  /** Due within the next two weeks. */
  | "soon"
  /** Not for a while. */
  | "later";

export type ChoreTiming = {
  state: ChoreState;
  /** The date it's (next) due. */
  dueOn: LocalDate;
  /** Days since it fell due (0 when due today or not yet due). */
  daysOverdue: number;
  /** The newest done round, if any. */
  lastDone: LocalDate | null;
  /** For seasonal chores: the window it's due in. */
  window: { start: LocalDate; end: LocalDate } | null;
};

/** How far ahead "soon" looks. */
export const SOON_DAYS = 14;

export const SIZE_LABEL: Record<ChoreSize, string> = { small: "Small", medium: "Medium", big: "Big" };

export const UNIT_LABEL: Record<RepeatUnit, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
  year: ["year", "years"],
};

/** Whole days from a to b (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const t = (d: LocalDate) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** A date plus N days/weeks/months/years. */
export function addInterval(date: LocalDate, every: number, unit: RepeatUnit): LocalDate {
  switch (unit) {
    case "day":
      return addDays(date, every);
    case "week":
      return addDays(date, every * 7);
    case "month":
      return addMonths(date, every);
    case "year":
      return addMonths(date, every * 12);
  }
}

/** The preferred weekday nearest to `date` (up to 3 days either way). */
function nearestWeekday(date: LocalDate, weekday: number): LocalDate {
  let diff = (weekday - dayOfWeek(date) + 7) % 7; // 0..6 forward
  if (diff > 3) diff -= 7; // closer going back
  return addDays(date, diff);
}

/** The next date on or after `date` that falls on `weekday`. */
function onOrAfterWeekday(date: LocalDate, weekday: number): LocalDate {
  return addDays(date, (weekday - dayOfWeek(date) + 7) % 7);
}

/** "MM-DD" in a given year, moving Feb 29 to Feb 28 in other years. */
function inYear(monthDay: string, year: number): LocalDate {
  const [m, d] = monthDay.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * The season window that contains `today`, or else the next one to come.
 * A window may wrap past New Year (e.g. "12-01" to "02-28").
 */
export function seasonWindow(start: string, end: string, today: LocalDate): { start: LocalDate; end: LocalDate } {
  const year = Number(today.slice(0, 4));
  const wraps = end < start;
  for (const y of [year - 1, year, year + 1]) {
    const window = { start: inYear(start, y), end: inYear(end, wraps ? y + 1 : y) };
    if (today <= window.end) return window;
  }
  return { start: inYear(start, year + 1), end: inYear(end, wraps ? year + 2 : year + 1) };
}

function stateFor(dueOn: LocalDate, today: LocalDate): ChoreState {
  if (dueOn <= today) return "due";
  return daysBetween(today, dueOn) <= SOON_DAYS ? "soon" : "later";
}

/** When a chore is next due, from its rule and its past rounds. */
export function choreTiming(rule: ChoreRule, rounds: ChoreRound[], today: LocalDate): ChoreTiming {
  const latest = (status?: ChoreRound["status"]) =>
    rounds
      .filter((r) => !status || r.status === status)
      .map((r) => r.completed_on)
      .sort()
      .at(-1) ?? null;
  const lastDone = latest("done");
  const lastRound = latest();

  if (rule.season_start && rule.season_end) {
    const window = seasonWindow(rule.season_start, rule.season_end, today);
    const handled = lastRound !== null && lastRound >= window.start;
    if (handled || today < window.start) {
      // Done for this season (or the season hasn't started): next window.
      const next = handled ? seasonWindow(rule.season_start, rule.season_end, addDays(window.end, 1)) : window;
      return { state: stateFor(next.start, today), dueOn: next.start, daysOverdue: 0, lastDone, window: next };
    }
    return { state: "due", dueOn: window.start, daysOverdue: daysBetween(window.start, today), lastDone, window };
  }

  let dueOn: LocalDate;
  if (lastRound === null) {
    // Never done: due now (or from its first day), on its weekday if it has one.
    const from = rule.first_due ?? today;
    dueOn = rule.preferred_weekday === null ? from : onOrAfterWeekday(from, rule.preferred_weekday);
  } else {
    dueOn = addInterval(lastRound, rule.repeat_every, rule.repeat_unit);
    if (rule.preferred_weekday !== null && rule.repeat_unit !== "day") {
      dueOn = nearestWeekday(dueOn, rule.preferred_weekday);
      if (dueOn <= lastRound) dueOn = addDays(dueOn, 7);
    }
  }
  const state = stateFor(dueOn, today);
  return { state, dueOn, daysOverdue: state === "due" ? daysBetween(dueOn, today) : 0, lastDone, window: null };
}

/** "Every week", "Every 3 months", "Once a year, Oct 15 – Nov 30" (dates already formatted). */
export function describeRepeat(rule: ChoreRule, seasonLabel?: string): string {
  if (rule.season_start && rule.season_end) return `Once a year${seasonLabel ? `, ${seasonLabel}` : ""}`;
  const [one, many] = UNIT_LABEL[rule.repeat_unit];
  return rule.repeat_every === 1 ? `Every ${one}` : `Every ${rule.repeat_every} ${many}`;
}

/** Starter chores are spread over at most four weeks, so day one isn't everything at once. */
const STARTER_SPREAD_DAYS = 28;

/**
 * The first due date for a starter chore that hasn't been done yet: a
 * steady pick between the day it was added and one interval later
 * (at most four weeks), so the starter list arrives a few at a time.
 */
export function starterFirstDue(id: string, addedOn: LocalDate, rule: Pick<ChoreRule, "repeat_every" | "repeat_unit">): LocalDate {
  const intervalDays = daysBetween(addedOn, addInterval(addedOn, rule.repeat_every, rule.repeat_unit));
  const spread = Math.max(1, Math.min(intervalDays, STARTER_SPREAD_DAYS));
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return addDays(addedOn, hash % spread);
}

/**
 * Survival days don't count against chores. A chore that fell due on (or
 * waited through) a survival day moves to the next day that wasn't one,
 * and the days it "waited" leave survival days out, so a hard stretch
 * never makes chores look overdue afterwards.
 */
export function setAsideSurvivalDays(timing: ChoreTiming, survivalDays: ReadonlySet<LocalDate>, today: LocalDate): ChoreTiming {
  if (timing.state !== "due" || survivalDays.size === 0) return timing;
  let dueOn = timing.dueOn;
  while (dueOn < today && survivalDays.has(dueOn)) dueOn = addDays(dueOn, 1);
  let waited = 0;
  for (let d = dueOn; d < today; d = addDays(d, 1)) if (!survivalDays.has(d)) waited++;
  return { ...timing, dueOn, daysOverdue: waited };
}
