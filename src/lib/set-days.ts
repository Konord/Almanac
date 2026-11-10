import { weekStart } from "./day-types.ts";
import { addDays, type LocalDate } from "./time.ts";

/*
 * Set days keeps every change on the screen until you press Save, then
 * sends the whole lot at once (like the Routine Manager). These are the
 * shapes it sends, and the changes and checks the screen and the server
 * share.
 *
 * Kinds of day still belong to one person each (so each person keeps their
 * own wake-up and bedtime), but kinds of day with the same name are shown
 * and named together: "School day" for Mia and Leo is one card.
 */

export const NEW_PREFIX = "new-";
export const isNewId = (id: string) => id.startsWith(NEW_PREFIX);

export type DraftDayType = {
  id: string;
  member_id: string;
  /** Kinds of day in the same group share a name and picture. */
  group: string;
  name: string;
  icon: string | null;
  /** "07:00" */
  wake: string;
  bed: string;
  /** Good for errands (the same for the whole group). */
  errands: boolean;
};

export type DraftWeekPlan = { id: string; member_id: string; name: string };
export type DraftPlanDay = { plan_id: string; weekday: number; day_type_id: string };

/** Which week a person is on, or whether their weeks take turns. */
export type DraftMemberWeek = {
  member_id: string;
  current_week_plan_id: string | null;
  rotate: boolean;
  /** The Sunday the first week's turn started. */
  rotation_start: string | null;
};

export type DraftBreakPerson = { member_id: string; day_type_id: string | null; week_plan_id: string | null };

export type DraftBreak = {
  id: string;
  name: string;
  icon: string | null;
  start: string;
  end: string;
  /** Away from home: chores that show every chore day are skipped, the rest wait. */
  away?: boolean;
  people: DraftBreakPerson[];
};

/** Everything on Set days. Kinds of day and week plans are in order. */
export type DaysDraft = {
  dayTypes: DraftDayType[];
  weekPlans: DraftWeekPlan[];
  planDays: DraftPlanDay[];
  members: DraftMemberWeek[];
  breaks: DraftBreak[];
};

/** The group key for a kind of day's name. */
export function groupKey(name: string): string {
  return name.trim().toLowerCase();
}

export type DayTypeGroup = { group: string; name: string; icon: string | null; types: DraftDayType[] };

/** Kinds of day with the same group, in the order they first appear. */
export function groupsOf(dayTypes: DraftDayType[]): DayTypeGroup[] {
  const groups: DayTypeGroup[] = [];
  for (const t of dayTypes) {
    const found = groups.find((g) => g.group === t.group);
    if (found) found.types.push(t);
    else groups.push({ group: t.group, name: t.name, icon: t.icon, types: [t] });
  }
  return groups;
}

/** Takes a kind of day away. Weekdays that used it use the person's first other kind of day. */
export function removeDayType(draft: DaysDraft, id: string): DaysDraft {
  const gone = draft.dayTypes.find((t) => t.id === id);
  if (!gone) return draft;
  const other = draft.dayTypes.find((t) => t.member_id === gone.member_id && t.id !== id);
  if (!other) return draft;
  return {
    ...draft,
    dayTypes: draft.dayTypes.filter((t) => t.id !== id),
    planDays: draft.planDays.map((d) => (d.day_type_id === id ? { ...d, day_type_id: other.id } : d)),
    breaks: draft.breaks.map((b) => ({ ...b, people: b.people.map((p) => (p.day_type_id === id ? { ...p, day_type_id: null } : p)) })),
  };
}

/** Adds a week for a person, starting as a copy of another of their weeks. */
export function addWeekPlan(draft: DaysDraft, memberId: string, id: string, name: string, copyFrom?: string): DaysDraft {
  const days = draft.planDays.filter((d) => d.plan_id === copyFrom).map((d) => ({ ...d, plan_id: id }));
  const first = draft.dayTypes.find((t) => t.member_id === memberId);
  const filled = days.length === 7 || !first ? days : [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ plan_id: id, weekday, day_type_id: first.id }));
  return { ...draft, weekPlans: [...draft.weekPlans, { id, member_id: memberId, name }], planDays: [...draft.planDays, ...filled] };
}

/** Takes a week away. If it was in use, the person's first other week is used. */
export function removeWeekPlan(draft: DaysDraft, id: string): DaysDraft {
  const gone = draft.weekPlans.find((p) => p.id === id);
  if (!gone) return draft;
  const left = draft.weekPlans.filter((p) => p.member_id === gone.member_id && p.id !== id);
  if (left.length === 0) return draft;
  return {
    ...draft,
    weekPlans: draft.weekPlans.filter((p) => p.id !== id),
    planDays: draft.planDays.filter((d) => d.plan_id !== id),
    members: draft.members.map((m) =>
      m.member_id === gone.member_id
        ? {
            ...m,
            current_week_plan_id: m.current_week_plan_id === id ? left[0].id : m.current_week_plan_id,
            rotate: m.rotate && left.length > 1,
            rotation_start: m.rotate && left.length > 1 ? m.rotation_start : null,
          }
        : m,
    ),
    breaks: draft.breaks.map((b) => ({ ...b, people: b.people.map((p) => (p.week_plan_id === id ? { ...p, week_plan_id: null } : p)) })),
  };
}

