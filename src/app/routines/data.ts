import { createClient } from "@/lib/supabase/server";
import { dayFor, type Break, type DayTypeData } from "@/lib/day-types";
import type { Anchor } from "@/lib/routine-placement";
import { assignmentsForDay, isRoutineKind, routineProgress, stepsForMember, type Progress, type RoutineKind } from "@/lib/routines";
import { addDays, type LocalDate } from "@/lib/time";

export type RoutineMember = {
  id: string;
  name: string;
  role: string;
  colour: string;
  icon: string | null;
  current_week_plan_id: string | null;
  week_plans_rotate: boolean;
  rotation_start: string | null;
};
export type RoutineTemplate = {
  id: string;
  name: string;
  kind: RoutineKind;
  audience: string;
  premade: boolean;
  visibility: string;
  usual_start: string | null;
  usual_minutes: number | null;
  anchor: Anchor;
  anchor_meal_time_id: string | null;
  anchor_offset: number;
  loose: boolean;
  /** When habit tracking was switched on; null when it's off. */
  habit_since: string | null;
};
export type RoutineStep = {
  id: string;
  template_id: string;
  text: string;
  icon: string | null;
  position: number;
  target_time: string | null;
  essential: boolean;
  /** Tracked as a habit when the routine is tracked. */
  habit: boolean;
  /** Also shows on the daily list in the Today panel. */
  daily_list: boolean;
  /** Who does this step. Empty: everyone who has the routine. */
  member_ids: string[];
};
export type RoutineAssignment = {
  id: string;
  template_id: string;
  member_id: string;
  day_type_id: string | null;
  on_date: string | null;
  active: boolean;
};

export type RoutineData = DayTypeData & {
  members: RoutineMember[];
  templates: RoutineTemplate[];
  steps: RoutineStep[];
  assignments: RoutineAssignment[];
  /** "memberId:stepId" for each step ticked on the date. */
  checked: Set<string>;
  /** "memberId:templateId" for each routine ended early on the date. */
  ended: Set<string>;
};

/** Everything about routines, plus the ticks for one date. */
export async function loadRoutines(date: LocalDate): Promise<RoutineData> {
  const supabase = await createClient();
  const [members, templates, steps, assignments, checks, dayTypes, weekPlans, weekPlanDays, overrides, ends, breaks] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, role, colour, icon, current_week_plan_id, week_plans_rotate, rotation_start")
      .order("sort_order")
      .order("name"),
    supabase
      .from("routine_templates")
      .select("id, name, kind, audience, premade, visibility, usual_start, usual_minutes, anchor, anchor_meal_time_id, anchor_offset, loose, habit_since")
      .order("sort_order")
      .order("name"),
    supabase
      .from("routine_steps")
      .select("id, template_id, text, icon, position, target_time, essential, habit, daily_list, routine_step_members (member_id)")
      .order("position"),
    supabase.from("routine_assignments").select("id, template_id, member_id, day_type_id, on_date, active").order("created_at"),
    supabase.from("routine_checks").select("member_id, step_id").eq("check_date", date),
    supabase.from("day_types").select("id, member_id, name, icon, wake_time, bed_time, sort_order").order("sort_order").order("name"),
    supabase.from("week_plans").select("id, member_id, name, sort_order").order("sort_order").order("name"),
    supabase.from("week_plan_days").select("week_plan_id, weekday, day_type_id"),
    supabase.from("day_overrides").select("member_id, date, day_type_id, wake_time, bed_time").gte("date", addDays(date, -1)).lte("date", addDays(date, 7)),
    supabase.from("routine_ends").select("member_id, template_id").eq("end_date", date),
    loadBreaks(addDays(date, -1), addDays(date, 7)),
  ]);
  for (const r of [members, templates, steps, assignments, checks, dayTypes, weekPlans, weekPlanDays, overrides, ends]) if (r.error) throw r.error;

  return {
    members: members.data ?? [],
    templates: (templates.data ?? []).map((t) => ({
      ...t,
      kind: isRoutineKind(t.kind) ? t.kind : "daily",
      anchor: (["wake", "bed", "meal", "clock"] as const).find((a) => a === t.anchor) ?? "clock",
    })),
    steps: (steps.data ?? []).map(({ routine_step_members, ...step }) => ({
      ...step,
      member_ids: (routine_step_members ?? []).map((m) => m.member_id),
    })),
    assignments: assignments.data ?? [],
    checked: new Set((checks.data ?? []).map((c) => `${c.member_id}:${c.step_id}`)),
    ended: new Set((ends.data ?? []).map((e) => `${e.member_id}:${e.template_id}`)),
    dayTypes: dayTypes.data ?? [],
    weekPlans: weekPlans.data ?? [],
    weekPlanDays: weekPlanDays.data ?? [],
    overrides: overrides.data ?? [],
    breaks,
  };
}

/** Breaks that touch the dates from `from` to `to`, with who's on each. */
export async function loadBreaks(from: LocalDate, to: LocalDate): Promise<Break[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("breaks")
    .select("id, name, icon, start_date, end_date, away, from_review, break_members (member_id, day_type_id, week_plan_id)")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(({ break_members, ...b }) => ({ ...b, people: break_members ?? [] }));
}

export type DayRoutine = {
  assignment: RoutineAssignment;
  template: RoutineTemplate;
  steps: RoutineStep[];
  progress: Progress<RoutineStep>;
  /** The steps ticked off on the date. */
  doneIds: Set<string>;
};

/** A person's day type on a date, with their wake-up and bedtime ("07:00"). */
export function personDay(data: RoutineData, memberId: string, date: LocalDate): ReturnType<typeof dayFor> {
  const member = data.members.find((m) => m.id === memberId);
  if (!member) return { dayType: null, wake: "07:00", bed: "21:30", switched: false, onBreak: null };
  return dayFor(member, data, date);
}

/** One person's routines on a date, in order, with their progress. */
export function dayRoutinesFor(data: RoutineData, memberId: string, date: LocalDate): DayRoutine[] {
  const templateById = new Map(data.templates.map((t) => [t.id, t]));
  const dayTypeId = personDay(data, memberId, date).dayType?.id ?? null;
  return assignmentsForDay(data.assignments, memberId, date, dayTypeId, (id) => templateById.get(id)?.kind).flatMap((assignment) => {
    const template = templateById.get(assignment.template_id);
    if (!template) return [];
    // A shared routine: each person only gets their own steps.
    const all = data.steps.filter((s) => s.template_id === template.id);
    const steps = stepsForMember(all, memberId);
    // On the routine but with nothing of their own to do: nothing to show.
    if (all.length > 0 && steps.length === 0) return [];
    const done = new Set(steps.filter((s) => data.checked.has(`${memberId}:${s.id}`)).map((s) => s.id));
    return [{ assignment, template, steps, doneIds: done, progress: routineProgress(steps, done) }];
  });
}
