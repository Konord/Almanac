/**
 * Helpers for the Agenda's "Coming up" row. Plain .ts so `node --test` runs them.
 */

import { addDays, type LocalDate } from "./time.ts";

/**
 * Keeps only the first of each repeating series (items must be sorted by
 * time), so something every few days, like Daycare or Counselling, shows
 * once at its next time instead of filling the row (Connor, 2026-11-26).
 */
export function onePerSeries<T extends { id: string; series_id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((e) => {
    const key = e.series_id || e.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The day part of a Coming up time: just the weekday ("Fri") within the
 * coming week, the weekday and date ("Fri, Dec 4") past it, where a weekday
 * alone could mean this week or next.
 */
export function comingDayText(date: LocalDate, day: LocalDate, at: Date, locale: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(at);
  if (date <= addDays(day, 6)) return weekday;
  const monthDay = new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" }).format(at).replace(".", "");
  return `${weekday}, ${monthDay}`;
}
