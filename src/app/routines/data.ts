import { createClient } from "@/lib/supabase/server";
import { assignmentsForDay, isRoutineKind, routineProgress, type Progress, type RoutineKind } from "@/lib/routines";
import type { LocalDate } from "@/lib/time";

export type RoutineMember = { id: string; name: string; role: string; colour: string; icon: string | null };
export type RoutineTemplate = {
  id: string;
  name: string;
  kind: RoutineKind;
  audience: string;
  premade: boolean;
  visibility: string;
  usual_start: string | null;
  usual_minutes: number | null;
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
  /** The day's energy mode: low and survival days show only essential steps. */
  energyMode: "normal" | "low" | "survival";
};

/**
 * Everything about routines, plus the ticks for one date. `allSteps` keeps every step even
 * on a low or survival day (for setting routines up).
 */
export async function loadRoutines(date: LocalDate, { allSteps: keepAll = false }: { allSteps?: boolean } = {}): Promise<RoutineData> {
  const supabase = await createClient();
  const [members, templates, steps, assignments, checks, day] = await Promise.all([
    supabase.from("members").select("id, name, role, colour, icon").order("sort_order").order("name"),
    supabase.from("routine_templates").select("id, name, kind, audience, premade, visibility, usual_start, usual_minutes").order("sort_order").order("name"),
    supabase.from("routine_steps").select("id, template_id, text, icon, position, target_time, essential").order("position"),
    supabase.from("routine_assignments").select("id, template_id, member_id, weekdays, on_date, active").order("created_at"),
    supabase.from("routine_checks").select("member_id, step_id").eq("check_date", date),
    supabase.from("days").select("energy_mode").eq("date", date).maybeSingle(),
  ]);
  for (const r of [members, templates, steps, assignments, checks, day]) if (r.error) throw r.error;

  // On low and survival days, routines keep just their essential steps
  // (a routine with none marked keeps them all).
  const energyMode = (day.data?.energy_mode ?? "normal") as "normal" | "low" | "survival";
  const allSteps = steps.data ?? [];
  const hasEssential = new Set(allSteps.filter((s) => s.essential).map((s) => s.template_id));
  const daySteps = energyMode === "normal" || keepAll ? allSteps : allSteps.filter((s) => s.essential || !hasEssential.has(s.template_id));

  return {
    members: members.data ?? [],
    templates: (templates.data ?? []).map((t) => ({ ...t, kind: isRoutineKind(t.kind) ? t.kind : "daily" })),
    steps: daySteps,
    assignments: assignments.data ?? [],
    checked: new Set((checks.data ?? []).map((c) => `${c.member_id}:${c.step_id}`)),
    energyMode,
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
