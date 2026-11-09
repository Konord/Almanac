import { dayOfWeek } from "./calendar-layout.ts";
import type { ChoreDay, ChoreDayMove } from "./chore-days.ts";
import { addDays, type LocalDate } from "./time.ts";

/*
 * The weekly review (tasks rework, step 4): confirm and tweak the coming
 * week. Each day starts from its defaults, its kind of day for each person,
 * its chore days and its meals, and the screen keeps every change in a
 * draft until Confirm week (one save for the whole screen).
 *
 * It also looks for problems and offers a fix for each (suggest, then
 * approve): a chore day on a day you're away or on a day packed with plans,
 * a meal on a night everyone is out, a chore that's hard to schedule.
 *
 * Free of other imports so `node --test` can run the tests.
 */

export type ReviewDraft = {
  /** The chore days on each date (not the Free day, which fills days with none). */
  choreDays: Record<LocalDate, string[]>;
  /** Each person's kind of day on each date: date → member id → day type id. */
  dayTypes: Record<LocalDate, Record<string, string>>;
  /** Meals changed: meal id → the theme it's now, or null to take it off. */
  meals: Record<string, string | null>;
  /** Problems someone chose to leave as they are. */
  dismissed: string[];
};

/** What the review knows about each day that the draft doesn't change. */
export type ReviewDay = {
  date: LocalDate;
  /** "Tuesday" */
  name: string;
  /** Already over: shown, but not changed or checked. */
  past: boolean;
  /** On a break marked away. */
  away: boolean;
  /** Packed with plans (a busy day by the household's day-profile setting). */
  busy: boolean;
  /** Minutes of plans in the day (to pick the lightest day). */
  busyMinutes: number;
  meals: ReviewMeal[];
};

export type ReviewMeal = {
  id: string;
  /** "Dinner" */
  mealTimeName: string;
  categoryId: string | null;
  /** Everyone it's for has plans right through the time it's eaten. */
  everyoneOut: boolean;
};

export type Fix = { kind: "move"; choreDayId: string; from: LocalDate; to: LocalDate } | { kind: "meal-off"; mealId: string };

export type Problem = {
  id: string;
  date: LocalDate | null;
  text: string;
  /** The suggested fix and its button label. */
  fix?: { label: string; apply: Fix };
  /** Or somewhere to go and sort it out. */
  link?: { label: string; href: string };
};

// ---------------------------------------------------------------------------
// Changes to the draft
// ---------------------------------------------------------------------------

/** Puts a chore day on a date too (doubling up). */
export function addChoreDay(draft: ReviewDraft, date: LocalDate, id: string): ReviewDraft {
  const now = draft.choreDays[date] ?? [];
  if (now.includes(id)) return draft;
  return { ...draft, choreDays: { ...draft.choreDays, [date]: [...now, id] } };
}

/** Takes a chore day off a date. */
export function takeOffChoreDay(draft: ReviewDraft, date: LocalDate, id: string): ReviewDraft {
  const now = draft.choreDays[date] ?? [];
  if (!now.includes(id)) return draft;
  return { ...draft, choreDays: { ...draft.choreDays, [date]: now.filter((x) => x !== id) } };
}

/** Moves a chore day from one date to another. */
export function moveChoreDay(draft: ReviewDraft, id: string, from: LocalDate, to: LocalDate): ReviewDraft {
  if (from === to) return draft;
  return addChoreDay(takeOffChoreDay(draft, from, id), to, id);
}

/** Switches one person's kind of day on a date. */
export function setDayType(draft: ReviewDraft, date: LocalDate, memberId: string, dayTypeId: string): ReviewDraft {
  return { ...draft, dayTypes: { ...draft.dayTypes, [date]: { ...draft.dayTypes[date], [memberId]: dayTypeId } } };
}

/** Swaps a meal to another theme, or takes it off (null). */
export function setMeal(draft: ReviewDraft, mealId: string, categoryId: string | null): ReviewDraft {
  return { ...draft, meals: { ...draft.meals, [mealId]: categoryId } };
}

export function dismiss(draft: ReviewDraft, problemId: string): ReviewDraft {
  return draft.dismissed.includes(problemId) ? draft : { ...draft, dismissed: [...draft.dismissed, problemId] };
}

export function applyFix(draft: ReviewDraft, fix: Fix): ReviewDraft {
  return fix.kind === "move" ? moveChoreDay(draft, fix.choreDayId, fix.from, fix.to) : setMeal(draft, fix.mealId, null);
}

/** A meal is off when the draft took it off. */
export function mealIsOff(draft: ReviewDraft, mealId: string): boolean {
  return mealId in draft.meals && draft.meals[mealId] === null;
}

// ---------------------------------------------------------------------------
// Saving: which chore day moves the draft needs
// ---------------------------------------------------------------------------

