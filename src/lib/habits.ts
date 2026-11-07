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
