"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { guessAisle, weekStartOf } from "@/lib/meals";
import { parseRecipeHtml, parseRecipeText, type ImportedRecipe } from "@/lib/recipe-import";
import { addDays, isLocalDate, isLocalTime, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { isVisibility } from "../calendar/options";
import { applyPresets, findOrCreateItem, nextFreeDate, seededDatesFrom, syncHeadsUps } from "./shared";

/*
 * Every Meals change. Like the other screens: each action re-checks the
 * signed-in household, the database's security rules check again, and
 * notable changes go in the activity log.
 */

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Where to go back to: only our own Meals (or Today) pages. */
function returnPath(formData: FormData): string {
  const value = text(formData, "returnTo");
  return /^\/(meals(\/[\w/-]*)?)?(\?[\w=&%.:|,-]*)?$/.test(value) ? value : "/meals";
}

function withParams(path: string, set: Record<string, string | null>): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  for (const [k, v] of Object.entries(set)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

function back(formData: FormData, kind: "error" | "message", message: string, extra: Record<string, string | null> = {}): never {
  redirect(withParams(returnPath(formData), { error: null, message: null, ...extra, [kind]: message }));
}

/** Goes back without a message (and with some params changed, e.g. closing a card). */
function backQuietly(formData: FormData, extra: Record<string, string | null> = {}): never {
  redirect(withParams(returnPath(formData), { error: null, message: null, ...extra }));
}

async function log(householdId: string, action: string, targetType: string, targetId: string, details: Record<string, string>) {
  const supabase = await createClient();
  await supabase.from("activity_log").insert({ household_id: householdId, action, target_type: targetType, target_id: targetId, details });
}

function refresh() {
  revalidatePath("/meals", "layout");
  revalidatePath("/");
  revalidatePath("/lists");
  revalidatePath("/chores");
  revalidatePath("/routines");
}

function readIcon(formData: FormData): string | null {
  const icon = text(formData, "icon");
  if (icon && [...icon].length > 4) back(formData, "error", "The picture should be one emoji, like 🌮.");
  return icon || null;
}

function wholeNumber(value: string, min: number, max: number): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
}

function positive(value: unknown, max = 100000): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 1000) / 1000 : null;
}

// ---------------------------------------------------------------------------
// Planning: called straight from the planner (drag and drop), so they
// return a result instead of going to another page.
// ---------------------------------------------------------------------------

export type PlanResult = { error?: string; mealId?: string; needsPick?: boolean };

