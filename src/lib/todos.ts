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

/** The parts of the app a to-do can open. */
export const FEATURE_LINKS = [
  { path: "/meals", label: "Meal planner" },
  { path: "/meals/groceries", label: "Grocery list" },
  { path: "/meals/backups", label: "Backup meals" },
  { path: "/chores", label: "Chores" },
  { path: "/routines", label: "Routine Manager" },
  { path: "/calendar", label: "Calendar" },
] as const;

export function isFeatureLink(value: string): boolean {
  return FEATURE_LINKS.some((l) => l.path === value);
}

export function linkLabel(path: string | null): string | null {
  return FEATURE_LINKS.find((l) => l.path === path)?.label ?? null;
}
