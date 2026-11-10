import { dayOfWeek } from "./calendar-layout.ts";
import { addDays, localDateOf, type LocalDate } from "./time.ts";

/*
 * Day types: what kind of day a person is having ("Weekday", "Weekend",
 * "Night shift"). A day type holds their wake-up time, bedtime and
 * routines. A week plan picks a day type for each weekday; someone can
 * have several week plans and swap them, or let them take turns each
 * week. A break (a holiday, summer) gives people another kind of day, or
 * another week plan, for a few dates. An event can make its dates a kind
 * of day too ("Office day"), for the people on it.
 *
 * Which one wins, most first: a day changed by hand (or in the weekly
 * review), a break, an event, then the week plan.
 */

export type DayType = {
  id: string;
  member_id: string;
  name: string;
  icon: string | null;
  wake_time: string;
  bed_time: string;
  sort_order: number;
  /** Good for errands: the chore planner puts errands on these days first. */
  errands?: boolean;
};
export type WeekPlan = { id: string; member_id: string; name: string; sort_order: number };
export type WeekPlanDay = { week_plan_id: string; weekday: number; day_type_id: string };
export type DayOverride = { member_id: string; date: string; day_type_id: string | null; wake_time: string | null; bed_time: string | null };
/** A break, and for each person on it their kind of day or week plan (neither: usual days). */
export type Break = {
  id: string;
  name: string;
  icon: string | null;
  start_date: string;
  end_date: string;
  /** Away from home (no chores). */
  away?: boolean;
  /** Made by the weekly review when it switched a day's kind. */
  from_review?: boolean;
  people: { member_id: string; day_type_id: string | null; week_plan_id: string | null }[];
};
export type WeekSettings = { id: string; current_week_plan_id: string | null; week_plans_rotate: boolean; rotation_start: string | null };

/**
 * An event that makes its dates a kind of day ("Office day") for the people
 * on it (none: everyone). Kinds of day are matched by name, since each
 * person has their own.
 */
export type EventDay = { title: string; name: string; member_ids: string[]; dates: LocalDate[] };

export type DayTypeData = {
  dayTypes: DayType[];
  weekPlans: WeekPlan[];
  weekPlanDays: WeekPlanDay[];
  overrides: DayOverride[];
  breaks: Break[];
  /** Events that set the kind of day, in start order. */
  eventDays?: EventDay[];
};

/** Kind-of-day names match whatever the capitals and spaces. */
export function sameKind(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The dates an event makes a kind of day: every date of an all-day event,
 * or the date a timed one starts on (a night shift is the day it starts).
 */
export function eventDates(startsAt: string, endsAt: string, allDay: boolean, timeZone: string): LocalDate[] {
  const first = localDateOf(new Date(startsAt), timeZone);
  if (!allDay) return [first];
  const last = addDays(localDateOf(new Date(endsAt), timeZone), -1);
  const dates: LocalDate[] = [first];
  for (let d = addDays(first, 1); d <= last && dates.length < 366; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** The break a person is on for a date, if any (the one that started last). */
export function breakFor(memberId: string, breaks: Break[], date: LocalDate): Break | null {
  return (
    breaks
      .filter((b) => b.start_date <= date && date <= b.end_date && b.people.some((p) => p.member_id === memberId))
      .toSorted((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0))[0] ?? null
  );
}

/** The Sunday on or before a date. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -dayOfWeek(date));
}

/** Which week plan a person is on for the week holding a date. */
export function weekPlanFor(member: WeekSettings, plans: WeekPlan[], date: LocalDate): WeekPlan | null {
  const mine = plans.filter((p) => p.member_id === member.id).toSorted((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  if (mine.length === 0) return null;
  if (member.week_plans_rotate && member.rotation_start && mine.length > 1) {
    const weeks = Math.floor(daysBetween(weekStart(member.rotation_start), weekStart(date)) / 7);
    return mine[((weeks % mine.length) + mine.length) % mine.length];
  }
  return mine.find((p) => p.id === member.current_week_plan_id) ?? mine[0];
}

/** The person's day type on a date, and their wake-up and bedtime that day. */
export function dayFor(
  member: WeekSettings,
  data: DayTypeData,
  date: LocalDate,
): { dayType: DayType | null; wake: string; bed: string; switched: boolean; onBreak: Break | null; fromEvent: string | null } {
  const override = data.overrides.find((o) => o.member_id === member.id && o.date === date);
  const onBreak = breakFor(member.id, data.breaks, date);
  const onIt = onBreak?.people.find((p) => p.member_id === member.id);
  const breakPlan = onIt?.week_plan_id ? data.weekPlans.find((p) => p.id === onIt.week_plan_id && p.member_id === member.id) : undefined;
  const plan = breakPlan ?? weekPlanFor(member, data.weekPlans, date);
  const planned = plan ? data.weekPlanDays.find((d) => d.week_plan_id === plan.id && d.weekday === dayOfWeek(date)) : undefined;
  const mine = data.dayTypes.filter((t) => t.member_id === member.id);
  const breakType = onIt?.day_type_id && mine.some((t) => t.id === onIt.day_type_id) ? onIt.day_type_id : undefined;
  // An event only counts when no change by hand or break already says what kind of day it is.
  const event =
    override?.day_type_id || breakType || breakPlan
      ? undefined
      : (data.eventDays ?? []).findLast(
          (e) => e.dates.includes(date) && (e.member_ids.length === 0 || e.member_ids.includes(member.id)) && mine.some((t) => sameKind(t.name, e.name)),
        );
  const eventType = event ? mine.find((t) => sameKind(t.name, event.name)) : undefined;
  const typeId = override?.day_type_id ?? breakType ?? eventType?.id ?? planned?.day_type_id;
  const dayType = mine.find((t) => t.id === typeId) ?? mine.toSorted((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  return {
    dayType,
    wake: (override?.wake_time ?? dayType?.wake_time ?? "07:00").slice(0, 5),
    bed: (override?.bed_time ?? dayType?.bed_time ?? "21:30").slice(0, 5),
    switched: Boolean(override?.day_type_id && override.day_type_id !== planned?.day_type_id),
    onBreak,
    fromEvent: eventType && event ? event.title : null,
  };
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