/** Puts a category (or one variant) into a day's meal time. */
export async function placeMeal(input: { date: string; mealTimeId: string; categoryId?: string | null; recipeId?: string | null }): Promise<PlanResult> {
  const household = await requireHousehold();
  if (!isLocalDate(input.date)) return { error: "That day isn't right." };
  if (!input.categoryId && !input.recipeId) return { error: "Pick a meal first." };
  const supabase = await createClient();
  let recipeId = input.recipeId ?? null;
  let categoryId = input.categoryId ?? null;
  if (categoryId && !recipeId) {
    const { data } = await supabase.from("recipe_categories").select("recipe_id").eq("category_id", categoryId);
    // A category with one variant needs no choosing.
    if (data && data.length === 1) recipeId = data[0].recipe_id;
  }
  if (recipeId && !categoryId) {
    const { data } = await supabase.from("recipe_categories").select("category_id").eq("recipe_id", recipeId).limit(1);
    categoryId = data?.[0]?.category_id ?? null;
  }
  const { data: existing } = await supabase.from("meals").select("sort_order").eq("date", input.date).eq("meal_time_id", input.mealTimeId);
  const { data, error } = await supabase
    .from("meals")
    .insert({
      household_id: household.id,
      date: input.date,
      meal_time_id: input.mealTimeId,
      category_id: categoryId,
      recipe_id: recipeId,
      sort_order: (existing ?? []).reduce((m, x) => Math.max(m, x.sort_order + 1), 0),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await syncHeadsUps(household.id, data.id, household.settings.timeZone);
  refresh();
  return { mealId: data.id, needsPick: !recipeId };
}

/** Moves a planned meal to another day or meal time. */
export async function moveMeal(input: { mealId: string; date: string; mealTimeId: string }): Promise<PlanResult> {
  const household = await requireHousehold();
  if (!isLocalDate(input.date)) return { error: "That day isn't right." };
  const supabase = await createClient();
  const { error } = await supabase.from("meals").update({ date: input.date, meal_time_id: input.mealTimeId }).eq("id", input.mealId);
  if (error) return { error: error.message };
  await syncHeadsUps(household.id, input.mealId, household.settings.timeZone);
  refresh();
  return { mealId: input.mealId };
}

/** Takes a meal off the plan. */
export async function removeMeal(input: { mealId: string }): Promise<PlanResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("meals").delete().eq("id", input.mealId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// The meal card: variant, people, servings, remove
// ---------------------------------------------------------------------------

export async function pickVariant(formData: FormData) {
  const household = await requireHousehold();
  const mealId = text(formData, "mealId");
  const recipeId = text(formData, "recipeId") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("meals").update({ recipe_id: recipeId }).eq("id", mealId);
  if (error) back(formData, "error", error.message);
  await syncHeadsUps(household.id, mealId, household.settings.timeZone);
  refresh();
  backQuietly(formData, { meal: text(formData, "keepOpen") ? mealId : null });
}

/** Who a meal is for. Everyone ticked (or nobody) means everyone. */
export async function setMealPeople(formData: FormData) {
  const household = await requireHousehold();
  const mealId = text(formData, "mealId");
  const chosen = formData.getAll("memberIds").map(String).filter(Boolean);
  const supabase = await createClient();
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true });
  await supabase.from("meal_members").delete().eq("meal_id", mealId);
  if (chosen.length > 0 && chosen.length < (count ?? 0)) {
    const { error } = await supabase.from("meal_members").insert(chosen.map((member_id) => ({ meal_id: mealId, member_id, household_id: household.id })));
    if (error) back(formData, "error", error.message);
  }
  refresh();
  backQuietly(formData);
}

export async function setServings(formData: FormData) {
  await requireHousehold();
  const mealId = text(formData, "mealId");
  const servings = wholeNumber(text(formData, "servings"), 1, 50);
  if (Number.isNaN(servings)) back(formData, "error", "Servings should be 1 to 50.");
  const supabase = await createClient();
  const { error } = await supabase.from("meals").update({ servings }).eq("id", mealId);
  if (error) back(formData, "error", error.message);
  refresh();
  backQuietly(formData);
}

export async function removeMealForm(formData: FormData) {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("meals").delete().eq("id", text(formData, "mealId"));
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Taken off the plan.", { meal: null });
}

/** Finished cooking: remember it, and plan any leftovers for tomorrow's lunch. */
export async function markCooked(formData: FormData) {
  const household = await requireHousehold();
  const mealId = text(formData, "mealId");
  const leftovers = text(formData, "leftovers") === "lunch";
  const supabase = await createClient();
  const { data: meal, error } = await supabase.from("meals").update({ status: "cooked" }).eq("id", mealId).select("id, date, recipe_id").single();
  if (error) back(formData, "error", error.message);
  if (meal.recipe_id) await supabase.from("recipes").update({ last_cooked_on: meal.date }).eq("id", meal.recipe_id);
  if (leftovers && meal.recipe_id) {
    const { data: lunch } = await supabase.from("meal_times").select("id").ilike("name", "lunch").limit(1).maybeSingle();
    const { data: cat } = await supabase.from("meal_categories").select("id").ilike("name", "leftovers").limit(1).maybeSingle();
    if (lunch) {
      await supabase.from("meals").insert({
        household_id: household.id,
        date: addDays(meal.date, 1),
        meal_time_id: lunch.id,
        recipe_id: meal.recipe_id,
        category_id: cat?.id ?? null,
        sort_order: 99,
      });
    }
  }
  await supabase.from("task_instances").delete().eq("meal_id", mealId).eq("status", "open").eq("must_do", false);
  await log(household.id, "meal_cooked", "meal", mealId, {});
  refresh();
  redirect(`/?message=${encodeURIComponent(leftovers ? "Enjoy! Leftovers are on tomorrow's lunch." : "Enjoy!")}`);
}

// ---------------------------------------------------------------------------
// Categories and variants
// ---------------------------------------------------------------------------

function readCategory(formData: FormData) {
  const name = text(formData, "name");
  if (!name) back(formData, "error", "A category needs a name.");
  const visibility = text(formData, "visibility") || "everyone";
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see it.");
  return {
    name: name.slice(0, 40),
    icon: readIcon(formData),
    meal_time_ids: formData.getAll("mealTimeIds").map(String).filter(Boolean),
    visibility,
  };
}

export async function addCategory(formData: FormData) {
  const household = await requireHousehold();
  const category = readCategory(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_categories")
    .insert({ ...category, household_id: household.id, sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(`/meals/library?category=${data.id}&message=${encodeURIComponent(`Added ${category.name}.`)}`);
}

export async function updateCategory(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const category = readCategory(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("meal_categories").update(category).eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Saved ${category.name}.`, { editCategory: null });
}

export async function removeCategory(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("meal_categories").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "meal_category_removed", "meal_category", id, { name });
  refresh();
  redirect(`/meals/library?message=${encodeURIComponent(`Removed ${name}. Its variants are still in the library.`)}`);
}

export async function addRecipe(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  const categoryId = text(formData, "categoryId") || null;
  const backup = text(formData, "backup") === "1";
  if (!name) back(formData, "error", "A variant needs a name.");
  const supabase = await createClient();
  let icon = readIcon(formData);
  if (!icon && categoryId) {
    const { data: cat } = await supabase.from("meal_categories").select("icon").eq("id", categoryId).maybeSingle();
    icon = cat?.icon ?? null;
  }
  const { data, error } = await supabase
    .from("recipes")
    .insert({ household_id: household.id, name: name.slice(0, 80), icon, is_backup: backup })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  if (categoryId) await supabase.from("recipe_categories").insert({ recipe_id: data.id, category_id: categoryId, household_id: household.id });
  await log(household.id, "recipe_added", "recipe", data.id, { name });
  refresh();
  if (backup) redirect(`/meals/backups?edit=${data.id}`);
  redirect(`/meals/library?${categoryId ? `category=${categoryId}&` : ""}recipe=${data.id}&tab=basics`);
}

export async function saveRecipeBasics(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) back(formData, "error", "A variant needs a name.");
  const serves = wholeNumber(text(formData, "serves") || "4", 1, 50);
  const handsOn = wholeNumber(text(formData, "handsOnMinutes"), 0, 1440);
  const total = wholeNumber(text(formData, "totalMinutes"), 0, 2880);
  if (Number.isNaN(serves) || serves === null) back(formData, "error", "Serves should be 1 to 50.");
  if (Number.isNaN(handsOn) || Number.isNaN(total)) back(formData, "error", "Minutes should be whole numbers, like 25.");
  const visibility = text(formData, "visibility") || "everyone";
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see it.");
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({
      name: name.slice(0, 80),
      icon: readIcon(formData),
      serves,
      hands_on_minutes: handsOn,
      total_minutes: total,
      is_backup: formData.get("isBackup") === "on",
      visibility,
    })
    .eq("id", id);
  if (error) back(formData, "error", error.message);
  await supabase.from("recipe_categories").delete().eq("recipe_id", id);
  if (categoryIds.length) await supabase.from("recipe_categories").insert(categoryIds.map((category_id) => ({ recipe_id: id, category_id, household_id: household.id })));
  await supabase.from("recipe_tags").delete().eq("recipe_id", id);
  if (tagIds.length) await supabase.from("recipe_tags").insert(tagIds.map((tag_id) => ({ recipe_id: id, tag_id, household_id: household.id })));
  refresh();
  back(formData, "message", `Saved ${name}.`);
}

export async function saveRecipeNotes(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const source = text(formData, "sourceUrl");
  if (source && !/^https?:\/\//i.test(source)) back(formData, "error", "The link should start with https://");
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({ notes: text(formData, "notes").slice(0, 4000) || null, source_url: source || null })
    .eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Notes saved.");
}

export async function removeRecipe(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "recipe_removed", "recipe", id, { name });
  refresh();
  back(formData, "message", `Removed ${name}.`, { recipe: null, tab: null });
}

type IngredientRow = { amount?: unknown; unit?: unknown; name?: unknown; note?: unknown; putAway?: unknown };

/** Saves the whole ingredient list (sent as JSON from the recipe card). */
export async function saveIngredients(formData: FormData) {
  const household = await requireHousehold();
  const recipeId = text(formData, "recipeId");
  let rows: IngredientRow[];
  try {
    rows = JSON.parse(text(formData, "rows") || "[]") as IngredientRow[];
  } catch {
    back(formData, "error", "Couldn't read the ingredients. Try again.");
  }
  const supabase = await createClient();
  const clean = [];
  for (const r of rows.slice(0, 80)) {
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    clean.push({
      household_id: household.id,
      recipe_id: recipeId,
      item_id: await findOrCreateItem(supabase, household.id, name),
      amount: positive(r.amount),
      unit: String(r.unit ?? "").trim().slice(0, 20) || null,
      note: String(r.note ?? "").trim().slice(0, 80) || null,
      put_away_if_skipped: r.putAway === true,
      position: clean.length,
    });
  }
  const { error: delError } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
  if (delError) back(formData, "error", delError.message);
  if (clean.length) {
    const { error } = await supabase.from("recipe_ingredients").insert(clean);
    if (error) back(formData, "error", error.message);
  }
  refresh();
  back(formData, "message", `Saved ${clean.length} ingredient${clean.length === 1 ? "" : "s"}.`);
}

type HelperRow = { kind?: unknown; minutes?: unknown; temperature?: unknown; label?: unknown };
type StepRow = { text?: unknown; helpers?: HelperRow[] };

/** Saves the steps and the helpers you kept (sent as JSON from the recipe card). */
export async function saveSteps(formData: FormData) {
  const household = await requireHousehold();
  const recipeId = text(formData, "recipeId");
  let rows: StepRow[];
  try {
    rows = JSON.parse(text(formData, "steps") || "[]") as StepRow[];
  } catch {
    back(formData, "error", "Couldn't read the steps. Try again.");
  }
  const supabase = await createClient();
  const { error: delError } = await supabase.from("recipe_steps").delete().eq("recipe_id", recipeId);
  if (delError) back(formData, "error", delError.message);
  const steps = rows
    .map((r) => ({ text: String(r.text ?? "").trim().slice(0, 400), helpers: r.helpers ?? [] }))
    .filter((r) => r.text)
    .slice(0, 60);
  if (steps.length) {
    const { data, error } = await supabase
      .from("recipe_steps")
      .insert(steps.map((s, i) => ({ household_id: household.id, recipe_id: recipeId, position: i, text: s.text })))
      .select("id, position");
    if (error) back(formData, "error", error.message);
    const idAt = new Map(data.map((d) => [d.position, d.id]));
    const helperRows = steps.flatMap((s, i) =>
      s.helpers.flatMap((h) => {
        const kind = String(h.kind);
        if (!["timer", "heads_up", "oven", "doneness"].includes(kind)) return [];
        const minutes = positive(h.minutes, 4320);
        const temperature = positive(h.temperature, 600);
        const label = String(h.label ?? "").trim().slice(0, 80) || null;
        if ((kind === "timer" || kind === "heads_up") && !minutes) return [];
        if ((kind === "oven" || kind === "doneness") && !temperature) return [];
        return [
          {
            household_id: household.id,
            step_id: idAt.get(i)!,
            kind,
            minutes: minutes === null ? null : Math.round(minutes),
            temperature: temperature === null ? null : Math.round(temperature),
            label: kind === "heads_up" ? (label ?? "Get ready") : label,
          },
        ];
      }),
    );
    if (helperRows.length) {
      const { error: helperError } = await supabase.from("step_helpers").insert(helperRows);
      if (helperError) back(formData, "error", helperError.message);
    }
  }
  // Heads-ups for meals already planned with this recipe.
  const today = localDateOf(new Date(), household.settings.timeZone);
  const { data: planned } = await supabase.from("meals").select("id").eq("recipe_id", recipeId).eq("status", "planned").gte("date", addDays(today, -1));
  for (const m of planned ?? []) await syncHeadsUps(household.id, m.id, household.settings.timeZone);
  refresh();
  back(formData, "message", `Saved ${steps.length} step${steps.length === 1 ? "" : "s"}.`);
}

/** Brings a recipe in from pasted text or a web link, then opens it to check. */
export async function importRecipe(formData: FormData) {
  const household = await requireHousehold();
  const mode = text(formData, "mode");
  const categoryId = text(formData, "categoryId") || null;
  let recipe: ImportedRecipe | null = null;
  if (mode === "link") {
    const url = text(formData, "url");
    if (!/^https?:\/\/[^\s]+$/i.test(url)) back(formData, "error", "Paste the whole link, starting with https://");
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Almanac recipe import", Accept: "text/html" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) back(formData, "error", `That page didn't open (${res.status}). Try pasting the recipe instead.`);
      recipe = parseRecipeHtml((await res.text()).slice(0, 3_000_000), url);
    } catch (e) {
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
      if (e && typeof e === "object" && "digest" in e) throw e;
      back(formData, "error", "Couldn't reach that page. Try pasting the recipe instead.");
    }
    if (!recipe) back(formData, "error", "That page doesn't have a recipe Almanac can read. Try pasting it instead.");
  } else {
    const raw = text(formData, "text");
    if (raw.length < 10) back(formData, "error", "Paste the recipe first.");
    recipe = parseRecipeText(raw.slice(0, 20000));
  }
  const name = text(formData, "name") || recipe.name || "New recipe";
  const supabase = await createClient();
  let icon: string | null = null;
  if (categoryId) {
    const { data: cat } = await supabase.from("meal_categories").select("icon").eq("id", categoryId).maybeSingle();
    icon = cat?.icon ?? null;
  }
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      household_id: household.id,
      name: name.slice(0, 80),
      icon,
      serves: recipe.serves && recipe.serves <= 50 ? recipe.serves : 4,
      hands_on_minutes: recipe.handsOnMinutes && recipe.handsOnMinutes <= 1440 ? recipe.handsOnMinutes : null,
      total_minutes: recipe.totalMinutes && recipe.totalMinutes <= 2880 ? recipe.totalMinutes : null,
      source_url: recipe.sourceUrl,
    })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  if (categoryId) await supabase.from("recipe_categories").insert({ recipe_id: data.id, category_id: categoryId, household_id: household.id });
  const ingredients = [];
  for (const [i, ing] of recipe.ingredients.slice(0, 80).entries()) {
    ingredients.push({
      household_id: household.id,
      recipe_id: data.id,
      item_id: await findOrCreateItem(supabase, household.id, ing.name),
      amount: ing.amount,
      unit: ing.unit,
      note: ing.note,
      put_away_if_skipped: guessAisle(ing.name) === "Meat",
      position: i,
    });
  }
  if (ingredients.length) await supabase.from("recipe_ingredients").insert(ingredients);
  if (recipe.steps.length) {
    await supabase.from("recipe_steps").insert(recipe.steps.slice(0, 60).map((s, i) => ({ household_id: household.id, recipe_id: data.id, position: i, text: s })));
  }
  await log(household.id, "recipe_imported", "recipe", data.id, { name, from: mode });
  refresh();
  redirect(
    `/meals/library?${categoryId ? `category=${categoryId}&` : ""}recipe=${data.id}&tab=steps&message=${encodeURIComponent(
      `Brought in ${recipe.ingredients.length} ingredients and ${recipe.steps.length} steps. Check them, and keep the helpers you want.`,
    )}`,
  );
}

// ---------------------------------------------------------------------------
// Setup: meal times, presets, weekly buys
// ---------------------------------------------------------------------------

export async function addMealTime(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  const usual = text(formData, "usualTime") || "12:00";
  if (!name) back(formData, "error", "A meal time needs a name, like Breakfast.");
  if (!isLocalTime(usual)) back(formData, "error", "Pick a time.");
  const supabase = await createClient();
  const { data: last } = await supabase.from("meal_times").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("meal_times")
    .insert({ household_id: household.id, name: name.slice(0, 30), icon: readIcon(formData), usual_time: usual, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Added ${name}.`);
}

export async function updateMealTime(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const usual = text(formData, "usualTime");
  if (!name) back(formData, "error", "A meal time needs a name.");
  if (!isLocalTime(usual)) back(formData, "error", "Pick a time.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_times")
    .update({ name: name.slice(0, 30), icon: readIcon(formData), usual_time: usual, show_on_planner: formData.get("showOnPlanner") === "on" })
    .eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Saved ${name}.`);
}

export async function moveMealTime(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data } = await supabase.from("meal_times").select("id, sort_order").order("sort_order").order("name");
  const list = data ?? [];
  const i = list.findIndex((t) => t.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) backQuietly(formData);
  const reordered = [...list];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [n, t] of reordered.entries()) await supabase.from("meal_times").update({ sort_order: n + 1 }).eq("id", t.id);
  refresh();
  backQuietly(formData);
}

