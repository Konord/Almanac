/*
 * The Habit Manager (2026-11-12) keeps every change here until its one
 * Save: the habits made there (Habits tab) and the health trackers (Health
 * tab). Ids are made on the screen (newId), so a save can add or update
 * each row by its id, and anything missing from the draft is deleted.
 *
 * Kept free of other imports so the tests can run with plain `node --test`.
 */

export type DraftHabit = {
  id: string;
  name: string;
  icon: string | null;
  measure: "check" | "count";
  goal: number;
  unit: string;
  /** How much one tap adds. */
  step: number;
  frequency: "daily" | "days" | "week" | "month";
  weekdays: number[];
  times: number;
  since: string;
  member_ids: string[];
};

export type DraftChoice = {
  id: string;
  name: string;
  icon: string | null;
  wait_minutes: number | null;
  max_per_day: number | null;
  /** By person id: "7.5 ml". */
  amounts: Record<string, string>;
};

export type DraftTracker = {
  id: string;
  name: string;
  icon: string | null;
  kind: "medicine" | "number" | "note";
  unit: string;
  alert_above: number | null;
  member_ids: string[];
  choices: DraftChoice[];
};

export type HabitManagerDraft = { habits: DraftHabit[]; trackers: DraftTracker[] };

/** What's wrong with the draft, in words for the screen, or null. */
export function managerProblem(d: HabitManagerDraft): string | null {
  for (const h of d.habits) {
    const name = h.name.trim();
    if (!name) return "Every habit needs a name.";
    if (name.length > 40) return `${name.slice(0, 20)}… is too long for a habit's name.`;
    if (h.member_ids.length === 0) return `Pick who does ${name}.`;
    if (h.measure === "count" && !(Number.isInteger(h.goal) && h.goal >= 1 && h.goal <= 10000)) return `${name} needs a goal.`;
    if (!(Number.isInteger(h.step) && h.step >= 1 && h.step <= 10000)) return `${name} needs an amount for each tap.`;
    if (h.unit.trim().length > 20) return `${name}'s unit is too long.`;
    if (h.frequency === "days" && h.weekdays.length === 0) return `Pick the days for ${name}.`;
    if ((h.frequency === "week" || h.frequency === "month") && !(Number.isInteger(h.times) && h.times >= 1 && h.times <= (h.frequency === "week" ? 7 : 31))) {
      return `How many times for ${name}?`;
    }
  }
  for (const t of d.trackers) {
    const name = t.name.trim();
    if (!name) return "Every tracker needs a name.";
    if (name.length > 40) return `${name.slice(0, 20)}… is too long for a tracker's name.`;
    if (t.member_ids.length === 0) return `Pick who ${name} is for.`;
    if (t.unit.trim().length > 12) return `${name}'s unit is too long.`;
    if (t.alert_above !== null && !Number.isFinite(t.alert_above)) return `${name}'s line should be a number.`;
    for (const c of t.kind === "medicine" ? t.choices : []) {
      const choice = c.name.trim();
      if (!choice) return `Every choice in ${name} needs a name.`;
      if (choice.length > 40) return `${choice.slice(0, 20)}… is too long.`;
      if (Object.values(c.amounts).some((a) => a.trim().length > 20)) return `An amount for ${choice} is too long.`;
    }
  }
  return null;
}

/** The same draft, for "anything changed?" (the order of people doesn't matter). */
export function sameManagerDraft(a: HabitManagerDraft, b: HabitManagerDraft): boolean {
  const tidy = (d: HabitManagerDraft) =>
    JSON.stringify({
      habits: d.habits.map((h) => ({ ...h, member_ids: [...h.member_ids].sort(), weekdays: [...h.weekdays].sort() })),
      trackers: d.trackers.map((t) => ({
        ...t,
        member_ids: [...t.member_ids].sort(),
        choices: t.choices.map((c) => ({ ...c, amounts: Object.fromEntries(Object.entries(c.amounts).filter(([, v]) => v.trim()).sort()) })),
      })),
    });
  return tidy(a) === tidy(b);
}
