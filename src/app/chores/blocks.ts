import { createClient } from "@/lib/supabase/server";
import { fillBlocks, SIZE_MINUTES, type BlockDay, type ChoreBlock, type ChoreTodo } from "@/lib/chore-blocks";
import type { Household } from "@/lib/household";
import type { LocalDate } from "@/lib/time";
import type { ChoreWithTiming, Todo } from "./data";

/*
 * Server-side chore blocks: loading them, making to-dos for chores that
 * have come due, and working out which to-dos go in which block.
 */

/** A chore's to-do, with what filling blocks needs. */
export type PlannedTodo = Todo & ChoreTodo & { size: "small" | "medium" | "big"; chore: ChoreWithTiming };

export type ChorePlan = {
  blocks: ChoreBlock[];
  /** Each block on each day of the coming week, with its to-dos. */
  days: BlockDay<PlannedTodo>[];
  /** Due chores' to-dos with no room in a block: they sit on the to-do list. */
  left: PlannedTodo[];
  /** Ids of to-dos waiting for a block, so lists can leave them out. */
  inBlocks: Set<string>;
};

/** Chore to-dos on the plain list before the rest wait (so it isn't overwhelming). */
export const CHORE_LIST_LIMIT = 3;

export async function loadBlocks(): Promise<ChoreBlock[]> {
  const supabase = await createClient();
  const [blocks, presets] = await Promise.all([
    supabase
      .from("chore_blocks")
      .select("id, name, icon, kind, chore_id, weekdays, start_time, minutes, member_ids, loose")
      .order("sort_order")
      .order("name"),
    supabase.from("chore_block_presets").select("block_id, chore_id").order("sort_order"),
  ]);
  if (blocks.error) throw blocks.error;
  if (presets.error) throw presets.error;
  return blocks.data.map((b) => ({
    ...b,
    kind: b.kind as ChoreBlock["kind"],
    start_time: b.start_time.slice(0, 5),
    presets: presets.data.filter((p) => p.block_id === b.id).map((p) => p.chore_id),
  }));
}

/**
 * Makes a to-do for each chore that has come due (if it hasn't one), and
 * clears open ones for chores that aren't due any more (done another way,
 * skipped by the Survival button, or paused).
 */
export async function syncChoreTodos(household: Household, chores: ChoreWithTiming[]): Promise<void> {
  const supabase = await createClient();
  const { data: open, error } = await supabase
    .from("task_instances")
    .select("id, template_id")
    .eq("status", "open")
    .not("template_id", "is", null)
    .not("list_id", "is", null);
  if (error) throw error;
  const due = new Map(chores.filter((c) => c.active && c.timing.state === "due").map((c) => [c.id, c]));
  const stale = open.filter((t) => !due.has(t.template_id as string)).map((t) => t.id);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from("task_instances").delete().in("id", stale);
    if (deleteError) throw deleteError;
  }
  const have = new Set(open.map((t) => t.template_id));
  const missing = [...due.values()].filter((c) => !have.has(c.id));
  if (missing.length === 0) return;
  const { data: list } = await supabase.from("task_lists").select("id").order("sort_order").order("name").limit(1).maybeSingle();
  if (!list) return;
  for (const c of missing) {
    const { error: insertError } = await supabase.from("task_instances").insert({
      household_id: household.id,
      template_id: c.id,
      list_id: list.id,
      title: c.name,
      icon: c.icon ?? "🧹",
      due_date: c.timing.dueOn,
      date_kind: "start",
      minutes: choreMinutes(c),
      assignee_id: c.default_assignee_id,
      link: c.link,
      visibility: c.visibility,
    });
    // Two screens can race to make the same one; the unique index keeps one.
    if (insertError && insertError.code !== "23505") throw insertError;
  }
}

export function choreMinutes(c: Pick<ChoreWithTiming, "est_minutes" | "size">): number {
  return c.est_minutes ?? SIZE_MINUTES[c.size];
}

const WEIGHT = { high: 2, normal: 1, low: 0 } as const;

/** Which chore to-dos go in which block this week, and which are left for the list. */
export function planChores(blocks: ChoreBlock[], chores: ChoreWithTiming[], todos: Todo[], today: LocalDate): ChorePlan {
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const planned: PlannedTodo[] = todos.flatMap((t) => {
    const chore = t.template_id ? choreById.get(t.template_id) : undefined;
    if (!chore || t.status !== "open") return [];
    return [
      {
        ...t,
        template_id: chore.id,
        minutes: t.minutes ?? choreMinutes(chore),
        due_date: t.due_date ?? today,
        weight: WEIGHT[chore.importance],
        size: chore.size,
        chore,
      },
    ];
  });
  const { days, left } = fillBlocks(blocks, planned, today);
  return { blocks, days, left, inBlocks: new Set(days.flatMap((d) => d.items.map((t) => t.id))) };
}
