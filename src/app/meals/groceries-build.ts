import { createClient } from "@/lib/supabase/server";
import type { Household } from "@/lib/household";
import { scaleAmount, weekDates } from "@/lib/meals";
import { addDays, type LocalDate } from "@/lib/time";

/*
 * Building a week's grocery suggestions. Nothing here goes on the list by
 * itself: every line is "suggested" until someone approves it.
 *
 * Three kinds of line:
 * - meal: ingredients of the week's planned meals, scaled to the servings
 *   and added together (two meals with onions → one onion line).
 * - weekly: the things you buy every week (or every few weeks) that are due.
 * - backup: backup meal parts below their minimum.
 *
 * Things already approved for the week aren't suggested again.
 */

type Line = {
  item_id: string;
  amount: number | null;
  unit: string | null;
  source: "meal" | "weekly" | "backup";
  detail: string | null;
  backup_part_id: string | null;
};

export async function buildSuggestions(household: Household, week: LocalDate): Promise<{ count: number }> {
  const supabase = await createClient();
  const dates = weekDates(week);

  // Start fresh: the old suggestions for this week go.
  const { error: clearError } = await supabase.from("shopping_list").delete().eq("status", "suggested").eq("week_of", week).neq("source", "backup");
  if (clearError) throw clearError;

  const [meals, approved, buys, parts, pendingBackup] = await Promise.all([
    supabase
      .from("meals")
      .select("recipe_id, servings, recipes(name, serves, is_backup)")
      .eq("status", "planned")
      .gte("date", dates[0])
      .lte("date", dates[6])
      .not("recipe_id", "is", null),
    supabase.from("shopping_list").select("item_id").eq("status", "approved").eq("week_of", week),
    supabase.from("weekly_buys").select("item_id, amount, unit, every_weeks, last_week"),
    supabase.from("backup_parts").select("id, item_id, on_hand, keep_at_least, recipes(name)"),
    supabase.from("shopping_list").select("backup_part_id").eq("checked", false).not("backup_part_id", "is", null),
  ]);
  for (const r of [meals, approved, buys, parts, pendingBackup]) if (r.error) throw r.error;

  const already = new Set((approved.data ?? []).map((a) => a.item_id));
  const lines: Line[] = [];

  // Meal ingredients, added together by item and unit.
  type Planned = { recipe_id: string; servings: number | null; recipe: { name: string; serves: number; is_backup: boolean } | null };
  const planned = (meals.data ?? []).map((m) => ({
    recipe_id: m.recipe_id as string,
    servings: m.servings,
    recipe: m.recipes as unknown as Planned["recipe"],
  })) as Planned[];
  // Backup meals come from what's on hand, not the shop.
  const cooking = planned.filter((m) => m.recipe && !m.recipe.is_backup);
  const recipeIds = [...new Set(cooking.map((m) => m.recipe_id))];
  if (recipeIds.length) {
    const { data: ingredients, error } = await supabase.from("recipe_ingredients").select("recipe_id, item_id, amount, unit").in("recipe_id", recipeIds);
    if (error) throw error;
    const combined = new Map<string, { item_id: string; unit: string | null; amount: number | null; names: Set<string> }>();
    for (const meal of cooking) {
      for (const ing of (ingredients ?? []).filter((i) => i.recipe_id === meal.recipe_id)) {
        if (already.has(ing.item_id)) continue;
        const key = `${ing.item_id}|${ing.unit ?? ""}`;
        const amount = scaleAmount(ing.amount === null ? null : Number(ing.amount), meal.servings, meal.recipe!.serves);
        const line = combined.get(key) ?? { item_id: ing.item_id, unit: ing.unit, amount: null, names: new Set<string>() };
        // An amount plus "to taste" stays the amount.
        if (amount !== null) line.amount = Math.round(((line.amount ?? 0) + amount) * 1000) / 1000;
        line.names.add(meal.recipe!.name);
        combined.set(key, line);
      }
    }
    for (const l of combined.values()) {
      lines.push({ item_id: l.item_id, amount: l.amount, unit: l.unit, source: "meal", detail: [...l.names].join(", ").slice(0, 200), backup_part_id: null });
    }
  }

  // Weekly buys that are due this week.
  for (const b of buys.data ?? []) {
    if (already.has(b.item_id)) continue;
    const due = !b.last_week || b.last_week <= addDays(week, -7 * b.every_weeks);
    if (!due || b.last_week === week) continue;
    lines.push({
      item_id: b.item_id,
      amount: b.amount === null ? null : Number(b.amount),
      unit: b.unit,
      source: "weekly",
      detail: b.every_weeks === 1 ? "Every week" : `Every ${b.every_weeks} weeks`,
      backup_part_id: null,
    });
  }

  // Backup parts that are low, unless they're already waiting on the list.
  const waiting = new Set((pendingBackup.data ?? []).map((p) => p.backup_part_id));
  for (const p of parts.data ?? []) {
    const onHand = Number(p.on_hand);
    const keep = Number(p.keep_at_least);
    if (onHand >= keep || waiting.has(p.id)) continue;
    const recipe = p.recipes as unknown as { name: string } | null;
    lines.push({
      item_id: p.item_id,
      amount: Math.ceil(keep - onHand),
      unit: null,
      source: "backup",
      detail: `Restock ${recipe?.name ?? "backup meal"}`.slice(0, 200),
      backup_part_id: p.id,
    });
  }

  if (lines.length) {
    const { error } = await supabase
      .from("shopping_list")
      .insert(lines.map((l) => ({ ...l, household_id: household.id, week_of: week, status: "suggested" })));
    if (error) throw error;
  }
  return { count: lines.length };
}