export async function removeMealTime(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { count } = await supabase.from("meal_times").select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) back(formData, "error", "Keep at least one meal time.");
  const { error } = await supabase.from("meal_times").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Removed ${text(formData, "name")} and its planned meals.`);
}

/** Saves the preset grid: one category (or none) per weekday and meal time. */
export async function savePresets(formData: FormData) {
  const household = await requireHousehold();
  const supabase = await createClient();
  const rows: { household_id: string; weekday: number; meal_time_id: string; category_id: string }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^preset\|([0-6])\|([0-9a-f-]{36})$/.exec(key);
    if (m && typeof value === "string" && value) rows.push({ household_id: household.id, weekday: Number(m[1]), meal_time_id: m[2], category_id: value });
  }
  const { data: before } = await supabase.from("meal_presets").select("weekday, meal_time_id, category_id");
  await supabase.from("meal_presets").delete().eq("household_id", household.id);
  if (rows.length) {
    const { error } = await supabase.from("meal_presets").insert(rows);
    if (error) back(formData, "error", error.message);
  }
  // New presets join weeks that were already filled in.
  const had = new Set((before ?? []).map((p) => `${p.weekday}|${p.meal_time_id}|${p.category_id}`));
  if (rows.some((r) => !had.has(`${r.weekday}|${r.meal_time_id}|${r.category_id}`))) {
    const today = localDateOf(new Date(), household.settings.timeZone);
    const dates = await seededDatesFrom(supabase, today);
    // Only the new presets: a removed one shouldn't come back either.
    await supabase.from("meal_presets").delete().eq("household_id", household.id);
    const fresh = rows.filter((r) => !had.has(`${r.weekday}|${r.meal_time_id}|${r.category_id}`));
    await supabase.from("meal_presets").insert(fresh);
    await applyPresets(supabase, household.id, dates);
    await supabase.from("meal_presets").delete().eq("household_id", household.id);
    await supabase.from("meal_presets").insert(rows);
  }
  refresh();
  back(formData, "message", "Presets saved.");
}

export async function addWeeklyBuy(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  if (!name) back(formData, "error", "What do you buy every week?");
  const every = wholeNumber(text(formData, "everyWeeks") || "1", 1, 12);
  if (!every) back(formData, "error", "Every 1 to 12 weeks.");
  const supabase = await createClient();
  const itemId = await findOrCreateItem(supabase, household.id, name);
  const { error } = await supabase.from("weekly_buys").insert({
    household_id: household.id,
    item_id: itemId,
    amount: positive(text(formData, "amount")),
    unit: text(formData, "unit").slice(0, 20) || null,
    every_weeks: every,
  });
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Added ${name} to the weekly buys.`);
}

