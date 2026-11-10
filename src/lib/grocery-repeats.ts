import { addMonths } from "./calendar-layout.ts";
import { addDays, type LocalDate } from "./time.ts";

/*
 * Repeating groceries (Connor, 2026-11-10): something that goes on the
 * grocery list by itself every so often. Milk every week, coffee every 3
 * weeks, water filters every 2 months. Free of other imports so
 * `node --test` can run the tests.
 */

export type RepeatEvery = "day" | "week" | "month";

export const REPEAT_UNITS: { value: RepeatEvery; one: string; many: string }[] = [
  { value: "day", one: "day", many: "days" },
  { value: "week", one: "week", many: "weeks" },
  { value: "month", one: "month", many: "months" },
];

export function isRepeatEvery(value: string): value is RepeatEvery {
  return REPEAT_UNITS.some((u) => u.value === value);
}

/** "Every week", "Every 3 weeks", "Every 10 days". */
export function repeatLabel(every: number, unit: RepeatEvery): string {
  const u = REPEAT_UNITS.find((x) => x.value === unit) ?? REPEAT_UNITS[1];
  return every === 1 ? `Every ${u.one}` : `Every ${every} ${u.many}`;
}

/** One step on from a date. */
export function stepOn(date: LocalDate, every: number, unit: RepeatEvery): LocalDate {
  if (unit === "month") return addMonths(date, every);
  return addDays(date, unit === "week" ? 7 * every : every);
}

/**
 * When a repeat that's come due goes on the list next: steps on from the
 * date it was due until it's after today, so a list nobody opened for a
 * while keeps its rhythm (milk stays on Mondays) without adding it twice.
 */
export function nextAfter(due: LocalDate, every: number, unit: RepeatEvery, today: LocalDate): LocalDate {
  let next = stepOn(due, every, unit);
  for (let i = 0; next <= today && i < 1000; i++) next = stepOn(next, every, unit);
  return next;
}
