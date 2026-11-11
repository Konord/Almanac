"use server";

import { skipChoreNow } from "../chores/skip";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { guessAisle, weekStartOf } from "@/lib/meals";
import { parseRecipeHtml, parseRecipeText, type ImportedRecipe } from "@/lib/recipe-import";
import { addDays, isLocalDate, isLocalTime, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { findOrCreateItem, nextFreeDate, syncHeadsUps } from "./shared";

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
// The meal card: people, remove, cooked
// ---------------------------------------------------------------------------

/** Who a meal is for (everyone ticked, or nobody, means everyone), and who cooks it. */
export async function setMealPeople(formData: FormData) {
  const household = await requireHousehold();
  const mealId = text(formData, "mealId");
  const chosen = formData.getAll("memberIds").map(String).filter(Boolean);
  const supabase = await createClient();
  // Who's cooking (or nobody yet): they get the prep time on their timeline.
  if (formData.has("cookId")) {
    const { error: cookError } = await supabase.from("meals").update({ cook_id: text(formData, "cookId") || null }).eq("id", mealId);
    if (cookError) back(formData, "error", cookError.message);
    await syncHeadsUps(household.id, mealId, household.settings.timeZone);
  }
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true });
  await supabase.from("meal_members").delete().eq("meal_id", mealId);
  if (chosen.length > 0 && chosen.length < (count ?? 0)) {
    const { error } = await supabase.from("meal_members").insert(chosen.map((member_id) => ({ meal_id: mealId, member_id, household_id: household.id })));
    if (error) back(formData, "error", error.message);
  }
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

/**
 * A meal dragged on the calendar: this one meal moves to another time (or
 * day). Its meal block's usual time stays the same (Connor, 2026-11-11).
 */
export async function moveMealThisDay(input: { mealId: string; date: string; time: string }): Promise<{ error?: string }> {
  const household = await requireHousehold();
  if (!isLocalDate(input.date) || !isLocalTime(input.time)) return { error: "That time didn't work. Try again." };
  const supabase = await createClient();
  const { data: meal, error } = await supabase.from("meals").update({ date: input.date, eat_at: input.time }).eq("id", input.mealId).select("id, status").maybeSingle();
  if (error) return { error: error.message };
  if (!meal) return { error: "That meal isn't on the plan any more." };
  await syncHeadsUps(household.id, meal.id, household.settings.timeZone);
  await log(household.id, "meal_moved", "meal", meal.id, { date: input.date, time: input.time });
  revalidatePath("/", "layout");
  return {};
}

