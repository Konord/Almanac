import { addDays, isLocalTime, type LocalDate, type LocalTime } from "./time.ts";

/**
 * Fills in the times for a quickly-added event, so fewer boxes need filling:
 * - no times at all: it's an all-day event
 * - only a start time: it lasts the household's usual event length
 * - an end time earlier than the start (e.g. 23:00 to 01:00): it ends the next day
 * Returns null when the times can't be made sense of.
 */
export function fillTimes(input: {
  allDay: boolean;
  startDate: LocalDate;
  endDate: LocalDate;
  startTime: string;
  endTime: string;
  defaultMinutes: number;
}): { allDay: true } | { allDay: false; startTime: LocalTime; endTime: LocalTime; endDate: LocalDate } | null {
  const { startDate, endDate, startTime, endTime, defaultMinutes } = input;
  if (input.allDay || (!startTime && !endTime)) return { allDay: true };
  if (!isLocalTime(startTime)) return null;

  if (!endTime) {
    const total = toMinutes(startTime) + defaultMinutes;
    return { allDay: false, startTime, endTime: fromMinutes(total % (24 * 60)), endDate: addDays(startDate, Math.floor(total / (24 * 60))) };
  }
  if (!isLocalTime(endTime)) return null;
  // Same day but the end is before the start: it must run past midnight.
  if (endDate === startDate && endTime < startTime) {
    return { allDay: false, startTime, endTime, endDate: addDays(startDate, 1) };
  }
  return { allDay: false, startTime, endTime, endDate };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): LocalTime {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "1 h 30" style label for a length in minutes. */
export function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
