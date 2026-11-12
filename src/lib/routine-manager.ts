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
  /** A starting point for new routines (Start from), never on anyone's day. */
  is_template: boolean;
};

export type DraftStep = {
  id: string;
  routine_id: string;
  text: string;
  icon: string | null;
  /** When this step started being tracked as a habit; null when it isn't. */
  habit_since: string | null;
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

/**
 * A meal block (Lunch, Dinner; Connor, 2026-11-11): when a meal is eaten
 * and for how long. The weekly review shows it on the days someone has it.
 */
export type DraftMealBlock = {
  id: string;
  name: string;
  icon: string | null;
  /** "18:00" */
  usual_time: string;
  /** How long eating takes. */
  minutes: number;
  /**
   * What goes on it each weekday (0 = Sunday … 6 = Saturday): "c:<id>" for a
   * kind of meal (Tacos), "m:<id>" for one meal (Spaghetti), null for nothing.
   */
  presets: (string | null)[];
};

/** A meal block given to one person's kind of day. */
export type DraftMealUse = {
  id: string;
  meal_id: string;
  member_id: string;
  day_type_id: string;
};

/** Everything on the Routine Manager. Steps are in order within each routine; meal blocks in their order. */
export type ManagerDraft = {
  routines: DraftRoutine[];
  steps: DraftStep[];
  uses: DraftUse[];
  meals: DraftMealBlock[];
  mealUses: DraftMealUse[];
};

export const MEAL_MINUTES = { min: 10, max: 240 };

/** No presets on any day. */
export function noPresets(): (string | null)[] {
  return [null, null, null, null, null, null, null];
}

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
  const mealIds = new Set(draft.meals.map((m) => m.id));
  for (const m of draft.meals) {
    const name = m.name.trim();
    if (!name) return "Every meal needs a name, like Dinner.";
    if (name.length > 30) return `"${name.slice(0, 20)}…" is too long a name for a meal (30 letters at most).`;
    if (!/^\d{2}:\d{2}$/.test(m.usual_time)) return `Choose a time for ${name}.`;
    if (!(Number.isInteger(m.minutes) && m.minutes >= MEAL_MINUTES.min && m.minutes <= MEAL_MINUTES.max)) return `${name} should take between ${MEAL_MINUTES.min} and ${MEAL_MINUTES.max} minutes.`;
    if (m.presets.length !== 7 || m.presets.some((p) => p !== null && !/^[cm]:/.test(p))) return `Something's wrong with ${name}'s presets. Undo and try again.`;
  }
  for (const u of draft.mealUses) if (!mealIds.has(u.meal_id)) return "A meal is given to someone but isn't there any more.";
  for (const r of draft.routines) {
    const name = r.name.trim();
    if (!name) return "Every routine needs a name.";
    if (name.length > 60) return `"${name.slice(0, 20)}…" is too long a name (60 letters at most).`;
    if (!ANCHORS.includes(r.anchor)) return `Choose when ${name} happens.`;
    if (r.anchor === "meal" && !(r.anchor_meal_time_id && mealIds.has(r.anchor_meal_time_id))) return `Choose which meal ${name} comes after.`;
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
  for (const u of draft.uses) {
    if (!ids.has(u.routine_id)) return "A routine is given to someone but isn't there any more.";
    if (draft.routines.find((r) => r.id === u.routine_id)?.is_template) return "A template can't be on someone's day. Start a routine from it instead.";
  }
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

/**
 * A copy of a routine and its steps with new ids: "Save as template"
 * (asTemplate) or "Start from" a template. Who does each step isn't copied,
 * because the copy may go to other people.
 */
export function copyRoutine(
  draft: ManagerDraft,
  routineId: string,
  newId: () => string,
  asTemplate: boolean,
): { routine: DraftRoutine; steps: DraftStep[] } | null {
  const from = draft.routines.find((r) => r.id === routineId);
  if (!from) return null;
  const id = newId();
  return {
    routine: { ...from, id, is_template: asTemplate, habit_since: asTemplate ? null : from.habit_since },
    steps: draft.steps.filter((s) => s.routine_id === routineId).map((s) => ({ ...s, id: newId(), routine_id: id, member_ids: [], habit_since: asTemplate ? null : s.habit_since })),
  };
}

/** A routine block in one column of the manager's grid. */
export type GridBlock = { routineId: string; start: number; end: number };

/** Neighbouring columns showing the same routine at the same time, drawn as one bubble. */
export type GridRun<B extends GridBlock> = { routineId: string; start: number; end: number; c0: number; c1: number; blocks: B[] };

/**
 * Joins a routine's blocks in neighbouring columns into one bubble when
 * they start and end at the same time (like an event for several people).
 * Where the times differ, each column keeps its own block.
 */
export function joinRuns<B extends GridBlock>(columns: B[][]): GridRun<B>[] {
  const runs: GridRun<B>[] = [];
  const open = new Map<string, GridRun<B>>();
  columns.forEach((blocks, c) => {
    const next = new Map<string, GridRun<B>>();
    for (const b of blocks) {
      const key = `${b.routineId}|${b.start}|${b.end}`;
      const run = open.get(key);
      if (run && run.c1 === c - 1) {
        run.c1 = c;
        run.blocks.push(b);
        next.set(key, run);
      } else {
        const fresh: GridRun<B> = { routineId: b.routineId, start: b.start, end: b.end, c0: c, c1: c, blocks: [b] };
        runs.push(fresh);
        next.set(key, fresh);
      }
    }
    open.clear();
    for (const [k, v] of next) open.set(k, v);
  });
  return runs;
}
