import { Suspense } from "react";
import Link from "next/link";
import { BookOpen, DownloadSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Chips, Emoji, Field, Input, Select, SoftLink, firstParam } from "@/components/ui";
import { BATCHES, batchAmount } from "@/lib/meals";
import { clampBatches, menuMealName } from "@/lib/menu";
import { measureText, type Measures } from "@/lib/units";
import { UnitPill } from "../unit-pill";
import { EmojiPicker } from "@/components/emoji-picker";
import { requireHousehold } from "@/lib/household";
import { minutesText } from "@/lib/meal-helpers";
import { VISIBILITY_OPTIONS } from "../../calendar/options";
import { addRecipe, importRecipe, removeRecipe, saveRecipeBasics, saveRecipeNotes } from "../actions";
import { loadMealBasics, loadRecipeDetail, type DishKind, type MealBasics, type Recipe } from "../data";
import { MealsHeader, Modal, Pager, linker, pageOf } from "../parts";
import { IngredientsEditor, StepsEditor } from "../recipe-editors";

/**
 * The Menu Manager's Dishes tab (Connor, 2026-11-10): every dish, by what
 * it can be in a meal (Main, Starch, Veggie…). Tapping a dish opens its
 * recipe: ×1/×2/×3 batches, amounts whose units you can tap to see in other
 * units, and tabs for editing so nothing has to scroll.
 */
