import type { LocalDate } from "./time.ts";

/*
 * Habit tracking: routines can be switched on as habits. Each tracked step
 * gets a row of days, and each day is one of:
 *
 * - done    ticked (even if it was ticked late)
 * - missed  the routine was on that day and the step wasn't ticked
 * - off     the routine wasn't on that day, or tracking hadn't started yet
 * - rest    a survival day that wasn't ticked: it doesn't count either way
 * - open    today, not ticked yet: there's still time, so it doesn't count yet
 *
 * Only done and missed days count. "off", "rest" and "open" days are skipped
 * over, so a weekend without the school routine never breaks a streak.
 */

export type HabitDay = "done" | "missed" | "off" | "rest" | "open";

export type DayFacts = {
  date: LocalDate;
  /** Was the routine on for this person that day? */
  scheduled: boolean;
  /** Was the step ticked that day? */
  done: boolean;
  /** Was the survival button pressed that day? */
  survival: boolean;
};

/** One day's status for a step, given when tracking started and today's date. */
export function habitDay(facts: DayFacts, since: LocalDate, today: LocalDate): HabitDay {
  if (facts.date < since || facts.date > today) return "off";
  if (facts.done) return "done";
  if (!facts.scheduled) return "off";
  if (facts.date === today) return "open";
  if (facts.survival) return "rest";
  return "missed";
}

/** A routine's day from its tracked steps' days: done only when every one is done. */
export function combineDays(days: HabitDay[]): HabitDay {
  if (days.length === 0 || days.every((d) => d === "off")) return "off";
  if (days.every((d) => d === "done" || d === "off")) return "done";
  if (days.includes("open")) return "open";
  if (days.includes("missed")) return "missed";
  return "rest";
}

export type HabitStats = {
  /** Done days in a row, counting back from the latest counted day. */
  streak: number;
  /** The longest run of done days. */
  best: number;
  done: number;
  /** Days that counted: done + missed. */
  counted: number;
};

/** Streaks and totals for a row of days, oldest first. */
export function habitStats(days: HabitDay[]): HabitStats {
  let best = 0;
  let run = 0;
  let done = 0;
  let counted = 0;
  for (const day of days) {
    if (day === "done") {
      run += 1;
      done += 1;
      counted += 1;
      best = Math.max(best, run);
    } else if (day === "missed") {
      run = 0;
      counted += 1;
    }
  }
  return { streak: run, best, done, counted };
}

/** The dates from `from` to `to`, oldest first. */
export function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let ms = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (ms <= end) {
    out.push(new Date(ms).toISOString().slice(0, 10));
    ms += 86_400_000;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The Habits page (2026-11-12): habits from routines and the Habit Manager
// ---------------------------------------------------------------------------

/**
 * A tracked step is one habit per person, matched by its name across
 * routines (Connor, 2026-11-12): "Brush teeth" in the weekday and the
 * weekend bedtime routine is one habit, so weekends don't break the
 * streak. Renaming one of them keeps them apart.
 */
export function stepKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export type Frequency = "daily" | "days" | "week" | "month";

/** How a Habit Manager habit works. */
export type HabitRule = {
  measure: "check" | "count";
  /** For count habits: how much makes a day. 1 for check habits. */
  goal: number;
  frequency: Frequency;
  /** For "days": the weekdays it's on (0 = Sunday). */
  weekdays: number[];
  /** For "week" and "month": how many days in each. */
  times: number;
  since: LocalDate;
};

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Is a daily or some-days habit on that day? Week and month habits can be done on any day. */
export function habitOn(rule: Pick<HabitRule, "frequency" | "weekdays">, date: LocalDate): boolean {
  return rule.frequency === "days" ? rule.weekdays.includes(weekdayOf(date)) : true;
}

/** Is a day's amount enough? */
export function dayMet(rule: Pick<HabitRule, "measure" | "goal">, amount: number): boolean {
  return rule.measure === "check" ? amount > 0 : amount >= rule.goal;
}

/** A Habit Manager habit's day, for a daily or some-days habit (like habitDay for routines). */
export function ruleDay(rule: HabitRule, date: LocalDate, amount: number, today: LocalDate): HabitDay {
  return habitDay({ date, scheduled: habitOn(rule, date), done: dayMet(rule, amount), survival: false }, rule.since, today);
}

/** The Monday a date's week starts on (habit weeks run Monday to Sunday, like the 12-month calendars). */
export function weekStart(date: LocalDate): LocalDate {
  return addDaysTo(date, -((weekdayOf(date) + 6) % 7));
}

export type PeriodStatus = "done" | "missed" | "open" | "future" | "off";

export type HabitPeriod = {
  from: LocalDate;
  to: LocalDate;
  status: PeriodStatus;
  /** Days met in the period, against the habit's `times`. */
  met: number;
};

/** The weeks (Monday to Sunday) or months that cover from…to, each with how it went. */
export function habitPeriods(rule: HabitRule, from: LocalDate, to: LocalDate, amountOn: (date: LocalDate) => number, today: LocalDate): HabitPeriod[] {
  const out: HabitPeriod[] = [];
  let start = rule.frequency === "month" ? `${from.slice(0, 7)}-01` : weekStart(from);
  while (start <= to) {
    const end = rule.frequency === "month" ? addDaysTo(`${addMonthTo(start)}`, -1) : addDaysTo(start, 6);
    let met = 0;
    for (const date of datesBetween(start, end < today ? end : today)) if (date >= rule.since && dayMet(rule, amountOn(date))) met += 1;
    const status: PeriodStatus =
      met >= rule.times ? "done" : end < rule.since ? "off" : start > today ? "future" : end >= today ? "open" : "missed";
    out.push({ from: start, to: end, status, met });
    start = addDaysTo(end, 1);
  }
  return out;
}

/** Streaks over weeks or months: like habitStats, where each period is one step. */
export function periodStats(periods: HabitPeriod[]): HabitStats {
  return habitStats(periods.map((p) => (p.status === "done" ? "done" : p.status === "missed" ? "missed" : "off")));
}

function addDaysTo(date: LocalDate, days: number): LocalDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The first of the next month. */
function addMonthTo(firstOfMonth: LocalDate): LocalDate {
  const [y, m] = firstOfMonth.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** The dates of a month ("2026-11"), first to last. */
export function monthDates(month: string): LocalDate[] {
  return datesBetween(`${month}-01`, addDaysTo(addMonthTo(`${month}-01`), -1));
}

/** A month ("2026-11") moved by some months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const n = y * 12 + (m - 1) + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}

/** How a count chart's y-axis tops out: a round number a bit above the goal and the biggest day. */
export function chartTop(goal: number, biggest: number): number {
  const want = Math.max(goal * 2, biggest, 1);
  const step = want <= 10 ? 2 : want <= 50 ? 10 : want <= 200 ? 50 : 100;
  return Math.ceil(want / step) * step;
}
