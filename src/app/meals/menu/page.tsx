import { Suspense } from "react";
import { AppFrame, firstParam, LoadingOutline } from "@/components/ui";
import { loadMealBasics } from "../data";
import { MenuManager, type ManagerMeal } from "./manager";

/**
 * The Menu Manager's Meals tab (Connor, 2026-11-10): the meals you plan
 * from. Kinds of meal on the left (Tacos, Meat & veggies), that kind's
 * meals in the middle, and the chosen meal's dishes on the right. A meal
 * is a list of spots: a set dish (Mashed potatoes) or one you pick on the
 * day (any Veggie). One Save for the whole screen.
 */
export default function MenuPage(props: PageProps<"/meals/menu">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<LoadingOutline />}>
        <Menu searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

async function Menu({ searchParams }: { searchParams: PageProps<"/meals/menu">["searchParams"] }) {
  const params = await searchParams;
  const p = (k: string) => firstParam(params[k]);
  const basics = await loadMealBasics();
  const initial: ManagerMeal[] = basics.menuMeals.map((m) => ({
    id: m.id,
    name: m.name ?? "",
    icon: m.icon,
    categoryIds: m.category_ids,
    spots: m.spots.toSorted((a, b) => a.position - b.position).map((s) => ({ kindId: s.kind_id, recipeId: s.recipe_id, batches: s.batches })),
  }));
  const categoryParam = p("category") ?? null;

  return (
    <>
      <MenuManager
        // A fresh start after each save (or a meal changing elsewhere).
        key={hash(JSON.stringify([initial, basics.categories]))}
        initial={initial}
        categories={basics.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, active: c.active, isLeftovers: c.is_leftovers }))}
        kinds={basics.kinds.map((k) => ({ id: k.id, name: k.name, icon: k.icon }))}
        dishes={basics.recipes.filter((r) => !r.is_backup).map((r) => ({ id: r.id, name: r.name, icon: r.icon, kind_ids: r.kind_ids }))}
        category={categoryParam}
        meal={p("meal") ?? null}
        message={p("message") ?? null}
        problem={p("error") ?? null}
      />
    </>
  );
}