/** Finished cooking: remember it, and plan any leftovers for tomorrow's lunch. */
export async function markCooked(formData: FormData) {
  const household = await requireHousehold();
  const mealId = text(formData, "mealId");
  const leftovers = text(formData, "leftovers") === "lunch";
  const supabase = await createClient();
  const { data: meal, error } = await supabase.from("meals").update({ status: "cooked" }).eq("id", mealId).select("id, date, recipe_id").single();
  if (error) back(formData, "error", error.message);
  const { data: dishes } = await supabase.from("meal_dishes").select("position, kind_id, recipe_id, batches, spot_position").eq("meal_id", mealId).order("position");
  const cooked = [...new Set([meal.recipe_id, ...(dishes ?? []).map((d) => d.recipe_id)].filter((r): r is string => Boolean(r)))];
  if (cooked.length) await supabase.from("recipes").update({ last_cooked_on: meal.date }).in("id", cooked);
  if (leftovers && meal.recipe_id) {
    const { data: lunch } = await supabase.from("meal_times").select("id").ilike("name", "lunch").limit(1).maybeSingle();
    const { data: cat } = await supabase.from("meal_categories").select("id").eq("is_leftovers", true).maybeSingle();
    if (lunch && cat) {
      // Leftovers are a blank: no dishes, so no cooking and nothing to shop for.
      await supabase.from("meals").insert({
        household_id: household.id,
        date: addDays(meal.date, 1),
        meal_time_id: lunch.id,
        category_id: cat.id,
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

/**
 * A one-dish meal on the menu for a new dish ("Beef tacos" under Tacos), so
 * it shows in the weekly review. categoryId "none" puts it under no kind.
 */
async function makeDishMeal(householdId: string, recipeId: string, categoryId: string | null) {
  const supabase = await createClient();
  const { data: meal, error } = await supabase.from("menu_meals").insert({ household_id: householdId, name: null, icon: null }).select("id").single();
  if (error) return error.message;
  const { data: main } = await supabase.from("recipe_kinds").select("kind_id").eq("recipe_id", recipeId).limit(1).maybeSingle();
  const spot = await supabase.from("menu_meal_spots").insert({ household_id: householdId, menu_meal_id: meal.id, position: 0, recipe_id: recipeId, kind_id: main?.kind_id ?? null, batches: 1 });
  if (spot.error) return spot.error.message;
  if (categoryId && categoryId !== "none") {
    const cat = await supabase.from("menu_meal_categories").insert({ household_id: householdId, menu_meal_id: meal.id, category_id: categoryId });
    if (cat.error) return cat.error.message;
  }
  return null;
}

export async function addRecipe(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  const kindId = text(formData, "kindId") || null;
  const mealUnder = text(formData, "meal") || null;
  const backup = text(formData, "backup") === "1";
  if (!name) back(formData, "error", "A dish needs a name.");
  const supabase = await createClient();
  let icon = readIcon(formData);
  if (!icon && kindId) {
    const { data: kind } = await supabase.from("dish_kinds").select("icon").eq("id", kindId).maybeSingle();
    icon = kind?.icon ?? null;
  }
  if (!icon && mealUnder && mealUnder !== "none") {
    const { data: cat } = await supabase.from("meal_categories").select("icon").eq("id", mealUnder).maybeSingle();
    icon = cat?.icon ?? null;
  }
  const { data, error } = await supabase
    .from("recipes")
    .insert({ household_id: household.id, name: name.slice(0, 80), icon, is_backup: backup })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  if (kindId) await supabase.from("recipe_kinds").insert({ recipe_id: data.id, kind_id: kindId, household_id: household.id });
  if (mealUnder && !backup) {
    const problem = await makeDishMeal(household.id, data.id, mealUnder);
    if (problem) back(formData, "error", problem);
  }
  await log(household.id, "recipe_added", "recipe", data.id, { name });
  refresh();
  if (backup) redirect(`/meals/backups?edit=${data.id}`);
  redirect(`/meals/library?${kindId ? `kind=${kindId}&` : ""}recipe=${data.id}&tab=basics`);
}

export type DishSaveResult = { ok: true } | { ok: false; error: string };

type IngredientRow = { amount?: unknown; unit?: unknown; name?: unknown; note?: unknown; putAway?: unknown };
type HelperRow = { kind?: unknown; minutes?: unknown; temperature?: unknown; label?: unknown };
type StepRow = { text?: unknown; helpers?: HelperRow[] };

/**
 * Saves a whole dish at once: its basics, ingredients, steps and notes
 * (Connor, 2026-11-10: one Save for the dish, not one per tab). The dish
 * editor sends everything; nothing is saved unless all of it checks out.
 */
export async function saveDish(formData: FormData): Promise<DishSaveResult> {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const fail = (error: string): DishSaveResult => ({ ok: false, error });

  // Basics
  const name = text(formData, "name");
  if (!name) return fail("A dish needs a name.");
  const serves = wholeNumber(text(formData, "serves") || "4", 1, 50);
  const handsOn = wholeNumber(text(formData, "handsOnMinutes"), 0, 1440);
  const total = wholeNumber(text(formData, "totalMinutes"), 0, 2880);
  if (Number.isNaN(serves) || serves === null) return fail("Serves should be 1 to 50.");
  if (Number.isNaN(handsOn) || Number.isNaN(total)) return fail("Minutes should be whole numbers, like 25.");
  const kindIds = formData.getAll("kindIds").map(String).filter(Boolean);
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  const goesWith = formData.getAll("goesWith").map(String).filter(Boolean);
  // Notes
  const source = text(formData, "sourceUrl");
  if (source && !/^https?:\/\//i.test(source)) return fail("The recipe link should start with https://");
  // Ingredients and steps (JSON from the editor)
  let ingredients: IngredientRow[];
  let stepRows: StepRow[];
  try {
    ingredients = JSON.parse(text(formData, "ingredients") || "[]") as IngredientRow[];
    stepRows = JSON.parse(text(formData, "steps") || "[]") as StepRow[];
  } catch {
    return fail("Couldn't read the ingredients or steps. Try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({
      name: name.slice(0, 80),
      icon: readIcon(formData),
      serves,
      hands_on_minutes: handsOn,
      total_minutes: total,
      notes: text(formData, "notes").slice(0, 4000) || null,
      source_url: source || null,
    })
    .eq("id", id);
  if (error) return fail(error.message);
  await supabase.from("recipe_kinds").delete().eq("recipe_id", id);
  if (kindIds.length) await supabase.from("recipe_kinds").insert(kindIds.map((kind_id) => ({ recipe_id: id, kind_id, household_id: household.id })));
  await supabase.from("recipe_tags").delete().eq("recipe_id", id);
  if (tagIds.length) await supabase.from("recipe_tags").insert(tagIds.map((tag_id) => ({ recipe_id: id, tag_id, household_id: household.id })));
  // Goes with: the kinds of meal this dish is offered first in (Caesar salad with Pasta).
  await supabase.from("recipe_categories").delete().eq("recipe_id", id);
  if (goesWith.length) await supabase.from("recipe_categories").insert(goesWith.map((category_id) => ({ recipe_id: id, category_id, household_id: household.id })));

  // Ingredients: the whole list is replaced.
  const cleanIngredients = [];
  for (const r of ingredients.slice(0, 80)) {
    const itemName = String(r.name ?? "").trim();
    if (!itemName) continue;
    cleanIngredients.push({
      household_id: household.id,
      recipe_id: id,
      item_id: await findOrCreateItem(supabase, household.id, itemName),
      amount: positive(r.amount),
      unit: String(r.unit ?? "").trim().slice(0, 20) || null,
      note: String(r.note ?? "").trim().slice(0, 80) || null,
      put_away_if_skipped: r.putAway === true,
      position: cleanIngredients.length,
    });
  }
  const { error: ingredientsGone } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
  if (ingredientsGone) return fail(ingredientsGone.message);
  if (cleanIngredients.length) {
    const { error: ingredientsError } = await supabase.from("recipe_ingredients").insert(cleanIngredients);
    if (ingredientsError) return fail(ingredientsError.message);
  }

  // Steps, with the helpers you kept: the whole list is replaced.
  const { error: stepsGone } = await supabase.from("recipe_steps").delete().eq("recipe_id", id);
  if (stepsGone) return fail(stepsGone.message);
  const steps = stepRows
    .map((r) => ({ text: String(r.text ?? "").trim().slice(0, 400), helpers: r.helpers ?? [] }))
    .filter((r) => r.text)
    .slice(0, 60);
  if (steps.length) {
    const { data, error: stepsError } = await supabase
      .from("recipe_steps")
      .insert(steps.map((st, i) => ({ household_id: household.id, recipe_id: id, position: i, text: st.text })))
      .select("id, position");
    if (stepsError) return fail(stepsError.message);
    const idAt = new Map(data.map((d) => [d.position, d.id]));
    const helperRows = steps.flatMap((st, i) =>
      st.helpers.flatMap((h) => {
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
      if (helperError) return fail(helperError.message);
    }
  }

  // Heads-ups for meals already planned with this dish.
  const today = localDateOf(new Date(), household.settings.timeZone);
  const { data: planned } = await supabase.from("meals").select("id").eq("recipe_id", id).eq("status", "planned").gte("date", addDays(today, -1));
  for (const m of planned ?? []) await syncHeadsUps(household.id, m.id, household.settings.timeZone);
  await log(household.id, "recipe_saved", "recipe", id, { name });
  refresh();
  return { ok: true };
}

export async function removeRecipe(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  // Meals on the menu that were only this dish go too.
  const [meals, spots] = await Promise.all([supabase.from("menu_meals").select("id"), supabase.from("menu_meal_spots").select("menu_meal_id")]);
  const used = new Set((spots.data ?? []).map((sp) => sp.menu_meal_id));
  const empty = (meals.data ?? []).map((m) => m.id).filter((m) => !used.has(m));
  if (empty.length) await supabase.from("menu_meals").delete().in("id", empty);
  await log(household.id, "recipe_removed", "recipe", id, { name });
  refresh();
  back(formData, "message", `Removed ${name}.`, { recipe: null, tab: null });
}

/**
 * Adds a dish: typed in (just a name), pasted, or read from a web link.
 * Every way makes the dish and opens it in the dish editor to fill in or
 * check over (Connor, 2026-11-11: one way in for every dish).
 */
export async function importRecipe(formData: FormData) {
  const household = await requireHousehold();
  const mode = text(formData, "mode");
  const kindId = text(formData, "kindId") || null;
  const mealUnder = text(formData, "meal") || null;
  let recipe: ImportedRecipe | null = null;
  if (mode === "type") {
    if (!text(formData, "name")) back(formData, "error", "A dish needs a name.");
    recipe = { name: "", serves: null, handsOnMinutes: null, totalMinutes: null, ingredients: [], steps: [], sourceUrl: null };
  } else if (mode === "link") {
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
  if (mealUnder && mealUnder !== "none") {
    const { data: cat } = await supabase.from("meal_categories").select("icon").eq("id", mealUnder).maybeSingle();
    icon = cat?.icon ?? null;
  }
  if (!icon && kindId) {
    const { data: kind } = await supabase.from("dish_kinds").select("icon").eq("id", kindId).maybeSingle();
    icon = kind?.icon ?? null;
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
  if (kindId) await supabase.from("recipe_kinds").insert({ recipe_id: data.id, kind_id: kindId, household_id: household.id });
  if (mealUnder) await makeDishMeal(household.id, data.id, mealUnder);
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
  await log(household.id, mode === "type" ? "recipe_added" : "recipe_imported", "recipe", data.id, { name, from: mode });
  refresh();
  if (mode === "type") redirect(`/meals/library?${kindId ? `kind=${kindId}&` : ""}recipe=${data.id}&tab=basics`);
  redirect(
    `/meals/library?${kindId ? `kind=${kindId}&` : ""}recipe=${data.id}&tab=steps&message=${encodeURIComponent(
      `Brought in ${recipe.ingredients.length} ingredients and ${recipe.steps.length} steps. Check them, and keep the helpers you want.`,
    )}`,
  );
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
  const result = await swapCore(household, text(formData, "mealId"), text(formData, "backupId"), formData.get("move") === "on");
  if ("error" in result) back(formData, "error", result.error);
  refresh();
  const { locale, timeZone } = household.settings;
  const movedDay = result.movedTo ? new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(zonedToUtc(result.movedTo, "12:00", timeZone)) : null;
  back(
    formData,
    "message",
    `Swapped to ${result.backupName}.${movedDay ? ` ${result.originalName} moved to ${movedDay}.` : ""} Check the to-do list for anything to put away.`,
    { swap: null, meal: null },
  );
}

type Household = Awaited<ReturnType<typeof requireHousehold>>;
type SwapResult = { error: string } | { backupName: string; originalName: string; movedTo: LocalDate | null };

/** The swap itself (shared by the Swap card and the Survival button). Not a server action. */
async function swapCore(household: Household, mealId: string, backupId: string, moveIt: boolean): Promise<SwapResult> {
  const supabase = await createClient();
  const { data: meal, error } = await supabase
    .from("meals")
    .select("id, date, meal_time_id, category_id, recipe_id, servings, cook_id, meal_members(member_id), recipes(name)")
    .eq("id", mealId)
    .single();
  if (error) return { error: error.message };
  const { data: backup } = await supabase.from("recipes").select("id, name, icon").eq("id", backupId).eq("is_backup", true).maybeSingle();
  if (!backup) return { error: "Pick a backup meal." };

  // The backup takes the meal's place, for the same people.
  const { data: added, error: addError } = await supabase
    .from("meals")
    .insert({ household_id: household.id, date: meal.date, meal_time_id: meal.meal_time_id, recipe_id: backup.id, cook_id: meal.cook_id, sort_order: 0 })
    .select("id")
    .single();
  if (addError) return { error: addError.message };
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
    const { data: list } = await supabase.from("task_lists").select("id").eq("is_chores", false).eq("is_groceries", false).order("sort_order").limit(1).maybeSingle();
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
    if (copy) {
      // It keeps its dishes (and the menu meal they came from).
      const { data: dishes } = await supabase.from("meal_dishes").select("position, kind_id, recipe_id, batches, spot_position").eq("meal_id", mealId);
      const { data: from } = await supabase.from("meals").select("menu_meal_id").eq("id", mealId).maybeSingle();
      if (from?.menu_meal_id) await supabase.from("meals").update({ menu_meal_id: from.menu_meal_id }).eq("id", copy.id);
      if (dishes?.length) await supabase.from("meal_dishes").insert(dishes.map((d) => ({ ...d, meal_id: copy.id, household_id: household.id })));
      await syncHeadsUps(household.id, copy.id, household.settings.timeZone);
    }
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
  return { backupName: backup.name, originalName, movedTo };
}

// ---------------------------------------------------------------------------
// Energy modes
// ---------------------------------------------------------------------------

/**
 * The Survival button: in one go, swaps the meals you picked for backup
 * meals and skips the chores you ticked, then notes the day as a survival
 * day (for history; it doesn't change anything else on screen). Routines
 * and to-dos are left alone.
 */
export async function survivalRescue(formData: FormData) {
  const household = await requireHousehold();
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();

  const swapped: string[] = [];
  for (const mealId of formData.getAll("mealId").map(String)) {
    const backupId = text(formData, `backup-${mealId}`);
    if (!backupId || backupId === "keep") continue;
    const result = await swapCore(household, mealId, backupId, formData.get(`move-${mealId}`) === "on");
    if ("error" in result) back(formData, "error", result.error);
    swapped.push(result.backupName);
  }

  // Skipped chores leave today's list, like the Skip button on Chores. Essential ones can't be skipped.
  const skips = [...new Set(formData.getAll("skip").map(String).filter(Boolean))];
  if (skips.length) {
    const { data: essential } = await supabase.from("task_templates").select("id").in("id", skips).contains("tags", ["essential"]);
    const keep = new Set((essential ?? []).map((c) => c.id));
    for (const id of skips) if (!keep.has(id)) await skipChoreNow(id, today);
  }

  const { error } = await supabase.from("days").upsert({ household_id: household.id, date: today, energy_mode: "survival" }, { onConflict: "household_id,date" });
  if (error) back(formData, "error", error.message);
  await log(household.id, "survival_day", "day", household.id, { date: today, swapped: swapped.join(", "), skipped: String(skips.length) });
  refresh();

  const said = [
    swapped.length ? `Swapped to ${swapped.join(" and ")}.` : null,
    skips.length ? `Skipped ${skips.length} chore${skips.length === 1 ? "" : "s"}.` : null,
  ].filter(Boolean);
  back(formData, "message", said.length ? `${said.join(" ")} Take it easy.` : "Nothing changed. Take it easy.", { survival: null });
}
