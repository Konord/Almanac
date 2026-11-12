import { addDays, type LocalDate } from "./time.ts";

/*
 * When a to-do shows. Its date is either a due date ("done by the 15th",
 * shown in the days leading up to it) or a start ("on the 15th", shown
 * only from then). Anything still open after its date carries over to
 * the next day until it's done.
 */

export type DateKind = "due" | "start";

export type TodoTiming = {
  status: "open" | "done" | "skipped";
  due_date: LocalDate | null;
  date_kind: DateKind;
  /** "09:30" or "09:30:00" for a start time, else null. */
  at_time: string | null;
  /** Due to-dos: show this many days before; null shows all along. */
  lead_days: number | null;
  must_do?: boolean;
};

/** Whether an open to-do belongs on today's list. */
export function showsOn<T extends TodoTiming>(todo: T, today: LocalDate): boolean {
  if (todo.status !== "open") return false;
  if (!todo.due_date) return true;
  if (todo.date_kind === "start") return todo.due_date <= today;
  return todo.lead_days === null || addDays(todo.due_date, -todo.lead_days) <= today;
}

/** True once a to-do's day has passed and it carried over. */
export function carriedOver(todo: Pick<TodoTiming, "status" | "due_date">, today: LocalDate): boolean {
  return todo.status === "open" && todo.due_date !== null && todo.due_date < today;
}

/** Today's to-dos in order: must-dos, carried over, due or starting today (by time), then the rest by date. */
export function sortForToday<T extends TodoTiming>(todos: T[], today: LocalDate): T[] {
  const rank = (t: T) => (t.must_do ? 0 : carriedOver(t, today) ? 1 : t.due_date === today ? 2 : t.due_date ? 3 : 4);
  return todos.toSorted(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      (a.at_time ?? "99").localeCompare(b.at_time ?? "99"),
  );
}

/*
 * The daily list (tasks rework, 2026-11-09): today's tasks on the Today
 * panel. A list task with no date stays on its list until someone taps
 * "Do today"; anything with a date shows here when its time comes.
 */

/** Whether a task belongs on today's daily list. */
export function onDailyList<T extends TodoTiming>(todo: T, today: LocalDate): boolean {
  return todo.due_date !== null && showsOn(todo, today);
}

/** True for a task with a time today (it shows the time beside it). */
export function timedToday(todo: Pick<TodoTiming, "due_date" | "at_time">, today: LocalDate): boolean {
  return todo.due_date === today && todo.at_time !== null;
}

/** The daily list's order: timed tasks by time, then must-dos, carried over, today's, then the rest by date. */
export function dailyOrder<T extends TodoTiming>(todos: T[], today: LocalDate): T[] {
  const rank = (t: T) => (timedToday(t, today) ? 0 : t.must_do ? 1 : carriedOver(t, today) ? 2 : t.due_date === today ? 3 : 4);
  return todos.toSorted(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? (a.at_time ?? "").localeCompare(b.at_time ?? "") : 0) ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  );
}

/*
 * Chores and heads-ups make tasks too, and they're filed under the first
 * list only because every task needs one. They belong on the daily list,
 * not on a list, so the Lists screen and the Today panel's list chips
 * leave them out (2026-11-09: the To-do list was repeating the daily list).
 */

/** True for a task someone put on a list (not one a chore or heads-up made). */
export function onItsList(todo: { template_id: string | null; heads_up_id: string | null }): boolean {
  return todo.template_id === null && todo.heads_up_id === null;
}

/**
 * True for a list task with a day and a time: it shows as a point on the
 * Agenda and Week views at that time (2026-11-09).
 */
export function onCalendar(todo: TodoTiming & { template_id: string | null; heads_up_id: string | null }): boolean {
  return todo.status === "open" && todo.due_date !== null && todo.at_time !== null && onItsList(todo);
}

/** The parts of the app a to-do can open. */
export const FEATURE_LINKS = [
  { path: "/review", label: "Planner" },
  { path: "/meals", label: "Meals" },
  { path: "/meals/groceries", label: "Grocery list" },
  { path: "/meals/backups", label: "Backup meals" },
  { path: "/chores", label: "Chores" },
  { path: "/routines", label: "Routines" },
  { path: "/calendar", label: "Calendar" },
] as const;

export function isFeatureLink(value: string): boolean {
  return FEATURE_LINKS.some((l) => l.path === value);
}

export function linkLabel(path: string | null): string | null {
  return FEATURE_LINKS.find((l) => l.path === path)?.label ?? null;
}
