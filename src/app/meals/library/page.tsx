import { Suspense } from "react";
import { FitList } from "@/components/fit-list";
import Link from "next/link";
import { BookOpen, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, Field, Input, Select, SoftLink, firstParam, LoadingOutline } from "@/components/ui";
import { BATCHES, batchAmount } from "@/lib/meals";
import { clampBatches, menuMealName } from "@/lib/menu";
import { measureText, type Measures } from "@/lib/units";
import { UnitPill } from "../unit-pill";
import { requireHousehold } from "@/lib/household";
import { minutesText } from "@/lib/meal-helpers";
import { importRecipe, removeRecipe } from "../actions";
import { loadMealBasics, loadRecipeDetail, type DishKind, type MealBasics, type Recipe } from "../data";
import { MealsHeader, Modal, Pager, linker, pageOf } from "../parts";
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

const KIND_PAGE = 12;
const DISH_PAGE = 8;
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

  const current = { kind: p("kind") ?? null, kpage: p("kpage") ?? null };
  const here = linker("/meals/library", current);

  const tiles = [
    { id: ALL, name: "All dishes", icon: "📖", count: dishes.length },
    ...basics.kinds.map((k) => ({ id: k.id, name: k.name, icon: k.icon, count: dishes.filter((r) => r.kind_ids.includes(k.id)).length })),
    ...(loose.length ? [{ id: NONE, name: "No kind", icon: "📒", count: loose.length }] : []),
  ];
  const tilePage = pageOf(tiles, Number(p("kpage") ?? 0), KIND_PAGE);
  const list = picked === ALL ? dishes : picked === NONE ? loose : dishes.filter((r) => r.kind_ids.includes(picked));
  const tagById = new Map(basics.tags.map((t) => [t.id, t]));
  const kindById = new Map(basics.kinds.map((k) => [k.id, k]));
  const pickedName = picked === ALL ? "All dishes" : picked === NONE ? "No kind" : (kind?.name ?? "");

  const recipeId = p("recipe");
  const openRecipe = recipeId ? basics.recipes.find((r) => r.id === recipeId) : undefined;
  const mainKind = basics.kinds.find((k) => k.name === "Main");

  return (
    <>
      <MealsHeader title="Meals" tab="library" error={p("error")} message={p("message")}>
        <SoftLink href={here({ add: "type" })}>
          <Plus size="1.5rem" weight="bold" aria-hidden />
          Add a dish
        </SoftLink>
      </MealsHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5">
        <Card title="Kinds of dish" icon={BookOpen} tint="yellow">
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-2.5" style={{ gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}>
            {tilePage.items.map((t) => (
              <Link
                key={t.id}
                href={here({ kind: t.id === ALL ? null : t.id })}
                scroll={false}
                className={`flex min-h-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center ${t.id === picked ? "border-meal-ink bg-meal" : "border-frame hover:bg-rail"}`}
              >
                <Emoji emoji={t.icon} className="size-14" />
                <span className="line-clamp-1 text-xl font-bold text-ink">{t.name}</span>
                <span className="text-base text-ink-muted">
                  {t.count} dish{t.count === 1 ? "" : "es"}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-3">
            <Pager page={tilePage.page} pages={tilePage.pages} href={(n) => here({ kpage: n || null })} />
          </div>
        </Card>

        <Card>
          <FitList
            key={picked}
            heading={pickedName}
            fallback={DISH_PAGE}
            className="mt-2 gap-2"
            empty={<li className="text-lg text-ink-muted">No dishes here yet. Tap Add a dish at the top.</li>}
            rows={list.map((r) => (
              <li key={r.id}>
                <Link href={here({ recipe: r.id, tab: "recipe" })} scroll={false} className="flex min-h-18 items-center gap-3 rounded-2xl bg-rail px-4 hover:bg-panel">
                  <Emoji emoji={r.icon ?? kindById.get(r.kind_ids[0] ?? "")?.icon} className="size-12" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xl font-bold text-ink">{r.name}</span>
                    <span className="truncate text-base text-ink-muted">
                      {[
                        r.kind_ids.map((id) => kindById.get(id)?.name).filter(Boolean).join(", ") || null,
                        r.total_minutes ? minutesText(r.total_minutes) : null,
                        `Serves ${r.serves}`,
                        ...r.tag_ids.map((id) => tagById.get(id)?.name),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          />
        </Card>
      </div>

      {p("add") ? <AddCard mode={ADD_MODES.find((m) => m === p("add")) ?? "type"} basics={basics} kindId={kind?.id ?? mainKind?.id ?? ""} here={here} /> : null}
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
      ) : null}
    </>
  );
}

const ADD_MODES = ["type", "paste", "link"] as const;
type AddMode = (typeof ADD_MODES)[number];
const ADD_MODE_NAMES: Record<AddMode, string> = { type: "Type it in", paste: "Paste it", link: "From a web page" };

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
            <p className="text-lg text-ink-muted">Give it a name to start. The dish then opens so you can add its ingredients, steps and notes, the same as a recipe you paste in.</p>
            <Field label="Name">
              <Input name="name" maxLength={80} required autoFocus placeholder="Grandma's chili" className="text-2xl" />
            </Field>
          </>
        ) : mode === "paste" ? (
          <>
            <p className="text-lg text-ink-muted">Paste the whole recipe. Almanac looks for &quot;Ingredients&quot; and &quot;Directions&quot;, then you check it over.</p>
            <textarea
              name="text"
              rows={12}
              required
              className="min-h-0 flex-1 resize-none rounded-[var(--radius)] border-2 border-frame p-4 text-lg text-ink outline-none focus:border-accent"
              placeholder={"Grandma's chili\n\nIngredients\n1 lb ground beef\n1 can kidney beans\n\nDirections\nBrown the beef.\nSimmer 30 minutes."}
            />
          </>
        ) : (
          <>
            <p className="text-lg text-ink-muted">Paste a recipe page&apos;s link and Almanac reads it in.</p>
            <Field label="Link">
              <Input name="url" type="url" required placeholder="https://…" />
            </Field>
          </>
        )}
        <div className="mt-auto flex items-end gap-4">
          {mode === "type" ? null : (
            <Field label="Name (optional)">
              <Input name="name" maxLength={80} placeholder="Use the recipe's own" className="w-[20rem]" />
            </Field>
          )}
          <Field label="Kind of dish">
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
                  A meal under {c.name}
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
      closeHref={here({})}
      view={<RecipeView recipe={recipe} detail={detail} batches={batches} here={here} measures={measures} basics={basics} />}
      remove={
        <form action={removeRecipe}>
          <input type="hidden" name="returnTo" value={here({})} />
          <input type="hidden" name="id" value={recipe.id} />
          <input type="hidden" name="name" value={recipe.name} />
          <Button variant="danger">
            <Trash size="1.375rem" aria-hidden />
            Remove dish
          </Button>
        </form>
      }
    />
  );
}

const VIEW_INGREDIENTS = 12;
const VIEW_STEPS = 6;

/** The recipe to read: ingredients times the batches, units you can tap, and the steps. */
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
  const column = (list: typeof ingredients) => (
    <ul className="flex min-w-0 flex-col gap-1">
      {list.map((i) => {
        const amount = batchAmount(i.amount === null ? null : Number(i.amount), batches);
        const text = measureText(amount, i.unit);
        return (
          <li key={i.id} className="flex min-h-12 items-center gap-2.5">
            <Emoji emoji={i.item.icon} className="size-8" />
            {text ? <UnitPill amount={amount} unit={i.unit} text={text} measures={measures} size="md" /> : null}
            <span className="min-w-0 flex-1 truncate leading-tight">
              <span className="text-lg text-ink">{i.item.name}</span>
              {i.note ? <span className="text-base text-ink-muted">, {i.note}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
  const shown = ingredients.slice(0, VIEW_INGREDIENTS * 2);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8">
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-3">
          <h3 className="flex-1 text-2xl font-bold text-ink">Ingredients</h3>
          <span className="text-base text-ink-muted">Makes {recipe.serves * batches} servings</span>
          <nav aria-label="Batches" className="flex gap-1 rounded-2xl bg-meal p-1.5">
            {BATCHES.map((b) => (
              <Link
                key={b}
                href={here({ recipe: recipe.id, tab: "recipe", batches: b === 1 ? null : b })}
                scroll={false}
                aria-current={b === batches ? "true" : undefined}
                className={`flex h-12 min-w-14 items-center justify-center rounded-xl px-3 text-lg font-bold ${b === batches ? "bg-board text-ink" : "text-meal-ink"}`}
              >
                ×{b}
              </Link>
            ))}
          </nav>
        </div>
        <p className="shrink-0 text-base text-ink-muted">Tap an amount to see it in other units.</p>
        {ingredients.length ? (
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-6">
            {column(shown.slice(0, VIEW_INGREDIENTS))}
            {column(shown.slice(VIEW_INGREDIENTS))}
          </div>
        ) : (
          <p className="text-lg text-ink-muted">No ingredients yet. Add them in the Ingredients tab.</p>
        )}
        {ingredients.length > shown.length ? (
          <Link href={here({ recipe: recipe.id, tab: "ingredients" })} scroll={false} className="text-base font-bold text-accent">
            + {ingredients.length - shown.length} more
          </Link>
        ) : null}
      </section>
      <section className="flex min-h-0 flex-col gap-3">
        <h3 className="shrink-0 text-2xl font-bold text-ink">Steps</h3>
        <ol className="flex min-h-0 flex-1 flex-col gap-2.5">
          {detail.steps.slice(0, VIEW_STEPS).map((s, i) => (
            <li key={s.id} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rail text-base font-extrabold text-ink">{i + 1}</span>
              <span className="line-clamp-3 text-lg leading-snug text-ink">{s.text}</span>
            </li>
          ))}
          {detail.steps.length === 0 ? <li className="text-lg text-ink-muted">No steps yet. Add them in the Steps tab.</li> : null}
        </ol>
        {detail.steps.length > VIEW_STEPS ? (
          <Link href={here({ recipe: recipe.id, tab: "steps" })} scroll={false} className="shrink-0 text-base font-bold text-accent">
            + {detail.steps.length - VIEW_STEPS} more steps
          </Link>
        ) : null}
        <p className="shrink-0 border-t border-frame pt-3 text-base text-ink-muted">
          {inMeals.length ? `On the menu in ${inMeals.slice(0, 3).join(", ")}${inMeals.length > 3 ? ` and ${inMeals.length - 3} more` : ""}.` : "Not in a meal on the menu yet."} Cooking mode opens from a planned meal on Today.
        </p>
      </section>
    </div>
  );
}