/** Lets a person's weeks take turns, with `planId` this week and the others after it in order. */
export function takeTurns(draft: DaysDraft, memberId: string, planId: string, today: LocalDate): DaysDraft {
  const plans = draft.weekPlans.filter((p) => p.member_id === memberId);
  const index = Math.max(0, plans.findIndex((p) => p.id === planId));
  const start = weekStart(addDays(today, -7 * index));
  return {
    ...draft,
    members: draft.members.map((m) => (m.member_id === memberId ? { ...m, current_week_plan_id: planId, rotate: true, rotation_start: start } : m)),
  };
}

/** Puts a person on one week, every week. */
export function pickWeek(draft: DaysDraft, memberId: string, planId: string): DaysDraft {
  return {
    ...draft,
    members: draft.members.map((m) => (m.member_id === memberId ? { ...m, current_week_plan_id: planId, rotate: false, rotation_start: null } : m)),
  };
}

const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The first problem with a draft, in plain words, or null when it can be saved. */
export function daysProblem(draft: DaysDraft, names: Record<string, string> = {}): string | null {
  const who = (id: string) => names[id] ?? "Someone";
  for (const m of draft.members) {
    if (!draft.dayTypes.some((t) => t.member_id === m.member_id)) return `${who(m.member_id)} needs at least one kind of day.`;
    if (!draft.weekPlans.some((p) => p.member_id === m.member_id)) return `${who(m.member_id)} needs at least one week.`;
  }
  const seen = new Set<string>();
  for (const t of draft.dayTypes) {
    const name = t.name.trim();
    if (!name) return "Every kind of day needs a name.";
    if (name.length > 30) return `"${name.slice(0, 20)}…" is too long a name (30 letters at most).`;
    const key = `${t.member_id}|${groupKey(name)}`;
    if (seen.has(key)) return `${who(t.member_id)} has two kinds of day called ${name}.`;
    seen.add(key);
    if (!TIME.test(t.wake) || !TIME.test(t.bed)) return `Choose a wake-up and bedtime for ${name}.`;
  }
  const typeOwner = new Map(draft.dayTypes.map((t) => [t.id, t.member_id]));
  const planOwner = new Map(draft.weekPlans.map((p) => [p.id, p.member_id]));
  for (const p of draft.weekPlans) {
    const name = p.name.trim();
    if (!name) return "Every week needs a name.";
    if (name.length > 30) return `"${name.slice(0, 20)}…" is too long a name for a week (30 letters at most).`;
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = draft.planDays.find((d) => d.plan_id === p.id && d.weekday === weekday);
      if (!day || typeOwner.get(day.day_type_id) !== p.member_id) return `Pick a kind of day for every day of ${name}.`;
    }
  }
  for (const m of draft.members) {
    if (m.current_week_plan_id && planOwner.get(m.current_week_plan_id) !== m.member_id) return `Choose which week ${who(m.member_id)} is on.`;
    if (m.rotate && !(m.rotation_start && DATE.test(m.rotation_start))) return `Choose when ${who(m.member_id)}'s weeks start taking turns.`;
  }
  for (const b of draft.breaks) {
    const name = b.name.trim();
    if (!name) return "Every break needs a name.";
    if (name.length > 40) return `"${name.slice(0, 20)}…" is too long a name for a break (40 letters at most).`;
    if (!DATE.test(b.start) || !DATE.test(b.end)) return `Choose the dates for ${name}.`;
    if (b.end < b.start) return `${name} ends before it starts.`;
    if (Date.parse(b.end) - Date.parse(b.start) > 366 * 86_400_000) return `${name} is longer than a year.`;
    if (b.people.length === 0) return `Choose who ${name} is for.`;
    for (const p of b.people) {
      if (p.day_type_id && typeOwner.get(p.day_type_id) !== p.member_id) return `Choose ${who(p.member_id)}'s kind of day for ${name} again.`;
      if (p.week_plan_id && planOwner.get(p.week_plan_id) !== p.member_id) return `Choose ${who(p.member_id)}'s week for ${name} again.`;
      if (p.day_type_id && p.week_plan_id) return `Choose a kind of day or a week for ${who(p.member_id)} on ${name}, not both.`;
    }
  }
  return null;
}

/** True when two drafts would save the same thing. */
export function sameDays(a: DaysDraft, b: DaysDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
