import type { RoutineKind } from "./routines.ts";

/*
 * Floating routines: where each person's routines sit on a day's timeline.
 *
 * A routine has a usual time, but it isn't fixed like an appointment. When
 * one of the person's events is in the way, the routine moves around it:
 * a bedtime routine moves to after a late hockey game, and a morning
 * routine moves earlier to finish before an early appointment (or after
 * it, if there's no room before). Nothing here changes saved data; the
 * calendar just shows where the routine fits today.
 */

/** Minutes since midnight. */
export type Minutes = number;

/** Where a routine usually goes when nothing says otherwise. */
export const KIND_DEFAULT_START: Record<RoutineKind, Minutes> = {
  morning: 7 * 60,
  daily: 16 * 60,
  night: 19 * 60 + 30,
};

export const DEFAULT_MINUTES = 30;

/** Morning routines never move earlier than this. */
export const EARLIEST_START: Minutes = 5 * 60;

/** Nothing moves past midnight. */
export const DAY_END: Minutes = 24 * 60;

export function toMinutes(time: string): Minutes {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * A routine's usual start and length: what the routine says if it's set,
 * otherwise the span of its steps' target times, otherwise a default for
 * its kind.
 */
export function usualSlot(
  routine: { kind: RoutineKind; usual_start: string | null; usual_minutes: number | null },
  stepTimes: (string | null)[],
): { start: Minutes; minutes: Minutes } {
  const times = stepTimes.filter((t): t is string => Boolean(t)).map(toMinutes);
  const fromSteps = times.length > 0 ? { start: Math.min(...times), end: Math.max(...times) } : null;
  const start = routine.usual_start ? toMinutes(routine.usual_start) : (fromSteps?.start ?? KIND_DEFAULT_START[routine.kind]);
  // The last step's time is when it should be happening, so leave 10 minutes for it.
  const minutes = routine.usual_minutes ?? (fromSteps ? Math.max(15, fromSteps.end - fromSteps.start + 10) : DEFAULT_MINUTES);
  return { start, minutes };
}

export type Busy = { startMin: Minutes; endMin: Minutes; title: string };
export type Wanted = { id: string; kind: RoutineKind; start: Minutes; minutes: Minutes };
export type Placement = {
  id: string;
  startMin: Minutes;
  endMin: Minutes;
  /** The event it moved around, or null when it's at its usual time. */
  movedFor: string | null;
  /** True when there was nowhere free, so it stays put on top of something. */
  clash: boolean;
};

/**
 * Places one person's routines for a day around their busy times.
 * Routines are placed in the order given, and each one placed becomes
 * busy time for the ones after it.
 */
export function placeRoutines(wanted: Wanted[], busy: Busy[]): Placement[] {
  const taken: Busy[] = [...busy];
  const placed: Placement[] = [];
  for (const routine of wanted) {
    const spot = findSpot(routine, taken);
    const end = spot.start + routine.minutes;
    placed.push({ id: routine.id, startMin: spot.start, endMin: end, movedFor: spot.movedFor, clash: spot.clash });
    taken.push({ startMin: spot.start, endMin: end, title: "" });
  }
  return placed;
}

function firstClash(start: Minutes, minutes: Minutes, taken: Busy[]): Busy | undefined {
  return taken
    .filter((b) => b.startMin < start + minutes && b.endMin > start)
    .toSorted((a, b) => a.startMin - b.startMin)[0];
}

function findSpot(routine: Wanted, taken: Busy[]): { start: Minutes; movedFor: string | null; clash: boolean } {
  const first = firstClash(routine.start, routine.minutes, taken);
  if (!first) return { start: routine.start, movedFor: null, clash: false };
  const reason = first.title || null;

  // Mornings try to finish earlier first, so the day's first plan isn't late.
  if (routine.kind === "morning") {
    let start = routine.start;
    for (let blocker = firstClash(start, routine.minutes, taken); blocker; blocker = firstClash(start, routine.minutes, taken)) {
      start = blocker.startMin - routine.minutes;
      if (start < EARLIEST_START) break;
    }
    if (start >= EARLIEST_START) return { start, movedFor: reason, clash: false };
  }

  // Otherwise wait until whatever is in the way is over.
  let start = routine.start;
  for (let blocker = firstClash(start, routine.minutes, taken); blocker; blocker = firstClash(start, routine.minutes, taken)) {
    start = blocker.endMin;
    if (start + routine.minutes > DAY_END) return { start: routine.start, movedFor: null, clash: true };
  }
  return { start, movedFor: reason, clash: false };
}
