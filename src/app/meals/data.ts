import { createClient } from "@/lib/supabase/server";
import { addDays, type LocalDate } from "@/lib/time";

/*
 * Reading Meals from the database. Writing lives in actions.ts.
 */

export type EnergyMode = "normal" | "survival";

export type MealTime = { id: string; name: string; icon: string | null; usual_time: string; show_on_planner: boolean; sort_order: number };
export type MealCategory = {
  id: string;
  name: string;
  icon: string | null;
  meal_time_ids: string[];
  active: boolean;
  visibility: string;
  sort_order: number;
};
export type MealTag = { id: string; name: string; icon: string | null };
export type Recipe = {
  id: string;
  name: string;
  icon: string | null;
  serves: number;
  hands_on_minutes: number | null;
  total_minutes: number | null;
  is_backup: boolean;
  notes: string | null;
  source_url: string | null;
  last_cooked_on: LocalDate | null;
  visibility: string;
  category_ids: string[];
  tag_ids: string[];
};
export type Meal = {
  id: string;
  date: LocalDate;
  meal_time_id: string;
  category_id: string | null;
  recipe_id: string | null;
  servings: number | null;
  status: "planned" | "cooked" | "swapped" | "skipped";
  swapped_for_id: string | null;
  from_preset: boolean;
  /** Who it's for; empty means everyone. */
  member_ids: string[];
};
export type Preset = { id: string; weekday: number; meal_time_id: string; category_id: string };
export type MealMember = { id: string; name: string; colour: string; icon: string | null };

export type Item = { id: string; name: string; icon: string | null; aisle: string };
export type Ingredient = {
  id: string;
  recipe_id: string;
  item_id: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  put_away_if_skipped: boolean;
  position: number;
};
export type StepHelper = {
  id: string;
  step_id: string;
  kind: "timer" | "heads_up" | "oven" | "doneness";
  minutes: number | null;
  temperature: number | null;
  label: string | null;
};
export type Step = { id: string; recipe_id: string; position: number; text: string; helpers: StepHelper[] };
export type BackupPart = {
  id: string;
  recipe_id: string;
  item_id: string;
  uses: number;
  on_hand: number;
  keep_at_least: number;
  position: number;
};

const RECIPE_COLUMNS = "id, name, icon, serves, hands_on_minutes, total_minutes, is_backup, notes, source_url, last_cooked_on, visibility";

/** Meal times, categories, variants, tags and the family: what every Meals screen needs. */
export async function loadMealBasics() {
  const supabase = await createClient();
  const [times, categories, recipes, links, tags, recipeTags, members] = await Promise.all([
    supabase.from("meal_times").select("id, name, icon, usual_time, show_on_planner, sort_order").order("sort_order").order("name"),
    supabase.from("meal_categories").select("id, name, icon, meal_time_ids, active, visibility, sort_order").order("sort_order").order("name"),
    supabase.from("recipes").select(RECIPE_COLUMNS).order("name"),
    supabase.from("recipe_categories").select("recipe_id, category_id"),
    supabase.from("meal_tags").select("id, name, icon").order("sort_order").order("name"),
    supabase.from("recipe_tags").select("recipe_id, tag_id"),
    supabase.from("members").select("id, name, colour, icon").order("sort_order").order("name"),
  ]);
  for (const r of [times, categories, recipes, links, tags, recipeTags, members]) if (r.error) throw r.error;

  const catsOf = new Map<string, string[]>();
  for (const l of links.data ?? []) catsOf.set(l.recipe_id, [...(catsOf.get(l.recipe_id) ?? []), l.category_id]);
  const tagsOf = new Map<string, string[]>();
  for (const l of recipeTags.data ?? []) tagsOf.set(l.recipe_id, [...(tagsOf.get(l.recipe_id) ?? []), l.tag_id]);

  return {
    mealTimes: (times.data ?? []).map((t) => ({ ...t, usual_time: t.usual_time.slice(0, 5) })) as MealTime[],
    categories: (categories.data ?? []) as MealCategory[],
    recipes: (recipes.data ?? []).map((r) => ({
      ...r,
      category_ids: catsOf.get(r.id) ?? [],
      tag_ids: tagsOf.get(r.id) ?? [],
    })) as Recipe[],
    tags: (tags.data ?? []) as MealTag[],
    members: (members.data ?? []) as MealMember[],
  };
}

export type MealBasics = Awaited<ReturnType<typeof loadMealBasics>>;

