import type { createClient } from "@/lib/supabase/server";

/*
 * Chores the planner makes, heads-ups and the cook's reminders are tasks,
 * and every task sits on a list. They don't show on that list (the Daily
 * List shows them), so it only matters that there is one. Before
 * 2026-11-26 that had to be an ordinary list like To-do, so deleting To-do
 * quietly stopped the day's chores. Now To-do is just the first list you
 * get (Connor: "it is just the default list but can be deleted"): the
 * first ordinary list holds them, or the Chores list, which always exists,
 * when there is none.
 */
export async function homeListId(supabase: Awaited<ReturnType<typeof createClient>>, fallBackToChores = true): Promise<string | null> {
  const { data: list } = await supabase
    .from("task_lists")
    .select("id")
    .eq("is_chores", false)
    .eq("is_groceries", false)
    // Not an adults-only list: those stay off the kitchen screen, and the day's chores must show there.
    .eq("visibility", "everyone")
    .order("sort_order")
    .order("name")
    .limit(1)
    .maybeSingle();
  if (list) return list.id;
  if (!fallBackToChores) return null;
  const { data: chores } = await supabase.from("task_lists").select("id").eq("is_chores", true).maybeSingle();
  return chores?.id ?? null;
}
