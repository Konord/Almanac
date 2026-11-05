import { createClient } from "@/lib/supabase/server";
import { assignmentsForDay, isRoutineKind, routineProgress, type Progress, type RoutineKind } from "@/lib/routines";
import type { LocalDate } from "@/lib/time";

export type RoutineMember = { id: string; name: string; role: string; colour: string };
export type RoutineTemplate = {
  id: string;
  name: string;
  kind: RoutineKind;
  audience: string;
  premade: boolean;
  visibility: string;
};
export type RoutineStep = {
  id: string;
  template_id: string;
  text: string;
  icon: string | null;
  position: number;
  target_time: string | null;
  essential: boolean;
};
export type RoutineAssignment = {
  id: string;
  template_id: string;
  member_id: string;
  weekdays: number[] | null;
  on_date: string | null;
  active: boolean;
};

export type RoutineData = {
  members: RoutineMember[];
  templates: RoutineTemplate[];
  steps: RoutineStep[];
  assignments: RoutineAssignment[];
  /** "memberId:stepId" for each step ticked on the date. */
  checked: Set<string>;
};

/** Everything about routines, plus the ticks for one date. */
export async function loadRoutines(date: LocalDate): Promise<RoutineData> {
  const supabase = await createClient();
  const [members, templates, steps, assignments, checks] = await Promise.all([
    supabase.from("members").select("id, name, role, colour").order("sort_order").order("name"),
    supabase.from("routine_templates").select("id, name, kind, audience, premade, visibility").order("sort_order").order("name"),
    supabase.from("routine_steps").select("id, template_id, text, icon, position, target_time, essential").order("position"),
    supabase.from("routine_assignments").select("id, template_id, member_id, weekdays, on_date, active").order("created_at"),
    supabase.from("routine_checks").select("member_id, step_id").eq("check_date", date),
  ]);
  for (const r of [members, templates, steps, assignments, checks]) if (r.error) throw r.error;

  return {
    members: members.data ?? [],
    templates: (templates.data ?? []).map((t) => ({ ...t, kind: isRoutineKind(t.kind) ? t.kind : "daily" })),
    steps: steps.data ?? [],
    assignments: assignments.data ?? [],
    checked: new Set((checks.data ?? []).map((c) => `${c.member_id}:${c.step_id}`)),
  };
}

export type DayRoutine = {
  assignment: RoutineAssignment;
  template: RoutineTemplate;
  steps: RoutineStep[];
  progress: Progress<RoutineStep>;
  /** The steps ticked off on the date. */
  doneIds: Set<string>;
};

/** One person's routines on a date, in order, with their progress. */
export function dayRoutinesFor(data: RoutineData, memberId: string, date: LocalDate): DayRoutine[] {
  const templateById = new Map(data.templates.map((t) => [t.id, t]));
  return assignmentsForDay(data.assignments, memberId, date, (id) => templateById.get(id)?.kind).flatMap((assignment) => {
    const template = templateById.get(assignment.template_id);
    if (!template) return [];
    const steps = data.steps.filter((s) => s.template_id === template.id);
    const done = new Set(steps.filter((s) => data.checked.has(`${memberId}:${s.id}`)).map((s) => s.id));
    return [{ assignment, template, steps, doneIds: done, progress: routineProgress(steps, done) }];
  });
}
