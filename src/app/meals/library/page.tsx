import { Suspense } from "react";
import { FitList } from "@/components/fit-list";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionLink, AppFrame, Button, Emoji, Field, Input, Select, firstParam, LoadingOutline, secondaryActionClass } from "@/components/ui";
import { batchAmount } from "@/lib/meals";
import { clampBatches, menuMealName } from "@/lib/menu";
import { measureText, type Measures } from "@/lib/units";
import { UnitPill } from "../unit-pill";
import { requireHousehold } from "@/lib/household";
import { minutesText } from "@/lib/meal-helpers";
import { importRecipe } from "../actions";
import { loadMealBasics, loadRecipeDetail, type DishKind, type MealBasics, type Recipe } from "../data";
import { BatchSwitch, MealsHeader, Modal, Pager, linker, pageOf, pickRowClass } from "../parts";
import { DishEditor, type DishTab } from "../dish-editor";

/**
 * The Menu Manager's Dishes tab (Connor, 2026-11-10): every dish, by what
 * it can be in a meal (Main, Starch, Veggie…). Tapping a dish opens its
 * recipe: ×1/×2/×3 batches, amounts whose units you can tap to see in other
 * units, and tabs for editing so nothing has to scroll.
 */
export default function LibraryPage(props: PageProps<"/meals/library">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<LoadingOutline />}>
        <Library searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

const KIND_PAGE = 11;
const DISH_PAGE = 11;
/** The pretend kinds: every dish, and dishes with no kind. */
const ALL = "all";
const NONE = "none";

