import { createClient } from "@/lib/supabase/server";
import { dayFor } from "@/lib/day-types";
import { combineDays, datesBetween, habitDay, habitStats, type HabitDay, type HabitStats } from "@/lib/habits";
import { assignmentsForDay, stepsForMember } from "@/lib/routines";
import { addDays, type LocalDate } from "@/lib/time";
import { loadBreaks, loadEventDays, type RoutineData, type RoutineStep, type RoutineTemplate } from "./data";

/*
 * Habit history for one person: for each tracked routine, and each of its
 * tracked steps, what happened on each day.
 *
 * Whether a routine was "on" for a past day is worked out from the person's
 * routines and kinds of day as they are set up now, plus any day that was
 * switched to another kind of day.
 */

export type HabitRow = {
  template: RoutineTemplate;
  /** Null for the routine as a whole. */
  step: RoutineStep | null;
  /** One per date, oldest first. */
  days: HabitDay[];
  stats: HabitStats;
};

export type HabitHistory = {
  dates: LocalDate[];
  /** The whole routine's row, then one row per tracked step. */
  routines: { routine: HabitRow; steps: HabitRow[] }[];
};

/** Is a routine tracked, and which of its steps? */
export function trackedSteps(template: RoutineTemplate, steps: RoutineStep[]): RoutineStep[] {
  if (!template.habit_since) return [];
  return steps.filter((s) => s.template_id === template.id && s.habit);
}

/**
 * A person's habit history from `from` to `to` (normally today).
 * `data` is loadRoutines(today), for the routines and kinds of day.
 */
export async function loadHabitHistory(data: RoutineData, memberId: string, from: LocalDate, to: LocalDate, today: LocalDate): Promise<HabitHistory> {
  const member = data.members.find((m) => m.id === memberId);
  const tracked = data.templates
    // Only this person's own steps in a shared routine.
    .map((template) => ({ template, steps: stepsForMember(trackedSteps(template, data.steps), memberId) }))
    .filter((t) => t.steps.length > 0 && data.assignments.some((a) => a.member_id === memberId && a.template_id === t.template.id));
  const dates = datesBetween(from, to);
  if (!member || tracked.length === 0) return { dates, routines: [] };

  const supabase = await createClient();
  const [checks, overrides, days, breaks, eventDays] = await Promise.all([
    supabase.from("routine_checks").select("step_id, check_date").eq("member_id", memberId).gte("check_date", from).lte("check_date", to),
    supabase
      .from("day_overrides")
      .select("member_id, date, day_type_id, wake_time, bed_time")
      .eq("member_id", memberId)
      .gte("date", addDays(from, -1))
      .lte("date", to),
    supabase.from("days").select("date, energy_mode").gte("date", from).lte("date", to),
    loadBreaks(from, to),
    loadEventDays(from, to),
  ]);
  for (const r of [checks, overrides, days]) if (r.error) throw r.error;

  const ticked = new Set((checks.data ?? []).map((c) => `${c.step_id}:${c.check_date}`));
  const survival = new Set((days.data ?? []).filter((d) => d.energy_mode === "survival").map((d) => d.date));
  const rangeData = { ...data, overrides: overrides.data ?? [], breaks, eventDays };
  const kindOf = (id: string) => data.templates.find((t) => t.id === id)?.kind;

  // Which routines were on for this person, each day.
  const onByDate = new Map(
    dates.map((date) => {
      const dayTypeId = dayFor(member, rangeData, date).dayType?.id ?? null;
      return [date, new Set(assignmentsForDay(data.assignments, memberId, date, dayTypeId, kindOf).map((a) => a.template_id))];
    }),
  );

  return {
    dates,
    routines: tracked.map(({ template, steps }) => {
      const since = template.habit_since ?? today;
      const stepRows = steps.map((step) => {
        const stepDays = dates.map((date) =>
          habitDay({ date, scheduled: onByDate.get(date)?.has(template.id) ?? false, done: ticked.has(`${step.id}:${date}`), survival: survival.has(date) }, since, today),
        );
        return { template, step, days: stepDays, stats: habitStats(stepDays) };
      });
      const routineDays = dates.map((_, i) => combineDays(stepRows.map((r) => r.days[i])));
      return { routine: { template, step: null, days: routineDays, stats: habitStats(routineDays) }, steps: stepRows };
    }),
  };
}

/** How far back the streak on a checklist card looks. */
export const STREAK_LOOKBACK_DAYS = 120;

/** Each tracked routine's current streak for a person, by routine id. */
export async function routineStreaks(data: RoutineData, memberId: string, today: LocalDate): Promise<Map<string, HabitStats>> {
  const history = await loadHabitHistory(data, memberId, addDays(today, -STREAK_LOOKBACK_DAYS), today, today);
  return new Map(history.routines.map((r) => [r.routine.template.id, r.routine.stats]));
}
