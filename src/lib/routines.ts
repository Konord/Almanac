import type { LocalDate, LocalTime } from "./time.ts";

/*
 * Routines: which ones each person has on a day, and how far along they are.
 */

export type RoutineKind = "morning" | "daily" | "night";

/** Morning first, then daytime routines, then bedtime. */
export const KIND_ORDER: RoutineKind[] = ["morning", "daily", "night"];

export const KIND_LABEL: Record<RoutineKind, string> = {
  morning: "Morning",
  daily: "Daytime",
  night: "Night",
};

export function isRoutineKind(value: string): value is RoutineKind {
  return (KIND_ORDER as string[]).includes(value);
}

export type AssignmentLike = {
  id: string;
  template_id: string;
  member_id: string;
  /** The day type it belongs to; null for a one-date swap. */
  day_type_id: string | null;
  on_date: string | null;
  active: boolean;
};

/**
 * The assignments a person has on a date, given their day type that day.
 *
 * A routine belongs to day types ("Weekday", "Weekend"). A one-date
 * assignment is a swap: it replaces that person's routines of the same
 * kind for that day only.
 */
export function assignmentsForDay<T extends AssignmentLike>(
  assignments: T[],
  memberId: string,
  date: LocalDate,
  dayTypeId: string | null,
  kindOf: (templateId: string) => RoutineKind | undefined,
): T[] {
  const mine = assignments.filter((a) => a.active && a.member_id === memberId);
  const oneDay = mine.filter((a) => a.on_date === date);
  const swappedKinds = new Set(oneDay.map((a) => kindOf(a.template_id)));
  const regular = mine.filter((a) => dayTypeId !== null && a.day_type_id === dayTypeId && !swappedKinds.has(kindOf(a.template_id)));

  const seen = new Set<string>();
  return [...regular, ...oneDay]
    .filter((a) => (seen.has(a.template_id) ? false : (seen.add(a.template_id), true)))
    .toSorted((a, b) => kindRank(kindOf(a.template_id)) - kindRank(kindOf(b.template_id)));
}

function kindRank(kind: RoutineKind | undefined): number {
  return kind ? KIND_ORDER.indexOf(kind) : KIND_ORDER.length;
}

export type StepLike = {
  id: string;
  position: number;
  /** "07:45" or "07:45:00" from the database, or null. */
  target_time: string | null;
  essential: boolean;
};

export type Progress<S extends StepLike> = {
  done: number;
  total: number;
  /** The first step in order that isn't ticked yet. */
  next: S | null;
  complete: boolean;
};

/** How far along a routine is, from the steps ticked off today. */
export function routineProgress<S extends StepLike>(steps: S[], doneStepIds: ReadonlySet<string>): Progress<S> {
  const ordered = steps.toSorted((a, b) => a.position - b.position);
  const done = ordered.filter((s) => doneStepIds.has(s.id)).length;
  const next = ordered.find((s) => !doneStepIds.has(s.id)) ?? null;
  return { done, total: ordered.length, next, complete: ordered.length > 0 && next === null };
}

/** "07:45:00" → "07:45". */
export function hhmm(time: string): LocalTime {
  return time.slice(0, 5);
}

/** True when a step has a target time and it has passed. */
export function isLate(step: StepLike, now: LocalTime): boolean {
  return step.target_time !== null && hhmm(step.target_time) < now;
}

/** Mornings run until noon; daytime until the household's evening starts. */
export const MORNING_ENDS: LocalTime = "12:00";

/** Which kind of routine fits the time of day right now. */
export function kindForTime(now: LocalTime, eveningStarts: LocalTime): RoutineKind {
  if (now < MORNING_ENDS) return "morning";
  if (now < eveningStarts) return "daily";
  return "night";
}

/**
 * The routine to show at a glance: an unfinished one for this time of day,
 * else the next unfinished one later on, else the first unfinished, else the last.
 */
export function glanceRoutine<R extends { kind: RoutineKind; complete: boolean }>(routines: R[], now: RoutineKind): R | undefined {
  const rank = KIND_ORDER.indexOf(now);
  return (
    routines.find((r) => !r.complete && r.kind === now) ??
    routines.find((r) => !r.complete && KIND_ORDER.indexOf(r.kind) > rank) ??
    routines.find((r) => !r.complete) ??
    routines.at(-1)
  );
}
