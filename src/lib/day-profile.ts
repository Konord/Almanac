import { zonedToUtc, type LocalDate, type LocalTime } from "./time.ts";

/**
 * Day profiles: a quick read on what kind of day it is ("Free Saturday",
 * "Busy evening"), worked out from that day's events.
 *
 * The thresholds live in household settings, so they can be tuned without
 * changing code. Later phases use the profile to decide which chores and
 * meals fit a day (big chores on a free Saturday, quick dinners on a busy
 * evening).
 */
export type DayProfileSettings = {
  /** When the household's day starts and ends. Only this window counts. */
  dayStarts: LocalTime;
  dayEnds: LocalTime;
  /** When "evening" starts (it runs until dayEnds). */
  eveningStarts: LocalTime;
  /** This many minutes of events in the day makes it a busy day. */
  busyDayMinutes: number;
  /** This many minutes of events in the evening makes it a busy evening. */
  busyEveningMinutes: number;
};

export const DEFAULT_DAY_PROFILE: DayProfileSettings = {
  dayStarts: "07:00",
  dayEnds: "21:00",
  eveningStarts: "17:00",
  busyDayMinutes: 240,
  busyEveningMinutes: 90,
};

export type DayProfileKind = "free" | "busy" | "busy_evening";

export type DayProfile = {
  kind: DayProfileKind;
  /** Minutes taken by events inside the day window (overlaps counted once). */
  busyMinutes: number;
  /** Of those, the minutes in the evening. */
  eveningMinutes: number;
  /** Minutes of the day window left free. */
  freeMinutes: number;
};

/** The parts of an event the profile needs. */
export type BusyBlock = { starts_at: string; ends_at: string; all_day: boolean };

/**
 * Works out one day's profile.
 *
 * `blocks` should already be limited to layers that count toward busyness.
 * All-day events (birthdays, holidays) are left out, because they don't
 * say how much of the day they take.
 */
export function profileDay(
  date: LocalDate,
  blocks: BusyBlock[],
  settings: DayProfileSettings,
  timeZone: string,
): DayProfile {
  const dayStart = zonedToUtc(date, settings.dayStarts, timeZone).getTime();
  const dayEnd = zonedToUtc(date, settings.dayEnds, timeZone).getTime();
  const eveningStart = Math.max(dayStart, zonedToUtc(date, settings.eveningStarts, timeZone).getTime());

  const timed = blocks
    .filter((b) => !b.all_day)
    .map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const);

  const intervals = mergeIntervals(timed);
  const busyMinutes = minutesWithin(intervals, dayStart, dayEnd);
  const eveningMinutes = minutesWithin(intervals, eveningStart, dayEnd);
  const windowMinutes = Math.max(0, Math.round((dayEnd - dayStart) / 60_000));

  let kind: DayProfileKind = "free";
  if (busyMinutes >= settings.busyDayMinutes) kind = "busy";
  else if (eveningMinutes >= settings.busyEveningMinutes) kind = "busy_evening";

  return { kind, busyMinutes, eveningMinutes, freeMinutes: windowMinutes - busyMinutes };
}

/** "Free Saturday", "Busy Tuesday" or "Busy evening". */
export function profileLabel(kind: DayProfileKind, weekday: string): string {
  if (kind === "busy_evening") return "Busy evening";
  return `${kind === "busy" ? "Busy" : "Free"} ${weekday}`;
}

/** 0 → "no time", 45 → "45 min", 90 → "1 h 30 min", 240 → "4 h". */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "no time";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Joins overlapping times so two events at once only count once. */
function mergeIntervals(intervals: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = intervals.filter(([s, e]) => e > s).toSorted((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function minutesWithin(intervals: Array<[number, number]>, from: number, to: number): number {
  let total = 0;
  for (const [start, end] of intervals) {
    const overlap = Math.min(end, to) - Math.max(start, from);
    if (overlap > 0) total += overlap;
  }
  return Math.round(total / 60_000);
}