export async function removeWeeklyBuy(formData: FormData) {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("weekly_buys").delete().eq("id", text(formData, "id"));
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Removed.");
}

export async function setItemAisle(formData: FormData) {
  await requireHousehold();
  const aisle = text(formData, "aisle");
  if (!aisle) back(formData, "error", "Pick an aisle.");
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ aisle: aisle.slice(0, 30) }).eq("id", text(formData, "id"));
  if (error) back(formData, "error", error.message);
  refresh();
  backQuietly(formData);
}

// ---------------------------------------------------------------------------
// Groceries
// ---------------------------------------------------------------------------

/** Rebuilds the week's suggestions: meal ingredients, weekly buys and low backup parts. */
export async function buildGroceries(formData: FormData) {
  const household = await requireHousehold();
  const week = text(formData, "week");
  if (!isLocalDate(week)) back(formData, "error", "Pick a week.");
  const { buildSuggestions } = await import("./groceries-build");
  const result = await buildSuggestions(household, week);
  refresh();
  back(
    formData,
    "message",
    result.count === 0 ? "Nothing new to suggest for this week." : `${result.count} things to check. Untick what you have, then approve.`,
  );
}

/** Approves the ticked suggestions onto the list and drops the rest. */
export async function approveGroceries(formData: FormData) {
  const household = await requireHousehold();
  const week = text(formData, "week");
  const keep = new Set(formData.getAll("keep").map(String));
  const supabase = await createClient();
  const { data: suggested } = await supabase.from("shopping_list").select("id, item_id, source").eq("status", "suggested");
  const approve = (suggested ?? []).filter((s) => keep.has(s.id)).map((s) => s.id);
  const drop = (suggested ?? []).filter((s) => !keep.has(s.id)).map((s) => s.id);
  if (approve.length) await supabase.from("shopping_list").update({ status: "approved" }).in("id", approve);
  if (drop.length) await supabase.from("shopping_list").delete().in("id", drop);
  // Weekly buys that went on the list remember the week.
  const weeklyItems = (suggested ?? []).filter((s) => s.source === "weekly" && keep.has(s.id)).map((s) => s.item_id);
  if (weeklyItems.length && isLocalDate(week)) await supabase.from("weekly_buys").update({ last_week: week }).in("item_id", weeklyItems);
  await log(household.id, "groceries_approved", "shopping_list", household.id, { count: String(approve.length) });
  refresh();
  back(formData, "message", `${approve.length} thing${approve.length === 1 ? "" : "s"} on the list.`, { review: null });
}

