import { isChoreTag, type ChoreTag } from "./chore-days.ts";
import { SEASONS, seasonOf, spreadFirstDue, upcomingDue, type ChoreRule, type RepeatUnit, type Season } from "./chores.ts";
import { addDays } from "./time.ts";
import { MAX_LEAD_MINUTES } from "./heads-ups.ts";
import type { LocalDate } from "./time.ts";

/*
 * The Chore Manager (2026-11-09) keeps every change on the screen until
 * you press Save, then sends the whole lot at once. These are the shapes
 * it sends, and the checks the screen and the server share.
 *
 * Two kinds of chore:
 *   - Regular: belongs to one chore day and shows every time that day
 *     comes round. Optional time it's due by. No tags, no rule.
 *     (kind "preset" in the database)
 *   - Occasional: comes due on a repeat rule and goes on a chore day with
 *     room. (kind "generated" in the database)
 *
 * Free of other imports so `node --test` can run the tests.
 */

/** New things get a temporary id starting with "new-" until they're saved. */
export const NEW_PREFIX = "new-";

export function isNewId(id: string): boolean {
  return id.startsWith(NEW_PREFIX);
}

export type DraftChoreDay = {
  id: string;
  name: string;
  icon: string | null;
  /** 0 = Sunday … 6 = Saturday. Empty for the Free day. */
  weekdays: number[];
  span: boolean;
  restrictive: boolean;
  max_tasks: number;
  max_big: number;
  is_free: boolean;
  /** Good for errands: errands go on this day first. */
  errands: boolean;
};

export type DraftRegular = {
  id: string;
  chore_day_id: string;
  name: string;
  icon: string | null;
  assignee_id: string | null;
  /** "19:00": done by then. */
  due_time: string | null;
  notes: string | null;
  active: boolean;
};

export type OnlyIn = "any" | "seasons" | "months" | "dates";
export type Snap = "none" | "weekday" | "first_of_month" | "last_of_month" | "first_of_season" | "last_of_season";

export type DraftHeadsUp = {
  id: string;
  label: string;
  minutes_before: number;
  makes: "todo" | "grocery";
};

export type DraftOccasional = {
  id: string;
  name: string;
  icon: string | null;
  assignee_id: string | null;
  tags: ChoreTag[];
  /** The chore days it may go on (empty: any day that isn't restrictive). */
  chore_day_ids: string[];
  repeat_every: number;
  repeat_unit: RepeatUnit;
  repeat_from: "done" | "date";
  start_date: LocalDate | null;
  snap: Snap;
  preferred_weekday: number | null;
  only_in: OnlyIn;
  only_seasons: Season[];
  only_months: number[];
  /** "MM-DD", for "once a year, between dates". */
  season_start: string;
  season_end: string;
  /** "19:00": pinned to its day at that time. */
  at_time: string | null;
  visibility: string;
  notes: string | null;
  active: boolean;
  heads_ups: DraftHeadsUp[];
  /**
   * The first time it's due, for a chore never done. Null: picked for you
   * (a quiet day when it's new; see `autoFirstDues`).
   */
  first_due: LocalDate | null;
};

/** Everything on the Chore Manager. Regular chores are in order within each chore day. */
export type ChoreManagerDraft = {
  days: DraftChoreDay[];
  regular: DraftRegular[];
  occasional: DraftOccasional[];
};

export const UNITS: RepeatUnit[] = ["day", "week", "month", "year"];
export const SNAPS: Snap[] = ["none", "weekday", "first_of_month", "last_of_month", "first_of_season", "last_of_season"];
const VISIBILITIES = ["everyone", "adults", "just_me"];
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
/** Room for this many heads-ups on the editor without scrolling. */
export const MAX_HEADS_UPS = 4;

function short(name: string) {
  return name.length > 24 ? `${name.slice(0, 22)}…` : name;
}

