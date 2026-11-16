import { Suspense } from "react";
import { notFound } from "next/navigation";
import { firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { clampBatches } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";
import { loadRecipeDetail } from "../../../data";
import { CookingMode } from "../../cooking-mode";

/**
 * Cooking mode for one dish, from "Cook this" on the Dishes tab: the same
 * immersive screen as a planned meal, at the batches picked there. There's
 * no planned meal behind it, so nothing is marked cooked; Done goes back.
 */
export default function CookDishPage(props: PageProps<"/meals/cook/dish/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-2xl text-ink-muted">Getting the recipe…</p>}>
      <CookDish params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function CookDish({ params, searchParams }: { params: PageProps<"/meals/cook/dish/[id]">["params"]; searchParams: PageProps<"/meals/cook/dish/[id]">["searchParams"] }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const household = await requireHousehold();
  const supabase = await createClient();
  const { data: recipe, error } = await supabase.from("recipes").select("id, name, icon, notes").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!recipe) notFound();
  const detail = await loadRecipeDetail(recipe.id);
  const batches = clampBatches(firstParam(query.batches) ?? 1);

  return (
    <CookingMode
      mealId={null}
      backHref={`/meals/library?recipe=${recipe.id}${batches > 1 ? `&batches=${batches}` : ""}`}
      title={recipe.name}
      temperatureUnit={household.settings.temperatureUnit}
      measures={household.settings.measures}
      canPlanLeftovers={false}
      dishes={[
        {
          recipeId: recipe.id,
          name: recipe.name,
          icon: recipe.icon,
          notes: recipe.notes,
          batches,
          ingredients: detail.ingredients.map((ing) => ({ id: ing.id, name: ing.item.name, icon: ing.item.icon, amount: ing.amount, unit: ing.unit, note: ing.note })),
          steps: detail.steps.map((s) => ({
            id: s.id,
            text: s.text,
            helpers: s.helpers.map((h) => ({ kind: h.kind, minutes: h.minutes, temperature: h.temperature, label: h.label })),
          })),
        },
      ]}
    />
  );
}