/** The planned meals between two dates (inclusive), with who each is for. */
export async function loadMeals(from: LocalDate, to: LocalDate): Promise<Meal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("id, date, meal_time_id, category_id, recipe_id, servings, status, swapped_for_id, from_preset, sort_order, meal_members(member_id)")
    .gte("date", from)
    .lte("date", to)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    date: m.date,
    meal_time_id: m.meal_time_id,
    category_id: m.category_id,
    recipe_id: m.recipe_id,
    servings: m.servings,
    status: m.status as Meal["status"],
    swapped_for_id: m.swapped_for_id,
    from_preset: m.from_preset,
    member_ids: (m.meal_members ?? []).map((x) => x.member_id),
  }));
}

export async function loadPresets(): Promise<Preset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("meal_presets").select("id, weekday, meal_time_id, category_id");
  if (error) throw error;
  return data ?? [];
}

/** A recipe's ingredients (with their items), steps and helpers. */
export async function loadRecipeDetail(recipeId: string) {
  const supabase = await createClient();
  const [ingredients, steps, helpers] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, item_id, amount, unit, note, put_away_if_skipped, position, items(id, name, icon, aisle)")
      .eq("recipe_id", recipeId)
      .order("position"),
    supabase.from("recipe_steps").select("id, recipe_id, position, text").eq("recipe_id", recipeId).order("position"),
    supabase.from("step_helpers").select("id, step_id, kind, minutes, temperature, label, recipe_steps!inner(recipe_id)").eq("recipe_steps.recipe_id", recipeId),
  ]);
  for (const r of [ingredients, steps, helpers]) if (r.error) throw r.error;
  const helpersOf = new Map<string, StepHelper[]>();
  for (const h of helpers.data ?? []) {
    const helper: StepHelper = { id: h.id, step_id: h.step_id, kind: h.kind as StepHelper["kind"], minutes: h.minutes, temperature: h.temperature, label: h.label };
    helpersOf.set(h.step_id, [...(helpersOf.get(h.step_id) ?? []), helper]);
  }
  return {
    ingredients: (ingredients.data ?? []).map(({ items, ...i }) => ({ ...i, amount: i.amount === null ? null : Number(i.amount), item: items as unknown as Item })),
    steps: (steps.data ?? []).map((s) => ({ ...s, helpers: helpersOf.get(s.id) ?? [] })) as Step[],
  };
}

export type RecipeDetail = Awaited<ReturnType<typeof loadRecipeDetail>>;

export async function loadItems(): Promise<Item[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("items").select("id, name, icon, aisle").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function loadBackupParts(): Promise<BackupPart[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("backup_parts").select("id, recipe_id, item_id, uses, on_hand, keep_at_least, position").order("position");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, uses: Number(p.uses), on_hand: Number(p.on_hand), keep_at_least: Number(p.keep_at_least) }));
}

/** How many times a backup meal can be made from the parts on hand. */
export function readyCount(parts: BackupPart[]): number {
  if (parts.length === 0) return 0;
  return Math.min(...parts.map((p) => Math.floor(p.on_hand / p.uses + 1e-9)));
}

/** A day's energy mode (normal if nobody set it). */
export async function energyModeOn(date: LocalDate): Promise<EnergyMode> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("days").select("energy_mode").eq("date", date).maybeSingle();
  if (error) throw error;
  return data?.energy_mode === "survival" ? "survival" : "normal";
}

/** Energy modes for a run of days. */
export async function energyModes(from: LocalDate, days: number): Promise<Map<LocalDate, EnergyMode>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("days").select("date, energy_mode").gte("date", from).lte("date", addDays(from, days - 1));
  if (error) throw error;
  return new Map((data ?? []).map((d) => [d.date, d.energy_mode as EnergyMode]));
}

/** What a meal is called: its variant, or its category while it's undecided. */
export function mealName(meal: Meal, recipes: Map<string, Recipe>, categories: Map<string, MealCategory>): string {
  if (meal.recipe_id) return recipes.get(meal.recipe_id)?.name ?? "Meal";
  return categories.get(meal.category_id ?? "")?.name ?? "Meal";
}

/** Its picture: the variant's, else the category's. */
export function mealIcon(meal: Meal, recipes: Map<string, Recipe>, categories: Map<string, MealCategory>): string {
  const recipe = meal.recipe_id ? recipes.get(meal.recipe_id) : undefined;
  const category = meal.category_id ? categories.get(meal.category_id) : undefined;
  return recipe?.icon ?? category?.icon ?? "🍽️";
}
