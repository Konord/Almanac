import { createClient } from "@/lib/supabase/server";
import { isChoreTag, placeable, planChoreDays, stretchStart, type ChoreDay, type ChoreDayMove, type ChorePlan } from "@/lib/chore-days";
import { spreadSlack } from "@/lib/chores";
import type { Household } from "@/lib/household";
import { addDays, type LocalDate } from "@/lib/time";
import { loadChoreDays, loadChores, type ChoreMember, type ChoreWithTiming, type Round } from "./data";

/*
 * The chore generator on the server (tasks rework, step 2). Each time a
 * screen shows chores, it plans the next two weeks (src/lib/chore-days.ts)
 * and then makes today's chores into tasks on the daily list:
 *
 *   - a preset chore on its chore day (one task for a whole stretch),
 *   - a generated chore on the day it was placed,
 *   - a one-off chore (a list task with a chore day) on its day.
 *
 * Only today is made into tasks. A chore left undone goes back to the
 * bucket at the end of the day and is placed again; a preset left undone
 * is dropped (it comes back next chore day). Essential chores are placed
 * on today again, so they roll to tomorrow.
 */

export type ChoreSchedule = {
  chores: ChoreWithTiming[];
  rounds: Round[];
  members: ChoreMember[];
  choreDays: (ChoreDay & { sort_order: number })[];
  plan: ChorePlan;
  /** Chores that are hard to schedule: no chore day takes them, or no room this week. */
  hard: Set<string>;
};

/** Days marked away (a break marked "away") from today through the plan. */
async function loadAway(today: LocalDate, last: LocalDate): Promise<Set<LocalDate>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("breaks")
    .select("start_date, end_date")
    .eq("away", true)
    .lte("start_date", last)
    .gte("end_date", today);
  if (error) throw error;
  const away = new Set<LocalDate>();
  for (const b of data ?? []) {
    for (let d = b.start_date < today ? today : b.start_date; d <= b.end_date && d <= last; d = addDays(d, 1)) away.add(d);
  }
  return away;
}

/** Chore days moved on single dates (by the weekly review) between two dates. */
export async function loadChoreDayMoves(from: LocalDate, to: LocalDate): Promise<ChoreDayMove[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("chore_day_moves").select("chore_day_id, date, on").gte("date", from).lte("date", to);
  if (error) throw error;
  return data ?? [];
}

/** Plans the chores and makes today's into tasks. `sync: false` only plans (for screens that don't show the daily list). */
export async function choreSchedule(household: Household, today: LocalDate, timeZone: string, sync = true): Promise<ChoreSchedule> {
  const supabase = await createClient();
  const last = addDays(today, 13);
  const [{ chores, rounds, members }, choreDays, away, moves, tasks] = await Promise.all([
    loadChores(today, timeZone),
    loadChoreDays(),
    loadAway(today, last),
    loadChoreDayMoves(addDays(today, -6), last),
    choreTasks(supabase, today),
  ]);
  if (tasks.error) throw tasks.error;

  const open = tasks.data.filter((t) => t.status === "open");
  const chorePending = open.filter((t) => t.template_id);
  // One-offs: undated or placed on an earlier day (back in the bucket), or already on today.
  const oneOffs = open.filter((t) => !t.template_id && !t.heads_up_id && (t.due_date === null || t.due_date <= today));
  const keptToday = new Set([
    ...chorePending.filter((t) => t.due_date === today).map((t) => t.template_id as string),
    ...oneOffs.filter((t) => t.due_date === today).map((t) => t.id),
  ]);

  const plan = planChoreDays({
    choreDays,
    chores: chores.map((c) => ({
      id: c.id,
      kind: c.kind,
      tags: c.tags,
      chore_day_ids: c.chore_day_ids,
      at_time: c.at_time,
      dueOn: c.timing.dueOn,
      not_before: c.not_before,
      active: c.active,
      slackDays: c.kind === "generated" ? spreadSlack(c) : 0,
    })),
    oneOffs: oneOffs.map((t) => ({
      id: t.id,
      chore_day_id: t.chore_day_id,
      tags: t.tags.filter(isChoreTag),
    })),
    today,
    away,
    keptToday,
    moves,
  });

  const hard = new Set(plan.unplaced);
  for (const c of chores) if (c.active && !placeable(choreDays, c.chore_day_ids)) hard.add(c.id);

  if (sync)
    await makeToday(
      household,
      today,
      chores,
      plan,
      tasks.data,
      oneOffs.map((t) => t.id),
      moves,
    );
  return { chores, rounds, members, choreDays, plan, hard };
}

