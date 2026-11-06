import type { RoutineKind } from "./routines.ts";

/*
 * Floating routines: where each person's routines sit on a day's timeline.
 *
 * A routine is anchored to something: it starts after the person wakes
 * up, ends by their bedtime, follows a meal, or sits at a set time. When
 * one of the person's events is in the way, the routine moves, but only
 * so far (the household's flex, 60 minutes to start) and only away from
 * its anchor: an after-dinner routine only moves later. A bedtime routine
 * can be pushed back as late as midnight by a late event, but never into
 * the next morning. A "loose" routine can move anywhere later that day.
 * If there's no room within that, it stays put on top of the event.
 *
 * Routines that sit next to each other move together like a train, and
 * always stay in order. Nothing here changes saved data; the calendar
 * just shows where each routine fits today.
 */

/** Minutes since midnight. */
export type Minutes = number;

/** Where a clock routine goes when nothing says otherwise. */
export const KIND_DEFAULT_START: Record<RoutineKind, Minutes> = {
  morning: 7 * 60,
  daily: 16 * 60,
  night: 19 * 60 + 30,
};

export const DEFAULT_MINUTES = 30;

/** Nothing moves past midnight. */
export const DAY_END: Minutes = 24 * 60;

/** Routines this close together count as one train. */
export const TRAIN_GAP: Minutes = 10;

