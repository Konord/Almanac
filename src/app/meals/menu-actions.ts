"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { clampBatches } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";

/*
 * Saving the Menu Manager's Meals tab: every change on the screen goes in
 * one Save (Connor, 2026-11-07).
 */

export type DraftSpot = { kindId: string | null; recipeId: string | null; batches: number };
export type DraftMenuMeal = { id: string; name: string; icon: string | null; categoryIds: string[]; spots: DraftSpot[] };
export type MenuChanges = Record<string, DraftMenuMeal | null>;
/** A kind of meal (Tacos) as the screen keeps it. Leftovers is the blank: it can be renamed, not removed. */
export type DraftKind = { id: string; name: string; icon: string | null; active: boolean; isLeftovers: boolean };
/** Kinds of meal that changed: new or renamed ones, and null for removed ones. */
export type KindChanges = Record<string, Pick<DraftKind, "name" | "icon"> | null>;
export type SaveMenuResult = { ok: true; ids: Record<string, string> } | { ok: false; error: string };

const isNew = (id: string) => id.startsWith("new-");

export async function saveMenu(changes: MenuChanges, kindChanges: KindChanges = {}): Promise<SaveMenuResult> {
  const household = await requireHousehold();
  const supabase = await createClient();
  const ids: Record<string, string> = {};

  // Kinds of meal first, so new meals can go under new kinds.
  for (const [id, kind] of Object.entries(kindChanges).slice(0, 100)) {
    if (kind === null) {
      if (isNew(id)) continue;
      const { error } = await supabase.from("meal_categories").delete().eq("id", id).eq("is_leftovers", false);
      if (error) return { ok: false, error: error.message };
      continue;
    }
    const name = kind.name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) return { ok: false, error: "Give it a name, like Tacos." };
    const row = { name, icon: kind.icon && kind.icon.length <= 16 ? kind.icon : null };
    if (isNew(id)) {
      const { data, error } = await supabase.from("meal_categories").insert({ ...row, household_id: household.id, sort_order: 100 }).select("id").single();
      if (error) return { ok: false, error: error.message.includes("meal_categories") ? `There's already a ${name}.` : error.message };
      ids[id] = data.id;
    } else {
      const { error } = await supabase.from("meal_categories").update(row).eq("id", id);
      if (error) return { ok: false, error: error.message };
    }
  }

  const [cats, kinds, recipes] = await Promise.all([
    supabase.from("meal_categories").select("id").eq("is_leftovers", false),
    supabase.from("dish_kinds").select("id"),
    supabase.from("recipes").select("id"),
  ]);
  for (const r of [cats, kinds, recipes]) if (r.error) return { ok: false, error: r.error.message };
  const catIds = new Set((cats.data ?? []).map((c) => c.id));
  const kindIds = new Set((kinds.data ?? []).map((k) => k.id));
  const recipeIds = new Set((recipes.data ?? []).map((r) => r.id));

  for (const [id, meal] of Object.entries(changes).slice(0, 200)) {
    if (meal === null) {
      if (isNew(id)) continue;
      const { error } = await supabase.from("menu_meals").delete().eq("id", id);
      if (error) return { ok: false, error: error.message };
      continue;
    }
    const spots = meal.spots
      .map((s) => ({
        kind_id: s.kindId && kindIds.has(s.kindId) ? s.kindId : null,
        recipe_id: s.recipeId && recipeIds.has(s.recipeId) ? s.recipeId : null,
        batches: clampBatches(s.batches),
      }))
      .filter((s) => s.kind_id || s.recipe_id)
      .slice(0, 20)
      .map((s, position) => ({ ...s, position }));
    if (spots.length === 0) return { ok: false, error: `${meal.name.trim() || "A meal"} needs at least one dish.` };
    const row = { name: meal.name.trim().replace(/\s+/g, " ").slice(0, 80) || null, icon: meal.icon && meal.icon.length <= 16 ? meal.icon : null };
    let mealId = id;
    if (isNew(id)) {
      const { data, error } = await supabase.from("menu_meals").insert({ ...row, household_id: household.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      mealId = data.id;
      ids[id] = mealId;
    } else {
      const { error } = await supabase.from("menu_meals").update(row).eq("id", id);
      if (error) return { ok: false, error: error.message };
      const a = await supabase.from("menu_meal_spots").delete().eq("menu_meal_id", id);
      if (a.error) return { ok: false, error: a.error.message };
      const b = await supabase.from("menu_meal_categories").delete().eq("menu_meal_id", id);
      if (b.error) return { ok: false, error: b.error.message };
    }
    const { error: spotError } = await supabase.from("menu_meal_spots").insert(spots.map((s) => ({ ...s, menu_meal_id: mealId, household_id: household.id })));
    if (spotError) return { ok: false, error: spotError.message };
    const categoryIds = [...new Set(meal.categoryIds.map((c) => ids[c] ?? c))].filter((c) => catIds.has(c));
    if (categoryIds.length) {
      const { error } = await supabase.from("menu_meal_categories").insert(categoryIds.map((category_id) => ({ menu_meal_id: mealId, category_id, household_id: household.id })));
      if (error) return { ok: false, error: error.message };
    }
  }
  await supabase.from("activity_log").insert({ household_id: household.id, action: "menu_saved", target_type: "household", target_id: household.id, details: { meals: String(Object.keys(changes).length), kinds: String(Object.keys(kindChanges).length) } });
  revalidatePath("/", "layout");
  return { ok: true, ids };
}
