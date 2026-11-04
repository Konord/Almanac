/**
 * The maths behind the week and month grids: which days to show, and how
 * to lay out events that overlap so they sit side by side, not on top of
 * each other. Free of other imports so `node --test` can run the tests.
 */
import { addDays, type LocalDate } from "./time.ts";

/** 0 = Sunday … 6 = Saturday, for a local calendar date. */
export function dayOfWeek(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The first day of the week containing `date`. */
export function startOfWeek(date: LocalDate, weekStartsOn: 0 | 1): LocalDate {
  const back = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -back);
}

/** The 7 days of the week containing `date`. */
export function weekDays(date: LocalDate, weekStartsOn: 0 | 1): LocalDate[] {
  const first = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** "2026-11" for a date. */
export function monthOf(date: LocalDate): string {
  return date.slice(0, 7);
}

/**
 * Every day shown on a month grid: whole weeks from the week holding the
 * 1st to the week holding the last day (5 or 6 rows of 7).
 */
export function monthGridDays(date: LocalDate, weekStartsOn: 0 | 1): LocalDate[] {
  const first = `${monthOf(date)}-01`;
  const [y, m] = first.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = addDays(first, daysInMonth - 1);
  const start = startOfWeek(first, weekStartsOn);
  const end = addDays(startOfWeek(last, weekStartsOn), 6);
  const days: LocalDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Moves a date by whole months, keeping the day where possible. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInTarget);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type TimedBlock = { id: string; startMin: number; endMin: number };
export type PlacedBlock = TimedBlock & { lane: number; lanes: number };

/**
 * Gives each event in one day a lane so overlapping events sit side by
 * side. Events that overlap (directly or through a chain) form a group,
 * and every event in a group shares the group's lane count so widths match.
 */
export function layoutDay(blocks: TimedBlock[]): PlacedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: PlacedBlock[] = [];
  let group: PlacedBlock[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const block of group) block.lanes = laneEnds.length;
    placed.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    // Very short events still take up some room, so treat them as 15 minutes.
    const end = Math.max(block.endMin, block.startMin + 15);
    if (block.startMin >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    group.push({ ...block, lane, lanes: 0 });
    groupEnd = Math.max(groupEnd, end);
  }
  closeGroup();
  return placed;
}