export function toMinutes(time: string): Minutes {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export type Anchor = "wake" | "bed" | "meal" | "clock";

export type AnchoredRoutine = {
  kind: RoutineKind;
  anchor: Anchor;
  anchor_meal_time_id: string | null;
  /** Minutes after wake-up or the meal; for bedtime, minutes before bed that it ends. */
  anchor_offset: number;
  loose: boolean;
  usual_start: string | null;
  usual_minutes: number | null;
};

/** What a person's day looks like, for working out where anchors are. */
export type DayAnchors = {
  wake: Minutes;
  bed: Minutes;
  /** When a meal time's meal ends today, if the person eats it. */
  mealEnd: (mealTimeId: string) => Minutes | null;
};

/** How long a routine takes: what it says, else the span of its step times, else 30 minutes. */
export function routineMinutes(routine: Pick<AnchoredRoutine, "usual_minutes">, stepTimes: (string | null)[]): Minutes {
  if (routine.usual_minutes) return routine.usual_minutes;
  const times = stepTimes.filter((t): t is string => Boolean(t)).map(toMinutes);
  // The last step's time is when it should be happening, so leave 10 minutes for it.
  return times.length > 0 ? Math.max(15, Math.max(...times) - Math.min(...times) + 10) : DEFAULT_MINUTES;
}

/**
 * Where a routine wants to be today, how long it takes, and which ways it may move.
 */
export function wantedSlot(
  routine: AnchoredRoutine,
  stepTimes: (string | null)[],
  day: DayAnchors,
  flex: Minutes,
): { start: Minutes; minutes: Minutes; direction: Direction; band: Minutes } {
  const minutes = routineMinutes(routine, stepTimes);
  const band = routine.loose ? DAY_END : flex;
  switch (routine.anchor) {
    case "wake":
      return { start: day.wake + routine.anchor_offset, minutes, direction: "later", band };
    case "bed":
      // Pushed back by a late event as far as midnight, never into the next morning.
      return { start: Math.max(0, day.bed - routine.anchor_offset - minutes), minutes, direction: "later", band: DAY_END };
    case "meal": {
      const end = routine.anchor_meal_time_id ? day.mealEnd(routine.anchor_meal_time_id) : null;
      if (end !== null) return { start: end + routine.anchor_offset, minutes, direction: "later", band };
      return { start: clockStart(routine, stepTimes), minutes, direction: "later", band };
    }
    case "clock":
      return { start: clockStart(routine, stepTimes), minutes, direction: "both", band };
  }
}

function clockStart(routine: AnchoredRoutine, stepTimes: (string | null)[]): Minutes {
  if (routine.usual_start) return toMinutes(routine.usual_start);
  const times = stepTimes.filter((t): t is string => Boolean(t)).map(toMinutes);
  return times.length > 0 ? Math.min(...times) : KIND_DEFAULT_START[routine.kind];
}

export type Direction = "later" | "both";
export type Busy = { startMin: Minutes; endMin: Minutes; title: string };
export type Wanted = {
  id: string;
  start: Minutes;
  minutes: Minutes;
  /** "later": only away from its anchor. "both": earlier or later. */
  direction?: Direction;
  /** How far it may move from its wanted start. */
  band?: Minutes;
};
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
 * Results come back in the order given. Each placed routine becomes busy
 * time for the ones after it.
 */
export function placeRoutines(wanted: Wanted[], busy: Busy[], trainGap: Minutes = TRAIN_GAP): Placement[] {
  const taken: Busy[] = [...busy];
  const placed = new Map<string, Placement>();
  const order = wanted.map((w, i) => ({ w, i })).toSorted((a, b) => a.w.start - b.w.start || a.i - b.i);
  let prev: { wantEnd: Minutes; placed: Placement } | null = null;
  for (const { w } of order) {
    let want = w.start;
    let pushedBy: string | null = null;
    if (prev && prev.placed.endMin > want) {
      // Keep the gap to the routine before it when they travel together, and always keep the order.
      const gap = w.start - prev.wantEnd;
      want = prev.placed.endMin + (gap >= 0 && gap <= trainGap ? gap : 0);
      pushedBy = prev.placed.movedFor;
    }
    const spot = findSpot(w, want, pushedBy, taken);
    const p: Placement = { id: w.id, startMin: spot.start, endMin: spot.start + w.minutes, movedFor: spot.movedFor, clash: spot.clash };
    placed.set(w.id, p);
    taken.push({ startMin: p.startMin, endMin: p.endMin, title: "" });
    prev = { wantEnd: w.start + w.minutes, placed: p };
  }
  return wanted.map((w) => placed.get(w.id)!);
}

function firstClash(start: Minutes, minutes: Minutes, taken: Busy[]): Busy | undefined {
  return taken
    .filter((b) => b.startMin < start + minutes && b.endMin > start)
    .toSorted((a, b) => a.startMin - b.startMin)[0];
}

function findSpot(w: Wanted, want: Minutes, pushedBy: string | null, taken: Busy[]): { start: Minutes; movedFor: string | null; clash: boolean } {
  const band = w.band ?? DAY_END;
  const latest = Math.min(w.start + band, DAY_END - w.minutes);
  const reasonFor = (start: Minutes, blocker: Busy | undefined) =>
    start === w.start ? null : (blocker?.title || pushedBy || null);

  // Later first: wait until whatever is in the way is over.
  let start = want;
  let firstBlocker: Busy | undefined;
  for (let blocker = firstClash(start, w.minutes, taken); blocker; blocker = firstClash(start, w.minutes, taken)) {
    firstBlocker ??= blocker;
    start = blocker.endMin;
    if (start > latest) break;
  }
  if (start <= latest) return { start, movedFor: reasonFor(start, firstBlocker), clash: false };

  // A routine at a set time can also move earlier to finish before something.
  if (w.direction === "both") {
    const earliest = Math.max(0, w.start - band);
    let early = w.start;
    let blocker = firstClash(early, w.minutes, taken);
    const reason = blocker?.title || null;
    for (; blocker; blocker = firstClash(early, w.minutes, taken)) {
      early = blocker.startMin - w.minutes;
      if (early < earliest) break;
    }
    if (early >= earliest) return { start: early, movedFor: reason, clash: false };
  }

  // Nowhere free within reach: stay where it wanted to be, on top of the event.
  return { start: want <= latest ? want : w.start, movedFor: null, clash: true };
}