/** Tasks chores made, and one-off chores on the Chores list. */
async function choreTasks(supabase: Awaited<ReturnType<typeof createClient>>, today: LocalDate) {
  const { data: choresList } = await supabase.from("task_lists").select("id").eq("is_chores", true).maybeSingle();
  return supabase
    .from("task_instances")
    .select("id, template_id, heads_up_id, chore_day_id, tags, status, due_date, list_id")
    .not("list_id", "is", null)
    .or(choresList ? `template_id.not.is.null,list_id.eq.${choresList.id}` : "template_id.not.is.null")
    .or(`status.eq.open,due_date.gte.${addDays(today, -7)}`);
}

type TaskRow = {
  id: string;
  template_id: string | null;
  chore_day_id: string | null;
  status: string;
  due_date: string | null;
};

async function makeToday(
  household: Household,
  today: LocalDate,
  chores: ChoreWithTiming[],
  plan: ChorePlan,
  tasks: TaskRow[],
  oneOffIds: string[],
  moves: ChoreDayMove[],
) {
  const supabase = await createClient();
  const fail = (error: { code?: string } | null) => {
    // Two screens can race to make the same one; the unique index keeps one.
    if (error && error.code !== "23505") throw error;
  };
  const day = plan.days[0];
  const byId = new Map(chores.map((c) => [c.id, c]));

  // Today's chores and the date each task carries (a stretch's first day for presets).
  const wanted = new Map<string, LocalDate>();
  for (const id of day.presets) {
    const chore = byId.get(id);
    const cd = day.choreDays.find((d) => chore?.chore_day_ids.includes(d.id));
    if (chore && cd) wanted.set(id, stretchStart(cd, today, moves));
  }
  for (const item of day.items) if (item.kind === "generated") wanted.set(item.id, today);
  // A preset done (or skipped) earlier in its stretch isn't made again.
  for (const t of tasks)
    if (t.template_id && t.status !== "open" && wanted.get(t.template_id) === t.due_date && byId.get(t.template_id)?.kind === "preset")
      wanted.delete(t.template_id);

  const openChores = tasks.filter((t) => t.status === "open" && t.template_id);
  const stale = openChores.filter((t) => wanted.get(t.template_id as string) !== t.due_date).map((t) => t.id);
  if (stale.length > 0) fail((await supabase.from("task_instances").delete().in("id", stale)).error);

  const have = new Set(openChores.filter((t) => !stale.includes(t.id)).map((t) => t.template_id));
  const missing = [...wanted].filter(([id]) => !have.has(id));
  if (missing.length > 0) {
    const { data: list } = await supabase.from("task_lists").select("id").eq("is_chores", false).eq("is_groceries", false).order("sort_order").order("name").limit(1).maybeSingle();
    if (list) {
      for (const [id, date] of missing) {
        const c = byId.get(id) as ChoreWithTiming;
        fail(
          (
            await supabase.from("task_instances").insert({
              household_id: household.id,
              template_id: c.id,
              list_id: list.id,
              title: c.name,
              icon: c.icon ?? "🧹",
              due_date: date,
              // A regular chore's time is when it's due by; an occasional one's is when it starts.
              date_kind: c.kind === "preset" && c.at_time ? "due" : "start",
              at_time: c.at_time,
              must_do: c.tags.includes("essential"),
              assignee_id: c.default_assignee_id,
              link: c.link,
              visibility: c.visibility,
            })
          ).error,
        );
      }
    }
  }

  // One-offs: on today if placed there, back to undated if their day passed.
  const placed = new Set(day.items.filter((i) => i.kind === "one-off").map((i) => i.id));
  const toToday = oneOffIds.filter((id) => placed.has(id) && tasks.find((t) => t.id === id)?.due_date !== today);
  const back = oneOffIds.filter((id) => !placed.has(id) && tasks.find((t) => t.id === id)?.due_date !== null);
  if (toToday.length > 0)
    fail((await supabase.from("task_instances").update({ due_date: today, date_kind: "start" }).in("id", toToday)).error);
  if (back.length > 0) fail((await supabase.from("task_instances").update({ due_date: null }).in("id", back)).error);
}
