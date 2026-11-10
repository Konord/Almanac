"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { spotsFrom, spotSummary, type DraftDish } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";
import type { ReviewDish, ReviewMenuMeal } from "./data";

/*
 * Two things the review's meal picker saves straight away, because they
 * change the menu rather than the week: a quick dish ("Green beans") and
 * "Save as meal" (Thanksgiving dinner, for next year). The week's own
 * changes still wait for the review's Save.
 */

export type QuickDishResult = { ok: true; dish: ReviewDish } | { ok: false; error: string };

/** A dish with just a name and a kind; its ingredients can be added in the Menu Manager. */
export async function addQuickDish(input: { name: string; icon: string | null; kindId: string | null }): Promise<QuickDishResult> {
  const household = await requireHousehold();
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { ok: false, error: "The dish needs a name." };
  const supabase = await createClient();
  let icon = input.icon && input.icon.length <= 16 ? input.icon : null;
  if (!icon && input.kindId) {
    const { data: kind } = await supabase.from("dish_kinds").select("icon").eq("id", input.kindId).maybeSingle();
    icon = kind?.icon ?? null;
  }
  const { data, error } = await supabase.from("recipes").insert({ household_id: household.id, name, icon, serves: 4 }).select("id, serves").single();
  if (error) return { ok: false, error: error.message };
  if (input.kindId) {
    const { error: kindError } = await supabase.from("recipe_kinds").insert({ recipe_id: data.id, kind_id: input.kindId, household_id: household.id });
    if (kindError) return { ok: false, error: kindError.message };
  }
  await supabase.from("activity_log").insert({ household_id: household.id, action: "dish_added", target_type: "recipe", target_id: data.id, details: { name, from: "review" } });
  revalidatePath("/", "layout");
  return { ok: true, dish: { id: data.id, name, icon, kind_ids: input.kindId ? [input.kindId] : [], is_backup: false, serves: data.serves } };
}

export type SaveAsMealResult = { ok: true; meal: ReviewMenuMeal } | { ok: false; error: string };

/** Keeps a meal's dishes (open spots stay open) as a meal on the menu, under these kinds of meal. */
export async function saveAsMeal(input: { name: string; icon: string | null; categoryIds: string[]; dishes: DraftDish[] }): Promise<SaveAsMealResult> {
  const household = await requireHousehold();
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { ok: false, error: "Give the meal a name." };
  const spots = spotsFrom(input.dishes).slice(0, 20);
  if (spots.length === 0) return { ok: false, error: "Add a dish first." };
  const supabase = await createClient();
  const [cats, kinds, recipes] = await Promise.all([
    supabase.from("meal_categories").select("id"),
    supabase.from("dish_kinds").select("id"),
    supabase.from("recipes").select("id"),
  ]);
  for (const r of [cats, kinds, recipes]) if (r.error) return { ok: false, error: r.error.message };
  const catIds = new Set((cats.data ?? []).map((c) => c.id));
  const kindIds = new Set((kinds.data ?? []).map((k) => k.id));
  const recipeIds = new Set((recipes.data ?? []).map((r) => r.id));
  const clean = spots
    .map((s) => ({ ...s, kind_id: s.kind_id && kindIds.has(s.kind_id) ? s.kind_id : null, recipe_id: s.recipe_id && recipeIds.has(s.recipe_id) ? s.recipe_id : null }))
    .filter((s) => s.kind_id || s.recipe_id)
    .map((s, position) => ({ ...s, position }));
  if (clean.length === 0) return { ok: false, error: "Add a dish first." };

  const { data, error } = await supabase
    .from("menu_meals")
    .insert({ household_id: household.id, name, icon: input.icon && input.icon.length <= 16 ? input.icon : null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const { error: spotError } = await supabase.from("menu_meal_spots").insert(clean.map((s) => ({ ...s, menu_meal_id: data.id, household_id: household.id })));
  if (spotError) return { ok: false, error: spotError.message };
  const categoryIds = [...new Set(input.categoryIds)].filter((id) => catIds.has(id));
  if (categoryIds.length) {
    const { error: catError } = await supabase.from("menu_meal_categories").insert(categoryIds.map((category_id) => ({ menu_meal_id: data.id, category_id, household_id: household.id })));
    if (catError) return { ok: false, error: catError.message };
  }
  await supabase.from("activity_log").insert({ household_id: household.id, action: "menu_meal_added", target_type: "menu_meal", target_id: data.id, details: { name, from: "review" } });
  revalidatePath("/", "layout");
  const meal = { id: data.id, name, icon: input.icon, category_ids: categoryIds, spots: clean };
  return { ok: true, meal: { ...meal, summary: spotSummary(meal) } };
}
