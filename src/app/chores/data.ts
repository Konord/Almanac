import { createClient } from "@/lib/supabase/server";
import { choreTiming, type ChoreRule, type ChoreSize, type ChoreTiming, type RepeatUnit } from "@/lib/chores";
import { addDays, type LocalDate } from "@/lib/time";

export type ChoreMember = { id: string; name: string; colour: string };

export type Chore = ChoreRule & {
  id: string;
  name: string;
  icon: string | null;
  size: ChoreSize;
  est_minutes: number | null;
  location: "indoor" | "outdoor";
  min_energy_mode: "normal" | "low" | "survival";
  default_assignee_id: string | null;
  notes: string | null;
  active: boolean;
  visibility: string;
};

export type Round = {
  id: string;
  template_id: string;
  status: "done" | "skipped";
  completed_on: LocalDate;
  completed_by: string | null;
};

export type TaskList = { id: string; name: string; icon: string | null; visibility: string };

export type Todo = {
  id: string;
  list_id: string;
  title: string;
  icon: string | null;
  due_date: LocalDate | null;
  assignee_id: string | null;
  status: "open" | "done" | "skipped";
  completed_on: LocalDate | null;
  notes: string | null;
};

export type ChoreWithTiming = Chore & { timing: ChoreTiming };

const CHORE_COLUMNS =
  "id, name, icon, size, est_minutes, repeat_every, repeat_unit, preferred_weekday, season_start, season_end, location, min_energy_mode, default_assignee_id, notes, active, visibility";

/** How far back chore history is read (long enough for yearly chores). */
const HISTORY_DAYS = 400;

/** All chores with when each is next due. */
export async function loadChores(today: LocalDate) {
  const supabase = await createClient();
  const [chores, rounds, members] = await Promise.all([
    supabase.from("task_templates").select(CHORE_COLUMNS).order("sort_order").order("name"),
    supabase
      .from("task_instances")
      .select("id, template_id, status, completed_on, completed_by")
      .not("template_id", "is", null)
      .neq("status", "open")
      .gte("completed_on", addDays(today, -HISTORY_DAYS))
      .order("completed_on", { ascending: false }),
    supabase.from("members").select("id, name, colour").order("sort_order").order("name"),
  ]);
  for (const r of [chores, rounds, members]) if (r.error) throw r.error;

  const roundList = (rounds.data ?? []) as Round[];
  const byChore = new Map<string, Round[]>();
  for (const r of roundList) byChore.set(r.template_id, [...(byChore.get(r.template_id) ?? []), r]);

  const list: ChoreWithTiming[] = ((chores.data ?? []) as unknown as Chore[]).map((c) => ({
    ...c,
    repeat_unit: c.repeat_unit as RepeatUnit,
    timing: choreTiming(c, byChore.get(c.id) ?? [], today),
  }));
  return { chores: list, rounds: roundList, members: (members.data ?? []) as ChoreMember[] };
}

/** Active chores due now, most overdue first. */
export function dueChores(chores: ChoreWithTiming[]): ChoreWithTiming[] {
  return chores
    .filter((c) => c.active && c.timing.state === "due")
    .sort((a, b) => b.timing.daysOverdue - a.timing.daysOverdue || (a.timing.dueOn < b.timing.dueOn ? -1 : 1));
}

/** Active chores coming up soon, soonest first. */
export function soonChores(chores: ChoreWithTiming[]): ChoreWithTiming[] {
  return chores.filter((c) => c.active && c.timing.state === "soon").sort((a, b) => (a.timing.dueOn < b.timing.dueOn ? -1 : 1));
}

/** The to-do lists and their to-dos (open ones, plus the last few done). */
export async function loadTodos() {
  const supabase = await createClient();
  const [lists, todos] = await Promise.all([
    supabase.from("task_lists").select("id, name, icon, visibility").order("sort_order").order("name"),
    supabase
      .from("task_instances")
      .select("id, list_id, title, icon, due_date, assignee_id, status, completed_on, notes")
      .not("list_id", "is", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at"),
  ]);
  for (const r of [lists, todos]) if (r.error) throw r.error;
  return { lists: (lists.data ?? []) as TaskList[], todos: (todos.data ?? []) as Todo[] };
}

/** Open to-dos for the Today screen: no date, or due today or earlier. */
export function todosForToday(todos: Todo[], today: LocalDate): Todo[] {
  return todos.filter((t) => t.status === "open" && (!t.due_date || t.due_date <= today));
}