async function Library({ searchParams }: { searchParams: PageProps<"/meals/library">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const basics = await loadMealBasics();
  const p = (k: string) => firstParam(params[k]);

  const dishes = basics.recipes.filter((r) => !r.is_backup);
  const loose = dishes.filter((r) => r.kind_ids.length === 0);
  const kindParam = p("kind") ?? ALL;
  const kind: DishKind | undefined = basics.kinds.find((k) => k.id === kindParam);
  const picked = kind ? kind.id : kindParam === NONE ? NONE : ALL;

  const current = { kind: p("kind") ?? null, kpage: p("kpage") ?? null, recipe: p("recipe") ?? null };
  const here = linker("/meals/library", current);

  // Left: what a dish can be in a meal (Main, Starch, Veggie…), as in g-final-library.
  const rows = [
    { id: ALL, name: "All dishes", count: dishes.length },
    ...basics.kinds.map((k) => ({ id: k.id, name: k.name, count: dishes.filter((r) => r.kind_ids.includes(k.id)).length })),
    ...(loose.length ? [{ id: NONE, name: "No course", count: loose.length }] : []),
  ];
  const kindPage = pageOf(rows, Number(p("kpage") ?? 0), KIND_PAGE);
  const list = picked === ALL ? dishes : picked === NONE ? loose : dishes.filter((r) => r.kind_ids.includes(picked));
  const pickedName = picked === ALL ? "All dishes" : picked === NONE ? "No course" : (kind?.name ?? "");

  // Right: the dish asked for, or the first one in the middle column.
  const recipeId = p("recipe");
  const openRecipe = (recipeId ? dishes.find((r) => r.id === recipeId) : undefined) ?? (recipeId ? undefined : list[0]);
  const mainKind = basics.kinds.find((k) => k.name === "Main");

  return (
    <>
      <MealsHeader tab="library" error={p("error")} message={p("message")}>
        <ActionLink href={here({ add: "type" })} scroll={false}>
          Add a dish
        </ActionLink>
      </MealsHeader>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[15rem_26rem_minmax(0,1fr)]">
        <section className={card}>
          <h2 className={h2}>In a meal</h2>
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {kindPage.items.map((r) => (
              <li key={r.id}>
                <Link href={here({ kind: r.id === ALL ? null : r.id, recipe: null })} scroll={false} aria-current={r.id === picked ? "true" : undefined} className={pickRowClass(r.id === picked)}>
                  <span className="line-clamp-2 min-w-0 flex-1 text-[1.5rem] leading-[1.15] font-extrabold text-ink">{r.name}</span>
                  <span className="tabular text-[1.35rem] font-extrabold text-ink-muted">{r.count}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={kindPage.page} pages={kindPage.pages} href={(n) => here({ kpage: n || null })} />
        </section>

        <section className={card}>
          <FitList
            key={picked}
            heading={pickedName}
            fallback={DISH_PAGE}
            focus={openRecipe ? list.indexOf(openRecipe) : undefined}
            empty={<li className="px-1 text-lg text-ink-muted">No dishes yet</li>}
            rows={list.map((r) => (
              <li key={r.id}>
                <Link href={here({ recipe: r.id })} scroll={false} aria-current={r.id === openRecipe?.id ? "true" : undefined} className={pickRowClass(r.id === openRecipe?.id)}>
                  <Emoji emoji={r.icon ?? basics.kinds.find((k) => k.id === r.kind_ids[0])?.icon} className="size-[2.15rem]" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-[1.5rem] leading-[1.15] font-extrabold text-ink">{r.name}</span>
                </Link>
              </li>
            ))}
          />
        </section>

        {openRecipe ? (
          <RecipeCard
            recipe={openRecipe}
            basics={basics}
            tab={p("tab") ?? "recipe"}
            batches={clampBatches(p("batches") ?? 1)}
            here={here}
            temperatureUnit={household.settings.temperatureUnit}
            measures={household.settings.measures}
          />
        ) : (
          <section className={card}>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
              <Emoji emoji="🍽️" className="size-16" />
              <p className="text-2xl font-bold text-ink">No dish open</p>
            </div>
            <AddWays here={here} />
          </section>
        )}
      </div>

      {p("add") ? <AddCard mode={ADD_MODES.find((m) => m === p("add")) ?? "type"} basics={basics} kindId={kind?.id ?? mainKind?.id ?? ""} here={here} /> : null}
    </>
  );
}

/** The card and title looks shared by the three columns (g-final-library). */
const card = "flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised";
const h2 = "mb-1 flex min-h-12 shrink-0 items-center text-2xl font-bold text-ink";

/** The three ways to add a dish, at the foot of the recipe (the header's Add a dish opens the first). */
function AddWays({ here, children }: { here: ReturnType<typeof linker>; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 pt-3">
      <span className="mr-1 text-[1.15rem] font-bold text-ink-muted">Add a dish:</span>
      {ADD_MODES.map((m) => (
        <Link key={m} href={here({ add: m })} scroll={false} className={secondaryActionClass}>
          {ADD_MODE_NAMES[m]}
        </Link>
      ))}
      {children}
    </div>
  );
}

const ADD_MODES = ["type", "paste", "link"] as const;
type AddMode = (typeof ADD_MODES)[number];
const ADD_MODE_NAMES: Record<AddMode, string> = { type: "Type it in", paste: "Paste a recipe", link: "From a web page" };

/**
 * Adding a dish (Connor, 2026-11-11): one way in for every dish. Type it
 * in, paste a recipe, or read one from a web page; all three make the dish
 * and open it in the dish editor to fill in or check over.
 */
function AddCard({ mode, basics, kindId, here }: { mode: AddMode; basics: MealBasics; kindId: string; here: ReturnType<typeof linker> }) {
  const tabs = (
    <div className="flex gap-1 rounded-2xl bg-panel p-1">
      {ADD_MODES.map((m) => (
        <Link
          key={m}
          href={here({ add: m })}
          scroll={false}
          className={`flex min-h-12 items-center rounded-xl px-5 text-base font-bold ${m === mode ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
        >
          {ADD_MODE_NAMES[m]}
        </Link>
      ))}
    </div>
  );
  return (
    <Modal title="Add a dish" icon={<Emoji emoji="🍽️" className="size-12" />} closeHref={here({})} aside={tabs}>
      <form action={importRecipe} className="flex min-h-0 flex-1 flex-col gap-4">
        <input type="hidden" name="returnTo" value={here({ add: mode })} />
        <input type="hidden" name="mode" value={mode} />
        {mode === "type" ? (
          <>
            <Field label="Name">
              <Input name="name" maxLength={80} required autoFocus className="text-2xl" />
            </Field>
          </>
        ) : mode === "paste" ? (
          <>
            <textarea
              name="text"
              rows={12}
              required
              className="min-h-0 flex-1 resize-none rounded-[var(--radius)] border-2 border-frame p-4 text-lg text-ink outline-none focus:border-accent"
            />
          </>
        ) : (
          <>
            <Field label="Link">
              <Input name="url" type="url" required placeholder="https://…" />
            </Field>
          </>
        )}
        <div className="mt-auto flex items-end gap-4">
          {mode === "type" ? null : (
            <Field label="Name (optional)">
              <Input name="name" maxLength={80} className="w-[20rem]" />
            </Field>
          )}
          <Field label="Course">
            <Select name="kindId" defaultValue={kindId}>
              <option value="">None</option>
              {basics.kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="On the menu">
            <Select name="meal" defaultValue="none">
              <option value="">Just a dish</option>
              <option value="none">Also a meal</option>
              {basics.categories.filter((c) => !c.is_leftovers).map((c) => (
                <option key={c.id} value={c.id}>
                  Also a {c.name} meal
                </option>
              ))}
            </Select>
          </Field>
          <Button className="ml-auto">{mode === "type" ? "Add dish" : "Bring it in"}</Button>
        </div>
      </form>
    </Modal>
  );
}

const DISH_TABS: readonly DishTab[] = ["recipe", "basics", "ingredients", "steps", "notes"];

async function RecipeCard({
  recipe,
  basics,
  tab,
  batches,
  here,
  temperatureUnit,
  measures,
}: {
  recipe: Recipe;
  basics: MealBasics;
  tab: string;
  batches: number;
  here: ReturnType<typeof linker>;
  temperatureUnit: "celsius" | "fahrenheit";
  measures: Measures;
}) {
  const detail = await loadRecipeDetail(recipe.id);
  const ingredients = detail.ingredients.map((i) => ({ amount: i.amount === null ? "" : String(i.amount), unit: i.unit ?? "", name: i.item.name, note: i.note ?? "", putAway: i.put_away_if_skipped }));
  const steps = detail.steps.map((s) => ({ text: s.text, helpers: s.helpers.map((h) => ({ kind: h.kind, minutes: h.minutes, temperature: h.temperature, label: h.label })) }));
  const dish = {
    id: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    serves: recipe.serves,
    hands_on_minutes: recipe.hands_on_minutes,
    total_minutes: recipe.total_minutes,
    kind_ids: recipe.kind_ids,
    tag_ids: recipe.tag_ids,
    category_ids: recipe.category_ids,
    notes: recipe.notes,
    source_url: recipe.source_url,
  };
  return (
    <DishEditor
      // A fresh start whenever the saved dish changes (after Save).
      key={JSON.stringify([dish, ingredients, steps])}
      dish={dish}
      kinds={basics.kinds}
      tags={basics.tags}
      categories={basics.categories.filter((c) => c.active && !c.is_leftovers)}
      ingredients={ingredients}
      steps={steps}
      temperatureUnit={temperatureUnit}
      initialTab={DISH_TABS.find((t) => t === tab) ?? "recipe"}
      dishHref={here({ recipe: recipe.id })}
      batches={<BatchSwitch value={batches} href={(b) => here({ recipe: recipe.id, tab: "recipe", batches: b === 1 ? null : b })} />}
      view={<RecipeView recipe={recipe} detail={detail} batches={batches} here={here} measures={measures} basics={basics} />}
      removeTo={here({ recipe: null })}
    />
  );
}

const VIEW_INGREDIENTS = 11;
const VIEW_STEPS = 5;

/**
 * The recipe to read: big printed ingredients times the batches (tap a
 * unit to see it in other units), the steps beside them, then the ways to
 * add a dish and Cook this.
 */
function RecipeView({
  recipe,
  detail,
  batches,
  here,
  measures,
  basics,
}: {
  recipe: Recipe;
  detail: Awaited<ReturnType<typeof loadRecipeDetail>>;
  batches: number;
  here: ReturnType<typeof linker>;
  measures: Measures;
  basics: MealBasics;
}) {
  const ingredients = detail.ingredients;
  const dishes = new Map(basics.recipes.map((r) => [r.id, r]));
  const inMeals = basics.menuMeals.filter((m) => m.spots.some((s) => s.recipe_id === recipe.id)).map((m) => menuMealName(m, dishes));
  const shown = ingredients.slice(0, VIEW_INGREDIENTS);
  const label = "shrink-0 text-[1.15rem] font-bold tracking-[0.06em] text-ink-muted uppercase";
  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8">
        <section className="flex min-h-0 flex-col">
          <h3 className={label}>
            Ingredients · serves {recipe.serves * batches}
            {recipe.total_minutes ? ` · ${minutesText(recipe.total_minutes)}` : ""}
          </h3>
          <ul className="flex min-h-0 flex-col">
            {shown.map((i) => {
              const amount = batchAmount(i.amount === null ? null : Number(i.amount), batches);
              const text = measureText(amount, i.unit);
              return (
                <li key={i.id} className="flex min-h-[3.4rem] items-center gap-[0.7rem] border-b border-frame text-[1.5rem] font-bold text-ink">
                  <span className="min-w-0 flex-1 truncate">
                    {i.item.name}
                    {i.note ? `, ${i.note}` : ""}
                  </span>
                  {text ? <UnitPill amount={amount} unit={i.unit} text={text} measures={measures} size="xl" /> : null}
                </li>
              );
            })}
            {ingredients.length === 0 ? <li className="pt-2 text-lg text-ink-muted">No ingredients yet</li> : null}
          </ul>
          {ingredients.length > shown.length ? (
            <Link href={here({ recipe: recipe.id, tab: "ingredients" })} scroll={false} className="flex min-h-12 shrink-0 items-center text-lg font-bold text-accent">
              + {ingredients.length - shown.length} more
            </Link>
          ) : null}
        </section>
        <section className="flex min-h-0 flex-col gap-3">
          <h3 className={label}>Steps</h3>
          <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {detail.steps.slice(0, VIEW_STEPS).map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <span className="tabular flex size-10 shrink-0 items-center justify-center rounded-full bg-rail text-lg font-extrabold text-ink">{i + 1}</span>
                <span className="line-clamp-3 text-[1.25rem] leading-snug font-bold text-ink">{s.text}</span>
              </li>
            ))}
            {detail.steps.length === 0 ? <li className="text-lg text-ink-muted">No steps yet</li> : null}
          </ol>
          {detail.steps.length > VIEW_STEPS ? (
            <Link href={here({ recipe: recipe.id, tab: "steps" })} scroll={false} className="flex min-h-12 shrink-0 items-center text-lg font-bold text-accent">
              + {detail.steps.length - VIEW_STEPS} more steps
            </Link>
          ) : null}
          <p className="shrink-0 text-lg text-ink-muted">
            {inMeals.length ? `On the menu in ${inMeals.slice(0, 3).join(", ")}${inMeals.length > 3 ? ` and ${inMeals.length - 3} more` : ""}.` : "Not in a meal yet."}
          </p>
        </section>
      </div>
      <AddWays here={here}>
        {/* Cook mode for this dish alone, at the batches picked here. */}
        <Link href={`/meals/cook/dish/${recipe.id}${batches > 1 ? `?batches=${batches}` : ""}`} className={`${secondaryActionClass} ml-auto bg-meal! text-meal-ink!`}>
          Cook this
        </Link>
      </AddWays>
    </>
  );
}
