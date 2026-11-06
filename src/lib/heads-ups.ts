import { addDays, localDateOf, type LocalDate } from "./time.ts";

/*
 * Heads-ups: reminders that come a set time before something (an event, a
 * chore, a recipe). This file holds the plain maths: how long before, said
 * in words, and when one is due.
 */

export type LeadUnit = "minutes" | "hours" | "days" | "weeks";

export const LEAD_UNITS: { unit: LeadUnit; label: string; minutes: number }[] = [
  { unit: "minutes", label: "min", minutes: 1 },
  { unit: "hours", label: "hours", minutes: 60 },
  { unit: "days", label: "days", minutes: 1440 },
  { unit: "weeks", label: "weeks", minutes: 10080 },
];

/** The longest lead allowed (60 days), matching the database. */
export const MAX_LEAD_MINUTES = 86400;

/** How many days ahead a heads-up's to-do is made, so it can be seen coming. */
export const MAKE_AHEAD_DAYS = 7;

/** Splits a lead into the biggest unit that fits evenly: 2880 → 2 days. */
export function splitLead(minutes: number): { amount: number; unit: LeadUnit } {
  for (const u of [...LEAD_UNITS].reverse()) {
    if (minutes >= u.minutes && minutes % u.minutes === 0) return { amount: minutes / u.minutes, unit: u.unit };
  }
  return { amount: minutes, unit: "minutes" };
}

/** The lead from a form: amount and unit back into minutes (null if not allowed). */
export function leadMinutes(amount: number, unit: string): number | null {
  const u = LEAD_UNITS.find((x) => x.unit === unit);
  if (!u || !Number.isInteger(amount) || amount < 0) return null;
  const minutes = amount * u.minutes;
  return minutes <= MAX_LEAD_MINUTES ? minutes : null;
}

/** "2 days before", "1 hour before", "At the start". */
export function leadLabel(minutes: number): string {
  if (minutes === 0) return "At the start";
  const { amount, unit } = splitLead(minutes);
  const word = unit === "minutes" ? "min" : amount === 1 ? unit.slice(0, -1) : unit;
  return `${amount} ${word} before`;
}

/** When a heads-up for something starting at `start` is due, as a local date and time. */
export function headsUpTime(start: Date, minutesBefore: number, timeZone: string): { date: LocalDate; time: string | null } {
  const at = new Date(start.getTime() - minutesBefore * 60_000);
  const date = localDateOf(at, timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  // Midnight means "that day", with no particular time.
  return { date, time: parts === "00:00" ? null : parts };
}

/** For a chore (which has a day but no time): the day its heads-up is due. */
export function choreHeadsUpDate(dueOn: LocalDate, minutesBefore: number): LocalDate {
  return addDays(dueOn, -Math.floor(minutesBefore / 1440));
}
