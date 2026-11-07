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

/** How many weeks the rolling "5 weeks" view shows. */
export const ROLLING_WEEKS = 5;

/** The rolling view: whole weeks starting with the week that holds the date. */
export function rollingWeekDays(date: LocalDate, weekStartsOn: 0 | 1, weeks = ROLLING_WEEKS): LocalDate[] {
  const start = startOfWeek(date, weekStartsOn);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/**
 * A month always fits in 5 rows, like a paper calendar. When a month needs a
 * 6th week, its last days share a square with the day a week before them
 * ("23/30"). Returns the 35 squares, and which squares hold a second day.
 */
export function fiveRowMonth(gridDays: LocalDate[]): { cells: LocalDate[]; shared: Map<LocalDate, LocalDate> } {
  const cells = gridDays.slice(0, 35);
  const shared = new Map<LocalDate, LocalDate>();
  const month = monthOf(gridDays[14]);
  gridDays.slice(35).forEach((day, i) => {
    if (monthOf(day) === month) shared.set(cells[28 + i], day);
  });
  return { cells, shared };
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

// ---------------------------------------------------------------------------
// Today: one column per person, and events that span several
// ---------------------------------------------------------------------------

/**
 * Which runs of neighbouring columns an event covers, as [first, last]
 * column numbers. An event for nobody in particular (or for nobody shown)
 * is for everyone, so it covers the whole row. Mom and Ava side by side
 * make one run; Mom and Sam with Ava between make two.
 */
export function memberRuns(memberIds: readonly string[], columnIds: readonly string[]): [number, number][] {
  const mine = columnIds.map((id) => memberIds.includes(id));
  if (!mine.some(Boolean)) return columnIds.length > 0 ? [[0, columnIds.length - 1]] : [];
  const runs: [number, number][] = [];
  mine.forEach((on, i) => {
    if (!on) return;
    const last = runs.at(-1);
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  });
  return runs;
}

export type SpanBlock = TimedBlock & { c0: number; c1: number };
export type PlacedSpan = SpanBlock & { lane: number; lanes: number };

/**
 * Like layoutDay, for blocks that can cover several columns: blocks that
 * overlap in time and share a column go side by side. A block takes the
 * same lane in every column it covers.
 */
export function layoutSpans(blocks: SpanBlock[]): PlacedSpan[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.c0 - b.c0);
  const ends = (b: TimedBlock) => Math.max(b.endMin, b.startMin + 15);
  const clash = (a: SpanBlock, b: SpanBlock) => a.c0 <= b.c1 && b.c0 <= a.c1 && a.startMin < ends(b) && b.startMin < ends(a);
  const placed: PlacedSpan[] = [];
  for (const block of sorted) {
    const taken = new Set(placed.filter((p) => clash(p, block)).map((p) => p.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    placed.push({ ...block, lane, lanes: 1 });
  }
  // Each block shares its width with everything it's linked to by clashes.
  const groupOf = placed.map((_, i) => i);
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])));
  placed.forEach((a, i) => placed.forEach((b, j) => j > i && clash(a, b) && (groupOf[find(j)] = find(i))));
  const lanes = new Map<number, number>();
  placed.forEach((p, i) => lanes.set(find(i), Math.max(lanes.get(find(i)) ?? 0, p.lane + 1)));
  placed.forEach((p, i) => (p.lanes = lanes.get(find(i))!));
  return placed;
}

/**
 * Left and width (CSS) for a block covering columns c0 to c1 of n, with
 * `gap` between columns, in lane `lane` of `lanes`.
 */
export function spanBox(c0: number, c1: number, n: number, gap: string, lane = 0, lanes = 1): { left: string; width: string } {
  const column = `((100% - ${n - 1} * ${gap}) / ${n})`;
  return {
    left: `calc(${column} * ${c0 + lane / lanes} + ${gap} * ${c0})`,
    width: `calc(${column} * ${c1 - c0 + 1 / lanes} + ${gap} * ${c1 - c0})`,
  };
}
