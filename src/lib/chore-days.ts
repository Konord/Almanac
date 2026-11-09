import { dayOfWeek } from "./calendar-layout.ts";
import { addDays, type LocalDate } from "./time.ts";

/*
 * Chore days and the chore generator (tasks rework, 2026-11-09).
 *
 * Every day has one or more chore days: Laundry on Tuesday, Kitchen on
 * Saturday, or the Free day when nothing else is set. Chores only ever go
 * on the daily list, never on the calendar:
 *
 *   - A preset chore shows every time its chore day comes round. On a chore
 *     day that runs over several days (Big Clean, Sat + Sun), it shows from
 *     the first day and carries until the stretch ends.
 *   - A generated chore has a date rule. When it comes due it is put on the
 *     last day on or before its due date that accepts it and has room; if
 *     none has room, the first one after. Overdue ones go on the first day
 *     with room from today. Essential overdue ones go on today whatever the
 *     room.
 *   - A one-off chore (a list task with a chore day) waits for the next
 *     matching day with room.
 *
 * A day "accepts" a chore when the chore is tagged for one of its chore
 * days, or when the chore has no chore-day tags and the chore day isn't
 * restrictive. Room is counted in tasks (presets don't count) and in Big
 * tasks. A chore with an exact time is pinned to its day and skips the
 * room count. On days away (a break marked away), nothing is placed.
 *
 * Free of other imports so `node --test` can run the tests.
 */

export type ChoreTag = "essential" | "big" | "outdoor" | "errand";

export const CHORE_TAGS: { value: ChoreTag; label: string; hint: string }[] = [
  {
    value: "essential",
    label: "Essential",
    hint: "Survival can't skip it; it rolls to tomorrow",
  },
  { value: "big", label: "Big", hint: "Counts against the day's Big limit" },
  { value: "outdoor", label: "Outdoor", hint: "For dry, daylight days" },
  {
    value: "errand",
    label: "Errand",
    hint: "Needs leaving the house; grouped onto one day",
  },
];

export function isChoreTag(value: string): value is ChoreTag {
  return CHORE_TAGS.some((t) => t.value === value);
}

export type ChoreDay = {
  id: string;
  name: string;
  icon: string | null;
  /** 0 = Sunday … 6 = Saturday. Empty for the Free day. */
  weekdays: number[];
  /** Days next to each other are one stretch. */
  span: boolean;
  /** Only takes chores tagged for it. */
  restrictive: boolean;
  max_tasks: number;
  max_big: number;
  is_free: boolean;
};

/** What the generator needs to know about a chore. */
export type PlannableChore = {
  id: string;
  kind: "preset" | "generated";
  tags: ChoreTag[];
  chore_day_ids: string[];
  /** "19:00" for a chore at an exact time, else null. */
  at_time: string | null;
  /** Generated: when it's next due. */
  dueOn: LocalDate;
  /** Skipped: not placed before this day. */
  not_before: LocalDate | null;
  active: boolean;
};

/** A one-off chore: a list task waiting for a chore day. */
export type OneOffChore = { id: string; chore_day_id: string; big?: boolean };

export type PlanItem = {
  id: string;
  kind: "generated" | "one-off";
  big: boolean;
  errand: boolean;
  pinned: boolean;
};

export type PlanDay = {
  date: LocalDate;
  away: boolean;
  choreDays: ChoreDay[];
  /** Preset chores whose stretch starts on this day. */
  presets: string[];
  items: PlanItem[];
};

export type ChorePlan = {
  days: PlanDay[];
  /** Due within the window but with no room anywhere: hard to schedule. */
  unplaced: string[];
};

/** How far ahead the generator plans. */
export const PLAN_DAYS = 14;

/**
 * A chore day moved on one date (from the weekly review): `on` puts it on a
 * date it doesn't usually fall on, `on: false` takes it off one it does.
 */
export type ChoreDayMove = { chore_day_id: string; date: LocalDate; on: boolean };

/** Whether a (non-Free) chore day falls on a date: its weekdays, unless moved. */
export function fallsOn(choreDay: ChoreDay, date: LocalDate, moves: ChoreDayMove[] = []): boolean {
  if (choreDay.is_free) return false;
  const moved = moves.find((m) => m.chore_day_id === choreDay.id && m.date === date);
  return moved ? moved.on : choreDay.weekdays.includes(dayOfWeek(date));
}

/** The chore days on a date: those set for it (its weekday, or moved there), or else the Free day. */
export function choreDaysOn(choreDays: ChoreDay[], date: LocalDate, moves: ChoreDayMove[] = []): ChoreDay[] {
  const set = choreDays.filter((d) => fallsOn(d, date, moves));
  if (set.length > 0) return set;
  return choreDays.filter((d) => d.is_free);
}

/** The first day of the stretch a date belongs to (the date itself unless the chore day spans days). */
export function stretchStart(choreDay: ChoreDay, date: LocalDate, moves: ChoreDayMove[] = []): LocalDate {
  if (!choreDay.span) return date;
  let start = date;
  for (let i = 0; i < 6; i++) {
    const before = addDays(start, -1);
    if (!fallsOn(choreDay, before, moves)) break;
    start = before;
  }
  return start;
}

/** Whether a chore day takes a chore. */
export function accepts(choreDay: ChoreDay, choreDayIds: string[]): boolean {
  return choreDayIds.length > 0 ? choreDayIds.includes(choreDay.id) : !choreDay.restrictive;
}

