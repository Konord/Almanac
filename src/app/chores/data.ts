import { createClient } from "@/lib/supabase/server";
import { choreTiming, starterFirstDue, type ChoreRule, type ChoreTiming, type RepeatUnit } from "@/lib/chores";
import { isChoreTag, type ChoreDay, type ChoreTag } from "@/lib/chore-days";
import { addDays, localDateOf, type LocalDate } from "@/lib/time";
import { showsOn, sortForToday, type DateKind } from "@/lib/todos";

export type ChoreMember = { id: string; name: string; colour: string; icon: string | null };

export type Chore = ChoreRule & {
  id: string;
  name: string;
  icon: string | null;
  /** "preset": every time its chore day comes round. "generated": by its date rule. */
  kind: "preset" | "generated";
  tags: ChoreTag[];
  /** The chore days it may go on (empty: any day that isn't restrictive). */
  chore_day_ids: string[];
  /** "19:00" for a chore at an exact time. */
  at_time: string | null;
  /** Skipped: waits until this day. */
  not_before: LocalDate | null;
  default_assignee_id: string | null;
  notes: string | null;
  /** A part of the app its to-dos open, e.g. "/meals". */
  link: string | null;
  active: boolean;
  visibility: string;
  premade: boolean;
  created_at: string;
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
  /** Has to be done today, e.g. putting fresh meat away when dinner was swapped. */
  must_do: boolean;
  /** "due": done by due_date. "start": on due_date (and at_time). */
  date_kind: DateKind;
  at_time: string | null;
  lead_days: number | null;
  /** A part of the app it opens, e.g. "/meals". */
  link: string | null;
  /** Set when a chore made this to-do. */
  template_id: string | null;
  /** Set when a heads-up made this to-do. */
  heads_up_id: string | null;
  /** How long it takes. */
  minutes: number | null;
  /** A one-off chore: waits for the next one of this chore day with room. */
  chore_day_id: string | null;
  /** A list task switched to a chore: the chore planner picks its day. */
  is_chore: boolean;
  /** Its chore tags (Essential, Big, Outdoor, Errand). */
  tags: string[];
};

export type ChoreWithTiming = Chore & { timing: ChoreTiming };

const CHORE_COLUMNS =
  "id, name, icon, kind, tags, at_time, not_before, repeat_every, repeat_unit, preferred_weekday, repeat_from, start_date, snap, only_months, only_seasons, season_start, season_end, first_due, default_assignee_id, notes, link, active, visibility, premade, created_at";

/** How far back chore history is read (long enough for yearly chores). */
const HISTORY_DAYS = 400;

/** All chores with when each is next due. */
export async function loadChores(today: LocalDate, timeZone: string) {
  const supabase = await createClient();
  const [chores, rounds, members, links] = await Promise.all([
    supabase.from("task_templates").select(CHORE_COLUMNS).order("sort_order").order("name"),
    supabase
      .from("task_instances")
      .select("id, template_id, status, completed_on, completed_by")
      .not("template_id", "is", null)
      .neq("status", "open")
      .gte("completed_on", addDays(today, -HISTORY_DAYS))
      .order("completed_on", { ascending: false }),
    supabase.from("members").select("id, name, colour, icon").order("sort_order").order("name"),
    supabase.from("task_template_chore_days").select("template_id, chore_day_id"),
  ]);
  for (const r of [chores, rounds, members, links]) if (r.error) throw r.error;

  const roundList = (rounds.data ?? []) as Round[];
  const byChore = new Map<string, Round[]>();
  for (const r of roundList) byChore.set(r.template_id, [...(byChore.get(r.template_id) ?? []), r]);

  const daysOf = new Map<string, string[]>();
  for (const l of links.data ?? []) daysOf.set(l.template_id, [...(daysOf.get(l.template_id) ?? []), l.chore_day_id]);

  const list: ChoreWithTiming[] = ((chores.data ?? []) as unknown as Chore[]).map((c) => ({
    ...c,
    kind: c.kind === "preset" ? "preset" : "generated",
    tags: (c.tags as string[]).filter(isChoreTag),
    chore_day_ids: daysOf.get(c.id) ?? [],
    at_time: c.at_time ? c.at_time.slice(0, 5) : null,
    repeat_unit: c.repeat_unit as RepeatUnit,
    timing: choreTiming(
      // A chore never done comes due on its first day: picked on a quiet day
      // when it was made, or else a steady spread from the day it was made,
      // so chores made together don't all come due together.
      c.season_start ? c : { ...c, first_due: c.first_due ?? starterFirstDue(c.id, localDateOf(new Date(c.created_at), timeZone), c) },
      byChore.get(c.id) ?? [],
      today,
    ),
  }));
  return { chores: list, rounds: roundList, members: (members.data ?? []) as ChoreMember[] };
}

/** The household's chore days, Free day last. */
export async function loadChoreDays(): Promise<(ChoreDay & { sort_order: number })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chore_days")
    .select("id, name, icon, weekdays, span, restrictive, max_tasks, max_big, is_free, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data;
}

/** The to-do lists and their to-dos (open ones, plus the last few done). */
export async function loadTodos() {
  const supabase = await createClient();
  const [lists, todos] = await Promise.all([
    supabase.from("task_lists").select("id, name, icon, visibility").order("sort_order").order("name"),
    supabase
      .from("task_instances")
      .select("id, list_id, title, icon, due_date, assignee_id, status, completed_on, notes, must_do, date_kind, at_time, lead_days, link, template_id, heads_up_id, minutes, chore_day_id, is_chore, tags")
      .not("list_id", "is", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at"),
  ]);
  for (const r of [lists, todos]) if (r.error) throw r.error;
  return { lists: (lists.data ?? []) as TaskList[], todos: (todos.data ?? []) as Todo[] };
}

/** Open to-dos for the Today screen (see src/lib/todos.ts for when each shows). */
export function todosForToday(todos: Todo[], today: LocalDate): Todo[] {
  return sortForToday(
    todos.filter((t) => showsOn(t, today)),
    today,
  );
}
