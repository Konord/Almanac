import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { loadRecipeDetail } from "../../data";
import { CookingMode } from "../cooking-mode";

/**
 * Cooking mode for one planned meal: the whole screen, no rail, made to
 * be read from across the kitchen.
 */
export default function CookPage(props: PageProps<"/meals/cook/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-2xl text-ink-muted">Getting the recipe…</p>}>
      <Cook params={props.params} />
    </Suspense>
  );
}

async function Cook({ params }: { params: PageProps<"/meals/cook/[id]">["params"] }) {
  const { id } = await params;
  const household = await requireHousehold();
  const supabase = await createClient();
  const { data: meal, error } = await supabase
    .from("meals")
    .select("id, recipe_id, menu_meals(name), meal_dishes(position, recipe_id, batches, recipes(id, name, icon, notes))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!meal) notFound();
  type DishRow = { position: number; recipe_id: string | null; batches: number; recipes: { id: string; name: string; icon: string | null; notes: string | null } | null };
  let rows = ((meal.meal_dishes ?? []) as unknown as DishRow[]).filter((d) => d.recipes).toSorted((a, b) => a.position - b.position);
  if (rows.length === 0) {
    // An older meal with no dishes of its own: cook its recipe.
    if (!meal.recipe_id) notFound();
    const { data: recipe } = await supabase.from("recipes").select("id, name, icon, notes").eq("id", meal.recipe_id).maybeSingle();
    if (!recipe) notFound();
    rows = [{ position: 0, recipe_id: recipe.id, batches: 1, recipes: recipe }];
  }
  const [details, { data: lunch }] = await Promise.all([
    Promise.all(rows.map((d) => loadRecipeDetail(d.recipes!.id))),
    supabase.from("meal_times").select("id").ilike("name", "lunch").limit(1).maybeSingle(),
  ]);
  const menuName = (meal.menu_meals as unknown as { name: string | null } | null)?.name;

  return (
    <CookingMode
      mealId={meal.id}
      title={menuName || rows[0].recipes!.name}
      temperatureUnit={household.settings.temperatureUnit}
      measures={household.settings.measures}
      canPlanLeftovers={Boolean(lunch)}
      dishes={rows.map((d, i) => ({
        recipeId: d.recipes!.id,
        name: d.recipes!.name,
        icon: d.recipes!.icon,
        notes: d.recipes!.notes,
        batches: d.batches,
        ingredients: details[i].ingredients.map((ing) => ({ id: ing.id, name: ing.item.name, icon: ing.item.icon, amount: ing.amount, unit: ing.unit, note: ing.note })),
        steps: details[i].steps.map((s) => ({
          id: s.id,
          text: s.text,
          helpers: s.helpers.map((h) => ({ kind: h.kind, minutes: h.minutes, temperature: h.temperature, label: h.label })),
        })),
      }))}
    />
  );
}
