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
  /** What it can fill in a meal: Main, Starch, Veggie… */
  kind_ids: string[];
};
export type DishKind = { id: string; name: string; icon: string | null; sort_order: number };
/** A spot in a meal on the menu: a set dish, or one you pick (from a kind). */
export type MenuSpot = { id: string; position: number; kind_id: string | null; recipe_id: string | null; batches: number };
/** A meal on the menu ("Pork chops + Mashed potatoes + Veggie"). */
export type MenuMeal = {
  id: string;
  /** Blank: called after its first dish. */
  name: string | null;
  icon: string | null;
  visibility: string;
  sort_order: number;
  category_ids: string[];
  spots: MenuSpot[];
};
/** A dish on a planned meal, for that day only. */
export type MealDish = { id: string; position: number; kind_id: string | null; recipe_id: string | null; batches: number; spot_position: number | null };
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
  /** Who's cooking it; null means not decided. */
  cook_id: string | null;
  /** The menu meal it came from (null: a custom meal, or an old one). */
  menu_meal_id: string | null;
  /** Its own name from the menu ("Steak and baked potatoes"), if it has one. */
  menu_name: string | null;
  menu_icon: string | null;
  dishes: MealDish[];
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
  const [times, categories, recipes, links, tags, recipeTags, members, kinds, recipeKinds, menuMeals, spots, menuLinks] = await Promise.all([
    supabase.from("meal_times").select("id, name, icon, usual_time, show_on_planner, sort_order").order("sort_order").order("name"),
    supabase.from("meal_categories").select("id, name, icon, meal_time_ids, active, visibility, sort_order").order("sort_order").order("name"),
    supabase.from("recipes").select(RECIPE_COLUMNS).order("name"),
    supabase.from("recipe_categories").select("recipe_id, category_id"),
    supabase.from("meal_tags").select("id, name, icon").order("sort_order").order("name"),
    supabase.from("recipe_tags").select("recipe_id, tag_id"),
    supabase.from("members").select("id, name, colour, icon").order("sort_order").order("name"),
    supabase.from("dish_kinds").select("id, name, icon, sort_order").order("sort_order").order("name"),
    supabase.from("recipe_kinds").select("recipe_id, kind_id"),
    supabase.from("menu_meals").select("id, name, icon, visibility, sort_order").order("sort_order").order("created_at"),
    supabase.from("menu_meal_spots").select("id, menu_meal_id, position, kind_id, recipe_id, batches").order("position"),
    supabase.from("menu_meal_categories").select("menu_meal_id, category_id"),
  ]);
  for (const r of [times, categories, recipes, links, tags, recipeTags, members, kinds, recipeKinds, menuMeals, spots, menuLinks]) if (r.error) throw r.error;

  const catsOf = new Map<string, string[]>();
  for (const l of links.data ?? []) catsOf.set(l.recipe_id, [...(catsOf.get(l.recipe_id) ?? []), l.category_id]);
  const tagsOf = new Map<string, string[]>();
  for (const l of recipeTags.data ?? []) tagsOf.set(l.recipe_id, [...(tagsOf.get(l.recipe_id) ?? []), l.tag_id]);
  const kindsOf = new Map<string, string[]>();
  for (const l of recipeKinds.data ?? []) kindsOf.set(l.recipe_id, [...(kindsOf.get(l.recipe_id) ?? []), l.kind_id]);
  const spotsOf = new Map<string, MenuSpot[]>();
  for (const sp of spots.data ?? []) spotsOf.set(sp.menu_meal_id, [...(spotsOf.get(sp.menu_meal_id) ?? []), { id: sp.id, position: sp.position, kind_id: sp.kind_id, recipe_id: sp.recipe_id, batches: sp.batches }]);
  const menuCatsOf = new Map<string, string[]>();
  for (const l of menuLinks.data ?? []) menuCatsOf.set(l.menu_meal_id, [...(menuCatsOf.get(l.menu_meal_id) ?? []), l.category_id]);

  return {
    mealTimes: (times.data ?? []).map((t) => ({ ...t, usual_time: t.usual_time.slice(0, 5) })) as MealTime[],
    categories: (categories.data ?? []) as MealCategory[],
    recipes: (recipes.data ?? []).map((r) => ({
      ...r,
      category_ids: catsOf.get(r.id) ?? [],
      tag_ids: tagsOf.get(r.id) ?? [],
      kind_ids: kindsOf.get(r.id) ?? [],
    })) as Recipe[],
    tags: (tags.data ?? []) as MealTag[],
    members: (members.data ?? []) as MealMember[],
    kinds: (kinds.data ?? []) as DishKind[],
    menuMeals: (menuMeals.data ?? [])
      .map((m) => ({ ...m, category_ids: menuCatsOf.get(m.id) ?? [], spots: spotsOf.get(m.id) ?? [] }))
      .filter((m) => m.spots.length > 0) as MenuMeal[],
  };
}

export type MealBasics = Awaited<ReturnType<typeof loadMealBasics>>;

/** The planned meals between two dates (inclusive), with who each is for. */
export async function loadMeals(from: LocalDate, to: LocalDate): Promise<Meal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select(
      "id, date, meal_time_id, category_id, recipe_id, servings, status, swapped_for_id, from_preset, sort_order, cook_id, menu_meal_id, meal_members(member_id), menu_meals(name, icon), meal_dishes(id, position, kind_id, recipe_id, batches, spot_position)",
    )
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
    cook_id: m.cook_id,
    member_ids: (m.meal_members ?? []).map((x) => x.member_id),
    menu_meal_id: m.menu_meal_id,
    menu_name: (m.menu_meals as { name: string | null } | null)?.name ?? null,
    menu_icon: (m.menu_meals as { icon: string | null } | null)?.icon ?? null,
    dishes: (m.meal_dishes ?? []).toSorted((a, b) => a.position - b.position),
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

/** What a meal is called: the menu meal's own name, else its first dish, else its kind while it's undecided. */
export function mealName(meal: Meal, recipes: Map<string, Recipe>, categories: Map<string, MealCategory>): string {
  if (meal.menu_name) return meal.menu_name;
  if (meal.recipe_id) return recipes.get(meal.recipe_id)?.name ?? "Meal";
  return categories.get(meal.category_id ?? "")?.name ?? "Meal";
}

/** Its picture: the menu meal's, the first dish's, else the category's. */
export function mealIcon(meal: Meal, recipes: Map<string, Recipe>, categories: Map<string, MealCategory>): string {
  const recipe = meal.recipe_id ? recipes.get(meal.recipe_id) : undefined;
  const category = meal.category_id ? categories.get(meal.category_id) : undefined;
  return meal.menu_icon ?? recipe?.icon ?? category?.icon ?? "🍽️";
}