/** Whether a chore could ever be placed: some chore day takes it and comes round. */
export function placeable(choreDays: ChoreDay[], choreDayIds: string[]): boolean {
  return choreDays.some((d) => accepts(d, choreDayIds) && (d.is_free || d.weekdays.length > 0));
}

/** Plans the next `days` days: each day's chore days, presets and placed chores. */
export function planChoreDays(input: {
  choreDays: ChoreDay[];
  chores: PlannableChore[];
  oneOffs?: OneOffChore[];
  today: LocalDate;
  away?: Set<LocalDate>;
  days?: number;
  /** Chores and one-offs already on today's list: they stay there (so the list doesn't shuffle during the day). */
  keptToday?: Set<string>;
  /** Chore days moved on single dates (the weekly review). */
  moves?: ChoreDayMove[];
}): ChorePlan {
  const { choreDays, chores, today } = input;
  const count = input.days ?? PLAN_DAYS;
  const away = input.away ?? new Set<LocalDate>();
  const moves = input.moves ?? [];
  const last = addDays(today, count - 1);
  const days: PlanDay[] = Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i);
    return {
      date,
      away: away.has(date),
      choreDays: away.has(date) ? [] : choreDaysOn(choreDays, date, moves),
      presets: [],
      items: [],
    };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Presets: on the first day of each stretch (or today, when today is inside one that started earlier).
  for (const chore of chores) {
    if (!chore.active || chore.kind !== "preset") continue;
    for (const day of days) {
      const mine = day.choreDays.filter((cd) => chore.chore_day_ids.includes(cd.id));
      if (mine.some((cd) => stretchStart(cd, day.date, moves) === day.date || day.date === today)) day.presets.push(chore.id);
    }
  }

  const room = (day: PlanDay, item: PlanItem) => {
    const maxTasks = day.choreDays.reduce((s, cd) => s + cd.max_tasks, 0);
    const maxBig = day.choreDays.reduce((s, cd) => s + cd.max_big, 0);
    const placed = day.items.filter((i) => !i.pinned);
    return placed.length < maxTasks && (!item.big || placed.filter((i) => i.big).length < maxBig);
  };
  const takes = (day: PlanDay, ids: string[]) => !day.away && day.choreDays.some((cd) => accepts(cd, ids));

  const unplaced: string[] = [];
  const kept = input.keptToday ?? new Set<string>();
  const first = days[0];
  const keep = (item: PlanItem) => {
    if (!first || first.away || !kept.has(item.id)) return false;
    first.items.push(item);
    return true;
  };
  const oneOffItem = (one: OneOffChore): PlanItem => ({
    id: one.id,
    kind: "one-off",
    big: Boolean(one.big),
    errand: false,
    pinned: false,
  });
  const waiting = (input.oneOffs ?? []).filter((one) => !keep(oneOffItem(one)));
  const generated = chores
    .filter((c) => c.active && c.kind === "generated" && c.dueOn <= last)
    .sort(
      (a, b) =>
        Number(kept.has(b.id)) - Number(kept.has(a.id)) ||
        Number(b.tags.includes("essential")) - Number(a.tags.includes("essential")) ||
        a.dueOn.localeCompare(b.dueOn) ||
        a.id.localeCompare(b.id),
    );

  for (const chore of generated) {
    const earliest = chore.not_before && chore.not_before > today ? chore.not_before : today;
    if (earliest > last) continue;
    const item: PlanItem = {
      id: chore.id,
      kind: "generated",
      big: chore.tags.includes("big"),
      errand: chore.tags.includes("errand"),
      pinned: chore.at_time !== null,
    };
    if (keep(item)) continue;
    // An exact time: pinned to its day (or today, once it's passed).
    if (item.pinned) {
      const date = chore.dueOn > earliest ? chore.dueOn : earliest;
      const day = byDate.get(date);
      if (day && !day.away) day.items.push(item);
      else if (day) unplaced.push(chore.id);
      continue;
    }
    const fits = (d: PlanDay) => takes(d, chore.chore_day_ids) && room(d, item);
    const window = days.filter((d) => d.date >= earliest);
    let chosen: PlanDay | undefined;
    if (chore.dueOn <= earliest) {
      // Due now: today if it's essential and today takes it, else the first day with room.
      const start = window[0];
      if (chore.tags.includes("essential") && start && takes(start, chore.chore_day_ids)) chosen = start;
      chosen ??= window.find(fits);
    } else {
      const before = window.filter((d) => d.date <= chore.dueOn && fits(d));
      // Errands join a day that already has one, if there is one.
      chosen = (item.errand ? before.findLast((d) => d.items.some((i) => i.errand)) : undefined) ?? before.at(-1);
      chosen ??= window.find((d) => d.date > chore.dueOn && fits(d));
    }
    if (chosen) chosen.items.push(item);
    else if (chore.dueOn <= addDays(today, 6)) unplaced.push(chore.id);
  }

  // One-off chores: the next day of their chore day with room.
  for (const one of waiting) {
    const item = oneOffItem(one);
    const chosen = days.find((d) => takes(d, [one.chore_day_id]) && room(d, item));
    if (chosen) chosen.items.push(item);
    else unplaced.push(one.id);
  }

  return { days, unplaced };
}

/** "Mon, Wed" or "Every day". */
export function weekdaysLabel(weekdays: number[]): string {
  if (weekdays.length === 7) return "Every day";
  if (weekdays.length === 0) return "Days with nothing else";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => names[d])
    .join(", ");
}
