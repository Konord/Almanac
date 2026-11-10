import { Suspense } from "react";
import { AppFrame, Emoji, firstParam } from "@/components/ui";
import { CategoryForm } from "../category-form";
import { loadMealBasics } from "../data";
import { Modal } from "../parts";
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
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
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
  const editing = p("editCategory") ? basics.categories.find((c) => c.id === p("editCategory")) : undefined;
  const back = categoryParam ? `/meals/menu?category=${categoryParam}` : "/meals/menu";

  return (
    <>
      <MenuManager
        // A fresh start after each save (or a meal changing elsewhere).
        key={hash(JSON.stringify(initial))}
        initial={initial}
        categories={basics.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, active: c.active }))}
        kinds={basics.kinds.map((k) => ({ id: k.id, name: k.name, icon: k.icon }))}
        dishes={basics.recipes.filter((r) => !r.is_backup).map((r) => ({ id: r.id, name: r.name, icon: r.icon, kind_ids: r.kind_ids }))}
        category={categoryParam}
        meal={p("meal") ?? null}
        message={p("message") ?? null}
        problem={p("error") ?? null}
      />
      {p("newCategory") ? (
        <Modal title="New kind of meal" closeHref={back}>
          <CategoryForm basics={basics} returnTo={`${back}${back.includes("?") ? "&" : "?"}newCategory=1`} />
        </Modal>
      ) : null}
      {editing ? (
        <Modal title={`Edit ${editing.name}`} icon={<Emoji emoji={editing.icon} className="size-12" />} closeHref={`/meals/menu?category=${editing.id}`}>
          <CategoryForm basics={basics} category={editing} returnTo={`/meals/menu?category=${editing.id}&editCategory=${editing.id}`} />
        </Modal>
      ) : null}
    </>
  );
}
