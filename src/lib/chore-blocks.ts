import { dayOfWeek } from "./calendar-layout.ts";
import { addDays, type LocalDate } from "./time.ts";

/*
 * Chore blocks: time set aside for chores, like "Big clean, Saturday 10
 * to 12". Due chores make to-dos; this file works out which of those
 * to-dos go into which block over the next week:
 *
 *   1. A closed block (Laundry on Monday) takes its own chore's to-do.
 *   2. An open block takes its preset chores' to-dos first...
 *   3. ...then fills its free minutes with other due chores, most
 *      overdue (then most important) first.
 *
 * A to-do that doesn't fit anywhere stays on the to-do list. Chores that
 * belong to a block (closed or preset) only ever go in their own block.
 */

export type BlockKind = "open" | "closed";

export type ChoreBlock = {
  id: string;
  name: string;
  icon: string | null;
  kind: BlockKind;
  chore_id: string | null;
  weekdays: number[];
  start_time: string;
  minutes: number;
  member_ids: string[];
  loose: boolean;
  /** Open blocks: chores that always go in. */
  presets: string[];
};

/** What a chore's to-do needs for filling blocks. */
export type ChoreTodo = {
  id: string;
  template_id: string;
  minutes: number;
  due_date: LocalDate;
  not_before: LocalDate | null;
  /** 2 important, 1 normal, 0 can wait. */
  weight: number;
};

export type BlockDay<T extends ChoreTodo = ChoreTodo> = {
  block: ChoreBlock;
  date: LocalDate;
  items: T[];
  usedMinutes: number;
};

/** How far ahead blocks are filled. */
export const BLOCK_DAYS = 7;

/** Minutes for a chore with no estimate, by size. */
export const SIZE_MINUTES: Record<"small" | "medium" | "big", number> = { small: 10, medium: 30, big: 60 };

/** Each block on each day it happens, in order. */
export function blockDays(blocks: ChoreBlock[], from: LocalDate, days = BLOCK_DAYS): { block: ChoreBlock; date: LocalDate }[] {
  const out: { block: ChoreBlock; date: LocalDate }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const wd = dayOfWeek(date);
    for (const block of [...blocks].sort((a, b) => (a.start_time < b.start_time ? -1 : 1))) {
      if (block.weekdays.includes(wd)) out.push({ block, date });
    }
  }
  return out;
}

const byNeed = (a: ChoreTodo, b: ChoreTodo) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : b.weight - a.weight);

/** Fills the coming week's blocks. Returns each block day and the to-dos left over. */
export function fillBlocks<T extends ChoreTodo>(
  blocks: ChoreBlock[],
  todos: T[],
  from: LocalDate,
  days = BLOCK_DAYS,
): { days: BlockDay<T>[]; left: T[] } {
  const filled: BlockDay<T>[] = blockDays(blocks, from, days).map((d) => ({ ...d, items: [], usedMinutes: 0 }));
  const taken = new Set<string>();
  const ready = (t: T, date: LocalDate) => !taken.has(t.id) && (!t.not_before || t.not_before <= date);
  const put = (day: BlockDay<T>, t: T) => {
    day.items.push(t);
    day.usedMinutes += t.minutes;
    taken.add(t.id);
  };
  // Chores that have a block of their own.
  const owned = new Set(blocks.flatMap((b) => (b.kind === "closed" && b.chore_id ? [b.chore_id] : b.presets)));
  const sorted = [...todos].sort(byNeed);

  // 1 and 2: closed blocks' chores, and open blocks' presets.
  for (const day of filled) {
    const mine = day.block.kind === "closed" ? (day.block.chore_id ? [day.block.chore_id] : []) : day.block.presets;
    for (const t of sorted) if (mine.includes(t.template_id) && ready(t, day.date)) put(day, t);
  }
  // 3: open blocks take other due chores while there's room.
  for (const day of filled) {
    if (day.block.kind !== "open") continue;
    for (const t of sorted) {
      if (owned.has(t.template_id) || !ready(t, day.date)) continue;
      if (day.usedMinutes + t.minutes <= day.block.minutes) put(day, t);
    }
  }
  return { days: filled, left: sorted.filter((t) => !taken.has(t.id)) };
}

/** "Mon, Wed" or "Every day". */
export function weekdaysLabel(weekdays: number[]): string {
  if (weekdays.length === 7) return "Every day";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => names[d]).join(", ");
}

/**
 * "Chore now": with this many minutes and this much energy, which chores
 * to do. Most overdue first, as many as fit.
 */
export function pickForNow<T extends ChoreTodo & { size: "small" | "medium" | "big" }>(
  todos: T[],
  minutes: number,
  sizes: ("small" | "medium" | "big")[],
): T[] {
  const out: T[] = [];
  let used = 0;
  for (const t of [...todos].sort(byNeed)) {
    if (!sizes.includes(t.size)) continue;
    if (used + t.minutes > minutes) continue;
    out.push(t);
    used += t.minutes;
  }
  return out;
}