/** The first problem with a draft, in plain words, or null when it can be saved. */
export function draftProblem(draft: ChoreManagerDraft): string | null {
  const dayIds = new Set(draft.days.map((d) => d.id));
  if (draft.days.filter((d) => d.is_free).length > 1) return "There can only be one Free day.";
  for (const d of draft.days) {
    const name = d.name.trim();
    if (!name) return "Every chore day needs a name.";
    if (name.length > 40) return `"${short(name)}" is too long a name for a chore day (40 letters at most).`;
    if (!d.is_free && d.weekdays.length === 0) return `Pick at least one day of the week for ${name}.`;
    if (d.weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) return `Check the days of the week for ${name}.`;
    for (const n of [d.max_tasks, d.max_big]) if (!Number.isInteger(n) || n < 0 || n > 20) return `${name} has room for 0 to 20 chores.`;
    if (d.icon && [...d.icon].length > 4) return `The picture for ${name} should be one emoji.`;
  }
  for (const c of draft.regular) {
    const name = c.name.trim();
    if (!name) return "Every chore needs a name.";
    if (name.length > 80) return `"${short(name)}" is too long (80 letters at most).`;
    if (!dayIds.has(c.chore_day_id)) return `${name} needs a chore day.`;
    if (c.due_time && !TIME.test(c.due_time)) return `The time for ${name} should look like 7 pm`;
    if (c.notes && c.notes.length > 2000) return `The notes for ${name} are too long.`;
    if (c.icon && [...c.icon].length > 4) return `The picture for ${name} should be one emoji.`;
  }
  for (const c of draft.occasional) {
    const name = c.name.trim();
    if (!name) return "Every chore needs a name.";
    if (name.length > 80) return `"${short(name)}" is too long (80 letters at most).`;
    if (c.icon && [...c.icon].length > 4) return `The picture for ${name} should be one emoji.`;
    if (c.tags.some((t) => !isChoreTag(t))) return `Check the tags on ${name}.`;
    if (c.chore_day_ids.some((id) => !dayIds.has(id))) return `One of ${name}'s chore days is gone. Pick its days again.`;
    const yearly = c.only_in === "dates";
    if (yearly) {
      if (!MONTH_DAY.test(c.season_start) || !MONTH_DAY.test(c.season_end)) return `Pick the dates for ${name}.`;
    } else {
      if (!Number.isInteger(c.repeat_every) || c.repeat_every < 1 || c.repeat_every > 365) return `${name} repeats every 1 to 365.`;
      if (!UNITS.includes(c.repeat_unit)) return `Choose how often ${name} comes back.`;
      if (c.repeat_from === "date" && !(c.start_date && DATE.test(c.start_date))) return `Pick the date ${name} counts from.`;
      if (!SNAPS.includes(c.snap)) return `Choose where ${name} lands.`;
      if (c.snap !== "none" && (c.preferred_weekday === null || c.preferred_weekday < 0 || c.preferred_weekday > 6))
        return `Pick which day of the week ${name} lands on.`;
    }
    if (c.only_in === "seasons" && c.only_seasons.length === 0) return `Pick at least one season for ${name}.`;
    if (c.only_in === "months" && c.only_months.length === 0) return `Pick at least one month for ${name}.`;
    if (c.at_time && !TIME.test(c.at_time)) return `The time for ${name} should look like 7 pm`;
    if (c.first_due && !DATE.test(c.first_due)) return `Pick the first date for ${name} again.`;
    if (!VISIBILITIES.includes(c.visibility)) return `Choose who can see ${name}.`;
    if (c.notes && c.notes.length > 2000) return `The notes for ${name} are too long.`;
    if (c.heads_ups.length > MAX_HEADS_UPS) return `${name} can have ${MAX_HEADS_UPS} heads-ups at most.`;
    for (const h of c.heads_ups) {
      if (!h.label.trim() || h.label.trim().length > 80) return `Each heads-up on ${name} needs a short name.`;
      if (!Number.isInteger(h.minutes_before) || h.minutes_before < 0 || h.minutes_before > MAX_LEAD_MINUTES)
        return `A heads-up on ${name} can be up to 60 days before.`;
    }
  }
  return null;
}

export function sameDraft(a: ChoreManagerDraft, b: ChoreManagerDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The rule columns saved for an occasional chore. */
export function ruleColumns(c: DraftOccasional) {
  const yearly = c.only_in === "dates";
  const snapped = !yearly && c.snap !== "none";
  return {
    repeat_every: yearly ? 1 : c.repeat_every,
    repeat_unit: yearly ? "year" : c.repeat_unit,
    preferred_weekday: snapped ? c.preferred_weekday : null,
    snap: snapped ? c.snap : "none",
    repeat_from: yearly ? "done" : c.repeat_from,
    start_date: !yearly && c.repeat_from === "date" ? c.start_date : null,
    only_seasons: c.only_in === "seasons" ? c.only_seasons : null,
    only_months: c.only_in === "months" ? c.only_months : null,
    season_start: yearly ? c.season_start : null,
    season_end: yearly ? c.season_end : null,
  };
}

/**
 * The season tabs for the occasional list, starting with the one today is
 * in: each chore goes under the season it's next due in (overdue ones under
 * this season), soonest first.
 */
export function seasonTabs<T extends { dueOn: LocalDate }>(chores: T[], today: LocalDate): { season: Season; label: string; chores: T[] }[] {
  const now = seasonOf(today).season;
  const start = SEASONS.findIndex((s) => s.season === now);
  const order = SEASONS.map((_, i) => SEASONS[(start + i) % SEASONS.length]);
  const sorted = chores.toSorted((a, b) => a.dueOn.localeCompare(b.dueOn));
  return order.map((s) => ({
    season: s.season,
    label: s.label,
    chores: sorted.filter((c) => (c.dueOn <= today ? now : seasonOf(c.dueOn).season) === s.season),
  }));
}

/** An occasional chore's rule, as the timing code reads it. */
export function draftRule(c: DraftOccasional): ChoreRule {
  return { ...ruleColumns(c), first_due: c.first_due } as ChoreRule;
}

/** How far ahead other chores' due dates are counted when picking a quiet day. */
const LOOK_AHEAD_DAYS = 70;

/**
 * The quiet first day picked for each new occasional chore that doesn't
 * have one set: away from the other chores' coming due dates (`dueOn` for
 * saved chores), and from the new ones picked before it.
 */
export function autoFirstDues(occasional: DraftOccasional[], dueOn: Record<string, LocalDate>, today: LocalDate): Map<string, LocalDate> {
  const until = addDays(today, LOOK_AHEAD_DAYS);
  const others: LocalDate[] = [];
  for (const c of occasional) {
    if (!c.active) continue;
    const due = isNewId(c.id) ? c.first_due : dueOn[c.id];
    if (due) others.push(...upcomingDue(due, draftRule(c), today, until));
  }
  const picked = new Map<string, LocalDate>();
  for (const c of occasional) {
    if (!isNewId(c.id) || c.first_due || !c.active) continue;
    const rule = draftRule(c);
    const d = spreadFirstDue(rule, today, others);
    if (!d) continue;
    picked.set(c.id, d);
    others.push(...upcomingDue(d, rule, today, until));
  }
  return picked;
}

/** Whether a chore's first date can be picked: not a set schedule or a once-a-year window. */
export function hasFirstDue(c: DraftOccasional): boolean {
  return c.only_in !== "dates" && c.repeat_from !== "date";
}
