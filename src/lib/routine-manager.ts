import type { Anchor } from "./routine-placement.ts";
import type { RoutineKind } from "./routines.ts";

/*
 * The Routine Manager keeps every change on the screen until you press
 * Save, then sends the whole lot at once. These are the shapes it sends,
 * and the checks and sums the screen and the server share.
 */

/** New things get a temporary id starting with "new-" until they're saved. */
export const NEW_PREFIX = "new-";

export function isNewId(id: string): boolean {
  return id.startsWith(NEW_PREFIX);
}

export type DraftRoutine = {
  id: string;
  name: string;
  anchor: Anchor;
  anchor_meal_time_id: string | null;
  /** Minutes after wake-up or the meal; for bedtime, minutes before bed that it ends. */
  anchor_offset: number;
  /** "07:30" for routines at a set time. */
  usual_start: string | null;
  usual_minutes: number;
  loose: boolean;
  /** When habit tracking was switched on; null when off. */
  habit_since: string | null;
  visibility: string;
};

export type DraftStep = {
  id: string;
  routine_id: string;
  text: string;
  icon: string | null;
  habit: boolean;
  /** Who does this step. Empty: everyone who has the routine. */
  member_ids: string[];
  /** Also shows on the daily list in the Today panel. */
  daily_list: boolean;
};

/** A routine given to one person's kind of day. */
export type DraftUse = {
  id: string;
  routine_id: string;
  member_id: string;
  day_type_id: string;
};

/** Everything on the Routine Manager. Steps are in order within each routine. */
export type ManagerDraft = {
  routines: DraftRoutine[];
  steps: DraftStep[];
  uses: DraftUse[];
};

export const ANCHORS: Anchor[] = ["wake", "bed", "meal", "clock"];

/** Morning, daytime or night, worked out from when the routine happens. */
export function kindFor(routine: Pick<DraftRoutine, "anchor" | "usual_start">, mealTime: string | null): RoutineKind {
  if (routine.anchor === "wake") return "morning";
  if (routine.anchor === "bed") return "night";
  const time = routine.anchor === "meal" ? mealTime : routine.usual_start;
  if (!time) return "daily";
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return "morning";
  if (hour >= 19) return "night";
  return "daily";
}

/** The first problem with a draft, in plain words, or null when it can be saved. */
export function draftProblem(draft: ManagerDraft): string | null {
  const ids = new Set(draft.routines.map((r) => r.id));
  for (const r of draft.routines) {
    const name = r.name.trim();
    if (!name) return "Every routine needs a name.";
    if (name.length > 60) return `"${name.slice(0, 20)}…" is too long a name (60 letters at most).`;
    if (!ANCHORS.includes(r.anchor)) return `Choose when ${name} happens.`;
    if (r.anchor === "meal" && !r.anchor_meal_time_id) return `Choose which meal ${name} comes after.`;
    if (r.anchor === "clock" && !(r.usual_start && /^\d{2}:\d{2}$/.test(r.usual_start))) return `Choose a time for ${name}.`;
    if (!(Number.isInteger(r.anchor_offset) && r.anchor_offset >= 0 && r.anchor_offset <= 240)) return `The gap for ${name} should be 0 to 240 minutes.`;
    if (!(Number.isInteger(r.usual_minutes) && r.usual_minutes >= 5 && r.usual_minutes <= 240)) return `${name} should take between 5 and 240 minutes.`;
  }
  for (const s of draft.steps) {
    if (!ids.has(s.routine_id)) return "A step belongs to a routine that isn't there any more.";
    const text = s.text.trim();
    if (!text) return "A step is empty. Type what to do, or delete it.";
    if (text.length > 80) return `"${text.slice(0, 20)}…" is too long for a step (80 letters at most).`;
  }
  for (const u of draft.uses) if (!ids.has(u.routine_id)) return "A routine is given to someone but isn't there any more.";
  for (const s of draft.steps) {
    if (s.member_ids.length === 0) continue;
    if (stepPeople(draft, s).length === 0) {
      const name = draft.routines.find((r) => r.id === s.routine_id)?.name.trim() ?? "";
      return `Nobody on ${name} does "${s.text.trim().slice(0, 30)}" now. Choose who does it, or delete it.`;
    }
  }
  return null;
}

/** The people who have a routine on at least one kind of day, in the order they were added. */
export function routinePeople(draft: Pick<ManagerDraft, "uses">, routineId: string): string[] {
  const people: string[] = [];
  for (const u of draft.uses) if (u.routine_id === routineId && !people.includes(u.member_id)) people.push(u.member_id);
  return people;
}

/**
 * Who a step is for, leaving out anyone who no longer has its routine.
 * Empty means everyone on the routine.
 */
export function stepPeople(draft: Pick<ManagerDraft, "uses">, step: Pick<DraftStep, "routine_id" | "member_ids">): string[] {
  const on = routinePeople(draft, step.routine_id);
  return step.member_ids.filter((id) => on.includes(id));
}

/** Whether a routine's steps are on the daily list: all of them, some, or none. */
export function dailyListState(steps: Pick<DraftStep, "daily_list">[]): "all" | "some" | "none" {
  const on = steps.filter((s) => s.daily_list).length;
  if (on === 0) return "none";
  return on === steps.length ? "all" : "some";
}

/** True when two drafts would save the same thing. */
export function sameDraft(a: ManagerDraft, b: ManagerDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
