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
    .select("id, date, servings, status, recipe_id, recipes(id, name, icon, serves, notes), meal_times(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!meal || !meal.recipe_id) notFound();
  const recipe = meal.recipes as unknown as { id: string; name: string; icon: string | null; serves: number; notes: string | null };
  const detail = await loadRecipeDetail(recipe.id);
  const { data: lunch } = await supabase.from("meal_times").select("id").ilike("name", "lunch").limit(1).maybeSingle();

  return (
    <CookingMode
      mealId={meal.id}
      name={recipe.name}
      icon={recipe.icon}
      serves={recipe.serves}
      servings={meal.servings ?? recipe.serves}
      notes={recipe.notes}
      temperatureUnit={household.settings.temperatureUnit}
      canPlanLeftovers={Boolean(lunch)}
      ingredients={detail.ingredients.map((i) => ({ id: i.id, name: i.item.name, icon: i.item.icon, amount: i.amount, unit: i.unit, note: i.note }))}
      steps={detail.steps.map((s) => ({
        id: s.id,
        text: s.text,
        helpers: s.helpers.map((h) => ({ kind: h.kind, minutes: h.minutes, temperature: h.temperature, label: h.label })),
      }))}
    />
  );
}
