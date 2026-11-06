import { dayOfWeek } from "./calendar-layout.ts";
import { addDays, type LocalDate } from "./time.ts";

/*
 * Day types: what kind of day a person is having ("Weekday", "Weekend",
 * "Night shift"). A day type holds their wake-up time, bedtime and
 * routines. A week plan picks a day type for each weekday; someone can
 * have several week plans and swap them, or let them take turns each
 * week. Any one date can be switched to another day type.
 */

export type DayType = { id: string; member_id: string; name: string; icon: string | null; wake_time: string; bed_time: string; sort_order: number };
export type WeekPlan = { id: string; member_id: string; name: string; sort_order: number };
export type WeekPlanDay = { week_plan_id: string; weekday: number; day_type_id: string };
export type DayOverride = { member_id: string; date: string; day_type_id: string | null; wake_time: string | null; bed_time: string | null };
export type WeekSettings = { id: string; current_week_plan_id: string | null; week_plans_rotate: boolean; rotation_start: string | null };

export type DayTypeData = {
  dayTypes: DayType[];
  weekPlans: WeekPlan[];
  weekPlanDays: WeekPlanDay[];
  overrides: DayOverride[];
};

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
): { dayType: DayType | null; wake: string; bed: string; switched: boolean } {
  const override = data.overrides.find((o) => o.member_id === member.id && o.date === date);
  const plan = weekPlanFor(member, data.weekPlans, date);
  const planned = plan ? data.weekPlanDays.find((d) => d.week_plan_id === plan.id && d.weekday === dayOfWeek(date)) : undefined;
  const mine = data.dayTypes.filter((t) => t.member_id === member.id);
  const typeId = override?.day_type_id ?? planned?.day_type_id;
  const dayType = mine.find((t) => t.id === typeId) ?? mine.toSorted((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  return {
    dayType,
    wake: (override?.wake_time ?? dayType?.wake_time ?? "07:00").slice(0, 5),
    bed: (override?.bed_time ?? dayType?.bed_time ?? "21:30").slice(0, 5),
    switched: Boolean(override?.day_type_id && override.day_type_id !== planned?.day_type_id),
  };
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