/**
 * The moves that give each date the chore days in the draft: a move on for
 * each chore day there that doesn't usually fall on that weekday, and a move
 * off for each one that usually does but has been taken away.
 */
export function movesFor(choreDays: ChoreDay[], draft: ReviewDraft, dates: LocalDate[]): ChoreDayMove[] {
  const moves: ChoreDayMove[] = [];
  for (const date of dates) {
    const want = new Set(draft.choreDays[date] ?? []);
    for (const cd of choreDays) {
      if (cd.is_free) continue;
      const usual = cd.weekdays.includes(dayOfWeek(date));
      if (usual !== want.has(cd.id)) moves.push({ chore_day_id: cd.id, date, on: want.has(cd.id) });
    }
  }
  return moves;
}

// ---------------------------------------------------------------------------
// Problems and their fixes
// ---------------------------------------------------------------------------

/**
 * Everything worth a second look this week, each with a suggested fix where
 * there is one. Problems someone dismissed are left out.
 */
export function reviewProblems(input: {
  draft: ReviewDraft;
  days: ReviewDay[];
  choreDays: ChoreDay[];
  /** Theme names, for the meal text. */
  categoryNames: Record<string, string>;
  /** Chores that are hard to schedule. */
  hardChores: { id: string; name: string }[];
}): Problem[] {
  const { draft, days, choreDays } = input;
  const byId = new Map(choreDays.map((d) => [d.id, d]));
  const open = days.filter((d) => !d.past);
  const out: Problem[] = [];

  /** The best other day this week for a chore day: not away, not packed, not already one; nearest, later first. */
  const betterDay = (from: ReviewDay, id: string): ReviewDay | undefined => {
    const index = days.indexOf(from);
    return open
      .filter((d) => d !== from && !d.away && !d.busy && !(draft.choreDays[d.date] ?? []).includes(id))
      .toSorted((a, b) => {
        const da = Math.abs(days.indexOf(a) - index);
        const db = Math.abs(days.indexOf(b) - index);
        return da - db || days.indexOf(b) - days.indexOf(a) || a.busyMinutes - b.busyMinutes;
      })
      .at(0);
  };

  for (const day of open) {
    for (const id of draft.choreDays[day.date] ?? []) {
      const cd = byId.get(id);
      if (!cd || !(day.away || day.busy)) continue;
      const to = betterDay(day, id);
      const why = day.away ? `You're away on ${day.name}, a ${cd.name} day.` : `${day.name} is packed with plans, and it's a ${cd.name} day.`;
      out.push({
        id: `${day.away ? "away" : "busy"}|${day.date}|${id}`,
        date: day.date,
        text: to ? `${why} Move ${cd.name} to ${to.name}?` : `${why} There's no better day this week.`,
        fix: to ? { label: `Move to ${to.name}`, apply: { kind: "move", choreDayId: id, from: day.date, to: to.date } } : undefined,
      });
    }
    for (const meal of day.meals) {
      if (mealIsOff(draft, meal.id) || !(day.away || meal.everyoneOut)) continue;
      const theme = draft.meals[meal.id] ?? meal.categoryId;
      const name = (theme && input.categoryNames[theme]) || meal.mealTimeName;
      out.push({
        id: `meal|${meal.id}`,
        date: day.date,
        text: day.away
          ? `You're away on ${day.name}. Take ${name} off?`
          : `Everyone is out at ${meal.mealTimeName.toLowerCase()} on ${day.name}. Take ${name} off?`,
        fix: { label: "Take it off", apply: { kind: "meal-off", mealId: meal.id } },
      });
    }
  }

  for (const chore of input.hardChores) {
    out.push({
      id: `hard|${chore.id}`,
      date: null,
      text: `${chore.name} is hard to schedule: no chore day has room for it.`,
      link: { label: "Change it", href: `/chores?edit=${chore.id}` },
    });
  }

  return out.filter((p) => !draft.dismissed.includes(p.id));
}

// ---------------------------------------------------------------------------
// When the review is due
// ---------------------------------------------------------------------------

export type ReviewTime = { weekday: number; time: string };

export const DEFAULT_REVIEW_TIME: ReviewTime = { weekday: 6, time: "09:00" };

/**
 * Whether to remind about the review: from the review time in the week
 * before `nextWeek` starts, until that week is confirmed or begins.
 * `weekday` and `time` are the household's local weekday and time now.
 */
export function reviewDue(input: { review: ReviewTime; today: LocalDate; nowTime: string; nextWeek: LocalDate; reviewed: boolean }): boolean {
  if (input.reviewed || input.today >= input.nextWeek) return false;
  // Days from the review day to the start of the next week, counting back from it.
  const daysBefore = (dayOfWeek(input.nextWeek) - input.review.weekday + 7) % 7 || 7;
  const dueOn = addDays(input.nextWeek, -daysBefore);
  return input.today > dueOn || (input.today === dueOn && input.nowTime >= input.review.time);
}