export default function LibraryPage(props: PageProps<"/meals/library">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Library searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

const KIND_PAGE = 12;
const DISH_PAGE = 6;
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

  const current = { kind: p("kind") ?? null, kpage: p("kpage") ?? null, dpage: p("dpage") ?? null };
  const here = linker("/meals/library", current);
  const returnTo = here({ recipe: p("recipe") ?? null, tab: p("tab") ?? null, batches: p("batches") ?? null });

  const tiles = [
    { id: ALL, name: "All dishes", icon: "📖", count: dishes.length },
    ...basics.kinds.map((k) => ({ id: k.id, name: k.name, icon: k.icon, count: dishes.filter((r) => r.kind_ids.includes(k.id)).length })),
    ...(loose.length ? [{ id: NONE, name: "No kind", icon: "📒", count: loose.length }] : []),
  ];
  const tilePage = pageOf(tiles, Number(p("kpage") ?? 0), KIND_PAGE);
  const list = picked === ALL ? dishes : picked === NONE ? loose : dishes.filter((r) => r.kind_ids.includes(picked));
  const dishPage = pageOf(list, Number(p("dpage") ?? 0), DISH_PAGE);
  const tagById = new Map(basics.tags.map((t) => [t.id, t]));
  const kindById = new Map(basics.kinds.map((k) => [k.id, k]));
  const pickedName = picked === ALL ? "All dishes" : picked === NONE ? "No kind" : (kind?.name ?? "");

  const recipeId = p("recipe");
  const openRecipe = recipeId ? basics.recipes.find((r) => r.id === recipeId) : undefined;
  const mainKind = basics.kinds.find((k) => k.name === "Main");

  return (
    <>
      <MealsHeader title="Menu Manager" tab="library" error={p("error")} message={p("message")}>
        <SoftLink href={here({ import: "paste" })}>
          <DownloadSimple size="1.5rem" aria-hidden />
          Bring a recipe in
        </SoftLink>
      </MealsHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5">
        <Card title="Kinds of dish" icon={BookOpen} tint="yellow">
          <p className="mb-3 text-lg text-ink-muted">Every dish is just a dish. Its kinds say what it can be in a meal: a Main, a Starch, a Veggie…</p>
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-2.5" style={{ gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}>
            {tilePage.items.map((t) => (
              <Link
                key={t.id}
                href={here({ kind: t.id === ALL ? null : t.id, dpage: null })}
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

        <Card title={pickedName}>
          <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
            {dishPage.items.map((r) => (
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
            {list.length === 0 ? <li className="text-lg text-ink-muted">No dishes here yet. Add the first one below.</li> : null}
          </ul>
          <Pager page={dishPage.page} pages={dishPage.pages} href={(n) => here({ dpage: n || null })} />
          <form action={addRecipe} className="mt-3 flex shrink-0 items-end gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="kindId" value={kind?.id ?? ""} />
            <Input name="name" placeholder={kind ? `New ${kind.name.toLowerCase()} dish` : "New dish"} aria-label="New dish" className="min-w-0 flex-1" maxLength={80} required />
            <Select name="meal" aria-label="Also a meal on the menu" defaultValue={kind && kind.id === mainKind?.id ? NONE : ""} className="w-[17rem]">
              <option value="">Just a dish</option>
              <option value={NONE}>Also a meal on the menu</option>
              {basics.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  Also a meal under {c.name}
                </option>
              ))}
            </Select>
            <Button>
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Add
            </Button>
          </form>
        </Card>
      </div>

      {p("import") ? <ImportCard mode={p("import") === "link" ? "link" : "paste"} basics={basics} kindId={kind?.id ?? mainKind?.id ?? ""} here={here} /> : null}
      {openRecipe ? (
        <RecipeCard
          recipe={openRecipe}
          basics={basics}
          tab={p("tab") ?? "recipe"}
          batches={clampBatches(p("batches") ?? 1)}
          here={here}
          temperatureUnit={household.settings.temperatureUnit}
          measures={household.settings.measures}
          returnTo={returnTo}
        />
      ) : null}
    </>
  );
}

function ImportCard({ mode, basics, kindId, here }: { mode: "paste" | "link"; basics: MealBasics; kindId: string; here: ReturnType<typeof linker> }) {
  const tabs = (
    <div className="flex gap-1 rounded-2xl bg-panel p-1">
      {(["paste", "link"] as const).map((m) => (
        <Link
          key={m}
          href={here({ import: m })}
          scroll={false}
          className={`flex min-h-12 items-center rounded-xl px-5 text-base font-bold ${m === mode ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
        >
          {m === "paste" ? "Paste it" : "From a web page"}
        </Link>
      ))}
    </div>
  );
  return (
    <Modal title="Bring a recipe in" icon={<Emoji emoji="📥" className="size-12" />} closeHref={here({})} aside={tabs}>
      <form action={importRecipe} className="flex min-h-0 flex-1 flex-col gap-4">
        <input type="hidden" name="returnTo" value={here({ import: mode })} />
        <input type="hidden" name="mode" value={mode} />
        {mode === "paste" ? (
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
            <p className="text-lg text-ink-muted">Most recipe sites include a tidy copy of the recipe. Paste the page&apos;s link and Almanac reads it.</p>
            <Field label="Link">
              <Input name="url" type="url" required placeholder="https://…" />
            </Field>
          </>
        )}
        <div className="flex items-end gap-4">
          <Field label="Name (optional)">
            <Input name="name" maxLength={80} placeholder="Use the recipe's own" className="w-[20rem]" />
          </Field>
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
              {basics.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  A meal under {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="ml-auto">Bring it in</Button>
        </div>
      </form>
    </Modal>
  );
}

const RECIPE_TABS = [
  { tab: "recipe", label: "Recipe" },
  { tab: "basics", label: "Basics" },
  { tab: "ingredients", label: "Ingredients" },
  { tab: "steps", label: "Steps" },
  { tab: "notes", label: "Notes" },
] as const;

async function RecipeCard({
  recipe,
  basics,
  tab,
  batches,
  here,
  temperatureUnit,
  measures,
  returnTo,
}: {
  recipe: Recipe;
  basics: MealBasics;
  tab: string;
  batches: number;
  here: ReturnType<typeof linker>;
  temperatureUnit: "celsius" | "fahrenheit";
  measures: Measures;
  returnTo: string;
}) {
  const detail = tab === "ingredients" || tab === "steps" || tab === "recipe" ? await loadRecipeDetail(recipe.id) : null;
  const tabs = (
    <div className="flex gap-1 rounded-2xl bg-panel p-1">
      {RECIPE_TABS.map((t) => (
        <Link
          key={t.tab}
          href={here({ recipe: recipe.id, tab: t.tab })}
          scroll={false}
          className={`flex min-h-12 items-center rounded-xl px-5 text-base font-bold ${t.tab === tab ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
  return (
    <Modal title={recipe.name} icon={<Emoji emoji={recipe.icon} className="size-12" />} closeHref={here({})} wide aside={tabs}>
      {tab === "recipe" && detail ? (
        <RecipeView recipe={recipe} detail={detail} batches={batches} here={here} measures={measures} basics={basics} />
      ) : tab === "ingredients" && detail ? (
        <IngredientsEditor
          recipeId={recipe.id}
          returnTo={returnTo}
          initial={detail.ingredients.map((i) => ({ amount: i.amount === null ? "" : String(i.amount), unit: i.unit ?? "", name: i.item.name, note: i.note ?? "", putAway: i.put_away_if_skipped }))}
        />
      ) : tab === "steps" && detail ? (
        <StepsEditor
          recipeId={recipe.id}
          returnTo={returnTo}
          temperatureUnit={temperatureUnit}
          initial={detail.steps.map((s) => ({ text: s.text, helpers: s.helpers.map((h) => ({ kind: h.kind, minutes: h.minutes, temperature: h.temperature, label: h.label })) }))}
        />
      ) : tab === "notes" ? (
        <form action={saveRecipeNotes} className="flex min-h-0 flex-1 flex-col gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="id" value={recipe.id} />
          <label className="flex min-h-0 flex-1 flex-col gap-1.5">
            <span className="text-base font-bold text-ink">Notes (swaps, what the kids think, where it came from)</span>
            <textarea
              name="notes"
              defaultValue={recipe.notes ?? ""}
              maxLength={4000}
              className="font-hand min-h-0 flex-1 resize-none rounded-[var(--radius)] border-2 border-frame p-4 text-2xl text-ink outline-none focus:border-accent"
            />
          </label>
          <div className="flex items-end gap-4">
            <Field label="Recipe link">
              <Input name="sourceUrl" type="url" defaultValue={recipe.source_url ?? ""} placeholder="https://…" className="w-[40rem]" />
            </Field>
            <Button>Save notes</Button>
          </div>
        </form>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <form action={saveRecipeBasics} className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-10 gap-y-5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="id" value={recipe.id} />
            <div className="flex flex-col gap-5">
              <div className="flex items-end gap-4">
                <EmojiPicker initial={recipe.icon ?? ""} nameField="name" />
                <Field label="Name">
                  <Input name="name" defaultValue={recipe.name} required maxLength={80} className="w-[30rem]" />
                </Field>
              </div>
              <div className="flex gap-4">
                <Field label="Serves">
                  <Input name="serves" type="number" min={1} max={50} defaultValue={recipe.serves} className="w-28" />
                </Field>
                <Field label="Hands-on minutes">
                  <Input name="handsOnMinutes" type="number" min={0} max={1440} defaultValue={recipe.hands_on_minutes ?? ""} className="w-36" />
                </Field>
                <Field label="Total minutes">
                  <Input name="totalMinutes" type="number" min={0} max={2880} defaultValue={recipe.total_minutes ?? ""} className="w-36" />
                </Field>
              </div>
              <p className="-mt-3 text-base text-ink-muted">Hands-on time is how early the meal shows on Today, so you start in time.</p>
              <Chips name="visibility" label="Who can see it" defaultValue={recipe.visibility} options={VISIBILITY_OPTIONS} />
              <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-xl text-ink">
                <input type="checkbox" name="isBackup" defaultChecked={recipe.is_backup} className="size-7 accent-[var(--color-ink)]" />
                It&apos;s a backup meal (for survival days)
              </label>
            </div>
            <div className="flex flex-col gap-5">
              <Chips
                name="kindIds"
                label="What it can be in a meal"
                multiple
                defaultValue={recipe.kind_ids}
                options={basics.kinds.slice(0, 14).map((k) => ({ value: k.id, label: k.name, leading: <Emoji emoji={k.icon} className="size-7" /> }))}
              />
              <Chips name="tagIds" label="Tags" multiple defaultValue={recipe.tag_ids} options={basics.tags.map((t) => ({ value: t.id, label: t.name, leading: <Emoji emoji={t.icon} className="size-7" /> }))} />
              <Button className="self-start">Save</Button>
            </div>
          </form>
          <form action={removeRecipe} className="flex shrink-0 justify-end border-t border-frame pt-4">
            <input type="hidden" name="returnTo" value={here({})} />
            <input type="hidden" name="id" value={recipe.id} />
            <input type="hidden" name="name" value={recipe.name} />
            <Button variant="danger">
              <Trash size="1.375rem" aria-hidden />
              Remove dish
            </Button>
          </form>
        </div>
      )}
    </Modal>
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
        <p className="shrink-0 text-base text-ink-muted">Tap an amount to see it in other units. Recipes keep the units they were written in.</p>
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
