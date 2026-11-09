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
export type ChoreSize = "small" | "medium" | "big";

/** How much a chore matters, beside its size. Important ones aren't skipped on a survival day unless you choose to. */
export type ChoreImportance = "low" | "normal" | "high";

/**
 * Where a chore's due date lands once it's worked out: on the nearest
 * Saturday, the first Saturday of the month, the last Sunday of the season…
 */
export type ChoreSnap = "none" | "weekday" | "first_of_month" | "last_of_month" | "first_of_season" | "last_of_season";

export type Season = "spring" | "summer" | "fall" | "winter";

export type ChoreRule = {
  repeat_every: number;
  repeat_unit: RepeatUnit;
  /** 0 = Sunday … 6 = Saturday, or null for any day. The weekday a snap uses. */
  preferred_weekday: number | null;
  /** Count from when it was last done (the default) or from a set date. */
  repeat_from?: "done" | "date";
  /** For repeat_from "date": the first date of the schedule. */
  start_date?: LocalDate | null;
  /** Missing: snap to the preferred weekday if there is one. */
  snap?: ChoreSnap;
  /** Only in these months (1–12) or seasons; empty or null means any time. */
  only_months?: number[] | null;
  only_seasons?: Season[] | null;
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

export const IMPORTANCE_LABEL: Record<ChoreImportance, string> = { low: "Can wait", normal: "Normal", high: "Important" };

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

/*
 * Seasons follow the solstices and equinoxes, with fixed dates each year:
 * spring from March 20, summer from June 21, fall from September 22 and
 * winter from December 21.
 */
export const SEASONS: { season: Season; label: string; start: string }[] = [
  { season: "spring", label: "Spring", start: "03-20" },
  { season: "summer", label: "Summer", start: "06-21" },
  { season: "fall", label: "Fall", start: "09-22" },
  { season: "winter", label: "Winter", start: "12-21" },
];

/** The season a date falls in, and that season's first and last days. */
export function seasonOf(date: LocalDate): { season: Season; start: LocalDate; end: LocalDate } {
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  const i = SEASONS.findIndex((s, k) => md >= s.start && (k === SEASONS.length - 1 || md < SEASONS[k + 1].start));
  if (i === -1) {
    // January to March 19: the winter that began last December.
    return { season: "winter", start: `${year - 1}-12-21`, end: `${year}-03-19` };
  }
  const start = `${year}-${SEASONS[i].start}`;
  const next = i === SEASONS.length - 1 ? `${year + 1}-${SEASONS[0].start}` : `${year}-${SEASONS[i + 1].start}`;
  return { season: SEASONS[i].season, start, end: addDays(next, -1) };
}

/** The first or last `weekday` in a run of days (start..end). */
function weekdayIn(start: LocalDate, end: LocalDate, weekday: number, which: "first" | "last"): LocalDate {
  if (which === "first") return onOrAfterWeekday(start, weekday);
  return addDays(end, -((dayOfWeek(end) - weekday + 7) % 7));
}

function monthBounds(date: LocalDate): { start: LocalDate; end: LocalDate } {
  const start = `${date.slice(0, 7)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

/** Moves a worked-out date onto the rule's snap (if it has one). */
export function snapDate(date: LocalDate, snap: ChoreSnap, weekday: number | null): LocalDate {
  if (snap === "none" || weekday === null) return date;
  switch (snap) {
    case "weekday":
      return nearestWeekday(date, weekday);
    case "first_of_month":
    case "last_of_month": {
      const m = monthBounds(date);
      return weekdayIn(m.start, m.end, weekday, snap === "first_of_month" ? "first" : "last");
    }
    case "first_of_season":
    case "last_of_season": {
      const s = seasonOf(date);
      return weekdayIn(s.start, s.end, weekday, snap === "first_of_season" ? "first" : "last");
    }
  }
}

/** The next snapped date after `after`: the snap's next month, season or week. */
function nextSnap(after: LocalDate, snap: ChoreSnap, weekday: number | null): LocalDate {
  switch (snap) {
    case "first_of_month":
    case "last_of_month":
      return snapDate(addMonths(monthBounds(after).start, 1), snap, weekday);
    case "first_of_season":
    case "last_of_season":
      return snapDate(addDays(seasonOf(after).end, 1), snap, weekday);
    default:
      return snapDate(addDays(after, 7), snap, weekday);
  }
}

function allowed(date: LocalDate, rule: ChoreRule): boolean {
  const months = rule.only_months ?? [];
  const seasons = rule.only_seasons ?? [];
  if (months.length > 0 && !months.includes(Number(date.slice(5, 7)))) return false;
  if (seasons.length > 0 && !seasons.includes(seasonOf(date).season)) return false;
  return true;
}

/** The first allowed day on or after `date` (the start of the next allowed month or season). */
function nextAllowed(date: LocalDate, rule: ChoreRule): LocalDate {
  let d = date;
  for (let i = 0; i < 24 && !allowed(d, rule); i++) {
    const months = rule.only_months ?? [];
    d = months.length > 0 ? addMonths(monthBounds(d).start, 1) : addDays(seasonOf(d).end, 1);
  }
  return d;
}

/** Which snap a rule uses (old rules: the favourite weekday, if any). */
export function snapOf(rule: ChoreRule): ChoreSnap {
  if (rule.preferred_weekday === null) return "none";
  return rule.snap ?? "weekday";
}

/**
 * Puts a worked-out date where the rule wants it: snapped, inside the
 * allowed months or seasons, and after `after` (if given).
 */
function place(date: LocalDate, rule: ChoreRule, after: LocalDate | null): LocalDate {
  const snap = snapOf(rule);
  const wd = rule.preferred_weekday;
  let d = snapDate(date, snap, wd);
  for (let i = 0; i < 24; i++) {
    if (after !== null && d <= after) {
      d = snap === "none" ? addDays(after, 1) : nextSnap(d, snap, wd);
    } else if (!allowed(d, rule)) {
      // Into the next allowed stretch, and snapped inside it, never back out.
      const start = nextAllowed(d, rule);
      d = snap === "weekday" ? onOrAfterWeekday(start, wd as number) : snapDate(start, snap, wd);
      if (d < start) d = nextSnap(d, snap, wd);
    } else {
      return d;
    }
  }
  return d;
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
  if (rule.repeat_from === "date" && rule.start_date) {
    // A set schedule (every 2 weeks from Jan 5): the newest date that has
    // come round since it was last done, or else the next one.
    dueOn = scheduledDue(rule, rule.start_date, lastRound, today);
  } else if (lastRound === null) {
    // Never done: due now (or from its first day), on its weekday if it has one.
    const from = rule.first_due ?? today;
    const snap = snapOf(rule);
    const wd = rule.preferred_weekday;
    let first = snap === "weekday" ? onOrAfterWeekday(from, wd as number) : snapDate(from, snap, wd);
    if (first < from) first = nextSnap(first, snap, wd);
    dueOn = place(first, rule, addDays(from, -1));
  } else if (rule.repeat_unit === "day" && snapOf(rule) === "weekday") {
    // Daily chores ignore a favourite weekday (as before).
    dueOn = place(addInterval(lastRound, rule.repeat_every, rule.repeat_unit), { ...rule, snap: "none" }, lastRound);
  } else {
    dueOn = place(addInterval(lastRound, rule.repeat_every, rule.repeat_unit), rule, lastRound);
  }
  const state = stateFor(dueOn, today);
  return { state, dueOn, daysOverdue: state === "due" ? daysBetween(dueOn, today) : 0, lastDone, window: null };
}

/** For a set schedule: the dates start, start + step, start + 2 steps…, each placed by the rule. */
function scheduledDue(rule: ChoreRule, start: LocalDate, lastRound: LocalDate | null, today: LocalDate): LocalDate {
  let newestPassed: LocalDate | null = null;
  for (let k = 0; k < 2000; k++) {
    const raw = addInterval(start, rule.repeat_every * k, rule.repeat_unit);
    const d = place(raw, rule, null);
    if (lastRound !== null && d <= lastRound) continue;
    if (d > today) return newestPassed ?? d;
    newestPassed = d;
  }
  return newestPassed ?? start;
}

const SNAP_WORDS: Record<Exclude<ChoreSnap, "none">, (day: string) => string> = {
  weekday: (day) => `on the nearest ${day}`,
  first_of_month: (day) => `on the first ${day} of the month`,
  last_of_month: (day) => `on the last ${day} of the month`,
  first_of_season: (day) => `on the first ${day} of the season`,
  last_of_season: (day) => `on the last ${day} of the season`,
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The whole rule in words: "Every 2 weeks from Jan 5, on the nearest
 * Saturday, only in summer". `dateLabel` formats the start date.
 */
export function describeRule(rule: ChoreRule, dateLabel: (d: LocalDate) => string = (d) => d, seasonLabel?: string): string {
  if (rule.season_start && rule.season_end) return describeRepeat(rule, seasonLabel);
  const parts = [describeRepeat(rule)];
  if (rule.repeat_from === "date" && rule.start_date) parts[0] += ` from ${dateLabel(rule.start_date)}`;
  const snap = snapOf(rule);
  if (snap !== "none") parts.push(SNAP_WORDS[snap](WEEKDAY_NAMES[rule.preferred_weekday as number]));
  const seasons = rule.only_seasons ?? [];
  const months = rule.only_months ?? [];
  if (seasons.length > 0) parts.push(`only in ${seasons.join(" and ")}`);
  if (months.length > 0) parts.push(`only in ${[...months].sort((a, b) => a - b).map((m) => MONTH_SHORT[m - 1]).join(", ")}`);
  return parts.join(", ");
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

/*
 * Spreading occasional chores out (2026-11-09). Chores made in the same
 * week would otherwise come due together every time round, then leave a
 * long gap. Two things stop that:
 *
 *   - A new chore's first time goes on the quietest day within one repeat
 *     (at most eight weeks): the day with the fewest other chores due
 *     within three days of it, then the one furthest from any of them,
 *     then the earliest.
 *   - The daily list may do a long-repeat chore a few days early when an
 *     earlier day is quieter (see `spreadSlack`). Done early, it repeats
 *     from then, so bunched chores drift apart over time.
 */

/** How far ahead a new chore's first time can go. */
const FIRST_DUE_SPREAD_DAYS = 56;
/** Days either side of a day that count as "around then" when judging how busy it is. */
const BUSY_NEAR_DAYS = 3;

/** Only chores that repeat from when they were done move about: not set schedules or season windows. */
function spreads(rule: ChoreRule): boolean {
  return !(rule.season_start && rule.season_end) && !(rule.repeat_from === "date" && rule.start_date);
}

/** A chore's next few due dates up to `until`, from when it's next due (overdue counts as today). */
export function upcomingDue(dueOn: LocalDate, rule: ChoreRule, today: LocalDate, until: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let d = dueOn < today ? today : dueOn;
  for (let k = 0; k < 400 && d <= until; k++) {
    out.push(d);
    if (!spreads(rule)) break;
    d = addInterval(d, rule.repeat_every, rule.repeat_unit);
  }
  return out;
}

/**
 * The first due date for a new occasional chore: the quietest day from
 * today to one repeat later (at most eight weeks), judged by `others`
 * (the other chores' coming due dates). Null when the chore doesn't move
 * about (a set schedule or a season window).
 */
export function spreadFirstDue(rule: ChoreRule, today: LocalDate, others: LocalDate[]): LocalDate | null {
  if (!spreads(rule)) return null;
  const intervalDays = daysBetween(today, addInterval(today, rule.repeat_every, rule.repeat_unit));
  const span = Math.max(1, Math.min(intervalDays, FIRST_DUE_SPREAD_DAYS));
  let best = today;
  let bestLoad = Infinity;
  let bestGap = -1;
  for (let i = 0; i < span; i++) {
    const d = addDays(today, i);
    const from = addDays(d, -BUSY_NEAR_DAYS);
    const to = addDays(d, BUSY_NEAR_DAYS);
    const load = others.filter((o) => o >= from && o <= to).length;
    // Among equally quiet days, the one furthest from any other chore.
    const gap = Math.min(Infinity, ...others.map((o) => Math.abs(daysBetween(o, d))));
    if (load < bestLoad || (load === bestLoad && gap > bestGap)) {
      best = d;
      bestLoad = load;
      bestGap = gap;
    }
  }
  return best;
}

/** Long repeats can be done this share of their repeat early… */
const SLACK_SHARE = 0.15;
/** …but at most this many days, and only when they repeat at least this often. */
const SLACK_MAX_DAYS = 7;
const SLACK_MIN_INTERVAL = 28;

/**
 * How many days early the daily list may put a chore when that day is
 * quieter: none for anything that repeats more often than every four
 * weeks, about a week for a chore done every few months.
 */
export function spreadSlack(rule: ChoreRule): number {
  if (!spreads(rule)) return 0;
  const start = "2026-01-01";
  const intervalDays = daysBetween(start, addInterval(start, rule.repeat_every, rule.repeat_unit));
  if (intervalDays < SLACK_MIN_INTERVAL) return 0;
  return Math.min(SLACK_MAX_DAYS, Math.floor(intervalDays * SLACK_SHARE));
}