/** Ticks a grocery line off (or back on). A backup part goes back into its count. */
export async function toggleGrocery(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { data: line, error } = await supabase.from("shopping_list").select("id, checked, amount, backup_part_id").eq("id", id).single();
  if (error) back(formData, "error", error.message);
  const checked = !line.checked;
  await supabase.from("shopping_list").update({ checked, checked_at: checked ? new Date().toISOString() : null }).eq("id", id);
  if (line.backup_part_id) {
    const { data: part } = await supabase.from("backup_parts").select("on_hand").eq("id", line.backup_part_id).maybeSingle();
    if (part) {
      const delta = Number(line.amount ?? 1) * (checked ? 1 : -1);
      await supabase.from("backup_parts").update({ on_hand: Math.max(0, Number(part.on_hand) + delta) }).eq("id", line.backup_part_id);
    }
  }
  refresh();
  backQuietly(formData);
}

export async function clearTicked(formData: FormData) {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_list").delete().eq("status", "approved").eq("checked", true);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Cleared the ticked things.");
}

/** Adds something by hand. You're adding it yourself, so it goes straight on the list. */
export async function addGrocery(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  if (!name) back(formData, "error", "What do you need?");
  const supabase = await createClient();
  const itemId = await findOrCreateItem(supabase, household.id, name);
  const week = weekStartOf(localDateOf(new Date(), household.settings.timeZone), household.settings.weekStartsOn);
  const { error } = await supabase.from("shopping_list").insert({
    household_id: household.id,
    item_id: itemId,
    amount: positive(text(formData, "amount")),
    unit: text(formData, "unit").slice(0, 20) || null,
    source: "manual",
    week_of: week,
    status: "approved",
  });
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Added ${name}.`);
}

export async function removeGrocery(formData: FormData) {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_list").delete().eq("id", text(formData, "id"));
  if (error) back(formData, "error", error.message);
  refresh();
  backQuietly(formData);
}

// ---------------------------------------------------------------------------
// Backup meals
// ---------------------------------------------------------------------------

type PartRow = { name?: unknown; uses?: unknown; onHand?: unknown; keep?: unknown };

/** Saves a backup meal's parts (sent as JSON). */
export async function saveBackupParts(formData: FormData) {
  const household = await requireHousehold();
  const recipeId = text(formData, "recipeId");
  let rows: PartRow[];
  try {
    rows = JSON.parse(text(formData, "parts") || "[]") as PartRow[];
  } catch {
    back(formData, "error", "Couldn't read the parts. Try again.");
  }
  const supabase = await createClient();
  const clean = [];
  for (const r of rows.slice(0, 12)) {
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    const num = (v: unknown, fallback: number, min: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= 9999 ? n : fallback;
    };
    clean.push({
      household_id: household.id,
      recipe_id: recipeId,
      item_id: await findOrCreateItem(supabase, household.id, name),
      uses: num(r.uses, 1, 0.01),
      on_hand: num(r.onHand, 0, 0),
      keep_at_least: num(r.keep, 1, 0),
      position: clean.length,
    });
  }
  await supabase.from("backup_parts").delete().eq("recipe_id", recipeId);
  if (clean.length) {
    const { error } = await supabase.from("backup_parts").insert(clean);
    if (error) back(formData, "error", error.message);
  }
  const name = text(formData, "name");
  if (name) await supabase.from("recipes").update({ name: name.slice(0, 80), icon: readIcon(formData), is_backup: true }).eq("id", recipeId);
  refresh();
  back(formData, "message", "Backup meal saved.", { edit: null });
}

/** The − and + on a part's "have" count. */
export async function adjustOnHand(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const delta = Number(text(formData, "delta"));
  const supabase = await createClient();
  const { data: part, error } = await supabase.from("backup_parts").select("on_hand").eq("id", id).single();
  if (error) back(formData, "error", error.message);
  await supabase.from("backup_parts").update({ on_hand: Math.max(0, Number(part.on_hand) + (Number.isFinite(delta) ? delta : 0)) }).eq("id", id);
  refresh();
  backQuietly(formData);
}

/**
 * Swaps a planned meal for a backup meal: the backup takes its place, the
 * original is kept as "swapped" (and can move to the next free night), its
 * fresh ingredients become a must-do to put away, the backup's parts count
 * down, and parts below their minimum are suggested for the grocery list.
 */
export async function swapMeal(formData: FormData) {
  const household = await requireHousehold();
  const mealId = text(formData, "mealId");
  const backupId = text(formData, "backupId");
  const moveIt = formData.get("move") === "on";
  const supabase = await createClient();
  const { data: meal, error } = await supabase
    .from("meals")
    .select("id, date, meal_time_id, category_id, recipe_id, servings, meal_members(member_id), recipes(name)")
    .eq("id", mealId)
    .single();
  if (error) back(formData, "error", error.message);
  const { data: backup } = await supabase.from("recipes").select("id, name, icon").eq("id", backupId).single();
  if (!backup) back(formData, "error", "Pick a backup meal.");

  // The backup takes the meal's place, for the same people.
  const { data: added, error: addError } = await supabase
    .from("meals")
    .insert({ household_id: household.id, date: meal.date, meal_time_id: meal.meal_time_id, recipe_id: backup.id, sort_order: 0 })
    .select("id")
    .single();
  if (addError) back(formData, "error", addError.message);
  const people = (meal.meal_members ?? []).map((m) => m.member_id);
  if (people.length) await supabase.from("meal_members").insert(people.map((member_id) => ({ meal_id: added.id, member_id, household_id: household.id })));
  await supabase.from("meals").update({ status: "swapped", swapped_for_id: added.id }).eq("id", mealId);
  await supabase.from("task_instances").delete().eq("meal_id", mealId).eq("status", "open").eq("must_do", false);

  const originalName = (meal.recipes as unknown as { name: string } | null)?.name ?? "the planned meal";

  // Fresh ingredients to put away tonight.
  if (meal.recipe_id) {
    const { data: fresh } = await supabase
      .from("recipe_ingredients")
      .select("items(name)")
      .eq("recipe_id", meal.recipe_id)
      .eq("put_away_if_skipped", true);
    const { data: list } = await supabase.from("task_lists").select("id").order("sort_order").limit(1).maybeSingle();
    if (list && fresh && fresh.length) {
      await supabase.from("task_instances").insert(
        fresh.map((f) => ({
          household_id: household.id,
          list_id: list.id,
          meal_id: mealId,
          must_do: true,
          title: `Put the ${(f.items as unknown as { name: string }).name.toLowerCase()} away`.slice(0, 120),
          icon: "🧊",
          due_date: meal.date,
        })),
      );
    }
  }

  // Move the original to the next free night, if asked.
  let movedTo: LocalDate | null = null;
  if (moveIt && (meal.recipe_id || meal.category_id)) {
    movedTo = await nextFreeDate(supabase, meal.date, meal.meal_time_id);
    const { data: copy } = await supabase
      .from("meals")
      .insert({
        household_id: household.id,
        date: movedTo,
        meal_time_id: meal.meal_time_id,
        category_id: meal.category_id,
        recipe_id: meal.recipe_id,
        servings: meal.servings,
      })
      .select("id")
      .single();
    if (copy && people.length) await supabase.from("meal_members").insert(people.map((member_id) => ({ meal_id: copy.id, member_id, household_id: household.id })));
    if (copy) await syncHeadsUps(household.id, copy.id, household.settings.timeZone);
  }

  // Count the backup's parts down, and suggest any that ran low.
  const { data: parts } = await supabase.from("backup_parts").select("id, item_id, uses, on_hand, keep_at_least").eq("recipe_id", backup.id);
  const week = weekStartOf(meal.date, household.settings.weekStartsOn);
  for (const p of parts ?? []) {
    const left = Math.max(0, Number(p.on_hand) - Number(p.uses));
    await supabase.from("backup_parts").update({ on_hand: left }).eq("id", p.id);
    if (left < Number(p.keep_at_least)) {
      const { count } = await supabase.from("shopping_list").select("id", { count: "exact", head: true }).eq("backup_part_id", p.id).eq("checked", false);
      if (!count) {
        await supabase.from("shopping_list").insert({
          household_id: household.id,
          item_id: p.item_id,
          amount: Math.ceil(Number(p.keep_at_least) - left),
          source: "backup",
          detail: `Restock ${backup.name}`,
          backup_part_id: p.id,
          week_of: week,
          status: "suggested",
        });
      }
    }
  }
  await log(household.id, "meal_swapped", "meal", mealId, { backup: backup.name });
  refresh();
  const { locale, timeZone } = household.settings;
  const movedDay = movedTo ? new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(zonedToUtc(movedTo, "12:00", timeZone)) : null;
  back(
    formData,
    "message",
    `Swapped to ${backup.name}.${movedDay ? ` ${originalName} moved to ${movedDay}.` : ""} Check the to-do list for anything to put away.`,
    { swap: null, meal: null },
  );
}

// ---------------------------------------------------------------------------
// Energy modes
// ---------------------------------------------------------------------------

export async function setEnergyMode(formData: FormData) {
  const household = await requireHousehold();
  const date = text(formData, "date");
  const mode = text(formData, "mode");
  if (!isLocalDate(date) || !["normal", "low", "survival"].includes(mode)) back(formData, "error", "Pick a mode.");
  const supabase = await createClient();
  const { error } = await supabase.from("days").upsert({ household_id: household.id, date, energy_mode: mode }, { onConflict: "household_id,date" });
  if (error) back(formData, "error", error.message);
  await log(household.id, "energy_mode_set", "day", household.id, { date, mode });
  refresh();
  const words = { normal: "Normal day.", low: "Low day: just the lighter things.", survival: "Survival day: only the essentials." } as const;
  back(formData, "message", words[mode as keyof typeof words]);
}
