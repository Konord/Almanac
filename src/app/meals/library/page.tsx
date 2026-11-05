import { Suspense } from "react";
import Link from "next/link";
import { BookOpen, DownloadSimple, PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Chips, Emoji, Field, Input, Select, SoftLink, firstParam } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { requireHousehold } from "@/lib/household";
import { minutesText } from "@/lib/meal-helpers";
import { VISIBILITY_OPTIONS } from "../../calendar/options";
import { addCategory, addRecipe, importRecipe, removeCategory, removeRecipe, saveRecipeBasics, saveRecipeNotes, updateCategory } from "../actions";
import { loadMealBasics, loadRecipeDetail, type MealBasics, type MealCategory, type Recipe } from "../data";
import { MealsHeader, Modal, Pager, linker, pageOf } from "../parts";
import { IngredientsEditor, StepsEditor } from "../recipe-editors";

/**
 * The recipe library: categories (Tacos, Pasta…) on the left, the chosen
 * category's variants (Beef tacos, Chicken tacos…) on the right. Tapping a
 * variant opens its recipe card, with tabs so nothing has to scroll.
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

const CATEGORY_PAGE = 12;
const VARIANT_PAGE = 6;
/** Recipes with no category show under this pretend category. */
const NONE = "none";

async function Library({ searchParams }: { searchParams: PageProps<"/meals/library">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const basics = await loadMealBasics();
  const p = (k: string) => firstParam(params[k]);

  const loose = basics.recipes.filter((r) => r.category_ids.length === 0 && !r.is_backup);
  const categoryParam = p("category");
  const category: MealCategory | null =
    categoryParam === NONE
      ? null
      : (basics.categories.find((c) => c.id === categoryParam) ?? (categoryParam ? null : (basics.categories[0] ?? null)));
  const showingLoose = categoryParam === NONE;

  const current = {
    category: categoryParam ?? null,
    cpage: p("cpage") ?? null,
    vpage: p("vpage") ?? null,
  };
  const here = linker("/meals/library", current);
  const returnTo = here({ recipe: p("recipe") ?? null, tab: p("tab") ?? null });

  const tiles = [
    ...basics.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, count: basics.recipes.filter((r) => r.category_ids.includes(c.id)).length, active: c.active })),
    ...(loose.length ? [{ id: NONE, name: "No category", icon: "📒", count: loose.length, active: true }] : []),
  ];
  const tilePage = pageOf(tiles, Number(p("cpage") ?? 0), CATEGORY_PAGE);
  const selectedId = showingLoose ? NONE : category?.id;
  const variants = showingLoose ? loose : category ? basics.recipes.filter((r) => r.category_ids.includes(category.id)) : [];
  const variantPage = pageOf(variants, Number(p("vpage") ?? 0), VARIANT_PAGE);
  const tagById = new Map(basics.tags.map((t) => [t.id, t]));

  const recipeId = p("recipe");
  const openRecipe = recipeId ? basics.recipes.find((r) => r.id === recipeId) : undefined;

  return (
    <>
      <MealsHeader title="Recipes" tab="library" error={p("error")} message={p("message")}>
        <SoftLink href={here({ newCategory: "1" })}>
          <Plus size="1.5rem" weight="bold" aria-hidden />
          Category
        </SoftLink>
        <SoftLink href={here({ import: "paste" })}>
          <DownloadSimple size="1.5rem" aria-hidden />
          Bring a recipe in
        </SoftLink>
      </MealsHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5">
        <Card title="Categories" icon={BookOpen} tint="yellow">
          <p className="mb-3 text-lg text-ink-muted">A category is what you plan (Tacos). Its variants are the recipes you choose between (Beef, Chicken, Bean).</p>
          <div className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-4 gap-2.5" style={{ gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}>
            {tilePage.items.map((t) => (
              <Link
                key={t.id}
                href={here({ category: t.id, vpage: null })}
                scroll={false}
                className={`flex min-h-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center ${
                  t.id === selectedId ? "border-meal-ink bg-meal" : "border-frame hover:bg-rail"
                } ${t.active ? "" : "opacity-55"}`}
              >
                <Emoji emoji={t.icon} className="size-16" />
                <span className="line-clamp-1 text-xl font-bold text-ink">{t.name}</span>
                <span className="text-base text-ink-muted">
                  {t.count} variant{t.count === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-3">
            <Pager page={tilePage.page} pages={tilePage.pages} href={(n) => here({ cpage: n || null })} />
          </div>
        </Card>

        <Card
          title={showingLoose ? "No category" : (category?.name ?? "No categories yet")}
          aside={
            category ? (
              <SoftLink href={here({ editCategory: "1" })}>
                <PencilSimple size="1.375rem" aria-hidden />
                Edit
              </SoftLink>
            ) : null
          }
        >
          {category || showingLoose ? (
            <>
              <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                {variantPage.items.map((r) => (
                  <li key={r.id}>
                    <Link href={here({ recipe: r.id, tab: "basics" })} scroll={false} className="flex min-h-18 items-center gap-3 rounded-2xl bg-rail px-4 hover:bg-panel">
                      <Emoji emoji={r.icon ?? category?.icon} className="size-12" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xl font-bold text-ink">{r.name}</span>
                        <span className="truncate text-base text-ink-muted">
                          {[r.total_minutes ? minutesText(r.total_minutes) : null, `Serves ${r.serves}`, ...r.tag_ids.map((id) => tagById.get(id)?.name)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {r.is_backup ? <Emoji emoji="🛟" className="size-8" /> : null}
                    </Link>
                  </li>
                ))}
                {variants.length === 0 ? <li className="text-lg text-ink-muted">No variants yet. Add the first one below.</li> : null}
              </ul>
              <Pager page={variantPage.page} pages={variantPage.pages} href={(n) => here({ vpage: n || null })} />
              {category ? (
                <form action={addRecipe} className="mt-3 flex shrink-0 gap-2">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="categoryId" value={category.id} />
                  <Input name="name" placeholder={`New ${category.name.toLowerCase()} variant`} className="min-w-0 flex-1" maxLength={80} />
                  <Button>
                    <Plus size="1.25rem" weight="bold" aria-hidden />
                    Add
                  </Button>
                </form>
              ) : null}
            </>
          ) : (
            <p className="text-lg text-ink-muted">Make a category to get started.</p>
          )}
        </Card>
      </div>

      {p("newCategory") ? (
        <Modal title="New category" closeHref={here({})}>
          <CategoryForm basics={basics} returnTo={here({ newCategory: "1" })} />
        </Modal>
      ) : null}
      {p("editCategory") && category ? (
        <Modal title={`Edit ${category.name}`} icon={<Emoji emoji={category.icon} className="size-12" />} closeHref={here({})}>
          <CategoryForm basics={basics} category={category} returnTo={here({ editCategory: "1" })} />
        </Modal>
      ) : null}
      {p("import") ? <ImportCard mode={p("import") === "link" ? "link" : "paste"} basics={basics} categoryId={category?.id ?? ""} here={here} /> : null}
      {openRecipe ? (
        <RecipeCard
          recipe={openRecipe}
          basics={basics}
          tab={p("tab") ?? "basics"}
          here={here}
          temperatureUnit={household.settings.temperatureUnit}
          returnTo={returnTo}
        />
      ) : null}
    </>
  );
}

function CategoryForm({ basics, category, returnTo }: { basics: MealBasics; category?: MealCategory; returnTo: string }) {
  return (
    <div className="flex flex-col gap-5">
      <form action={category ? updateCategory : addCategory} className="flex flex-col gap-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <div className="flex items-end gap-4">
          <EmojiPicker initial={category?.icon ?? ""} nameField="name" />
          <Field label="Name">
            <Input name="name" defaultValue={category?.name} placeholder="Tacos" maxLength={40} required className="w-[28rem]" />
          </Field>
        </div>
        <Chips
          name="mealTimeIds"
          label="Which meal times? (none ticked means any)"
          multiple
          defaultValue={category?.meal_time_ids ?? []}
          options={basics.mealTimes.map((t) => ({ value: t.id, label: t.name, leading: <Emoji emoji={t.icon} className="size-7" /> }))}
        />
        <Chips name="visibility" label="Who can see it" defaultValue={category?.visibility ?? "everyone"} options={VISIBILITY_OPTIONS} />
        <Button className="self-start">{category ? "Save" : "Make category"}</Button>
      </form>
      {category ? (
        <form action={removeCategory} className="border-t border-frame pt-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="name" value={category.name} />
          <Button variant="danger">
            <Trash size="1.375rem" aria-hidden />
            Remove {category.name} (keeps its recipes)
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function ImportCard({ mode, basics, categoryId, here }: { mode: "paste" | "link"; basics: MealBasics; categoryId: string; here: ReturnType<typeof linker> }) {
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
            <Input name="name" maxLength={80} placeholder="Use the recipe's own" className="w-[24rem]" />
          </Field>
          <Field label="Category">
            <Select name="categoryId" defaultValue={categoryId}>
              <option value="">None</option>
              {basics.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
  { tab: "basics", label: "Basics" },
  { tab: "ingredients", label: "Ingredients" },
  { tab: "steps", label: "Steps" },
  { tab: "notes", label: "Notes" },
] as const;

async function RecipeCard({
  recipe,
  basics,
  tab,
  here,
  temperatureUnit,
  returnTo,
}: {
  recipe: Recipe;
  basics: MealBasics;
  tab: string;
  here: ReturnType<typeof linker>;
  temperatureUnit: "celsius" | "fahrenheit";
  returnTo: string;
}) {
  const detail = tab === "ingredients" || tab === "steps" ? await loadRecipeDetail(recipe.id) : null;
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
      {tab === "ingredients" && detail ? (
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
                name="categoryIds"
                label="Categories"
                multiple
                defaultValue={recipe.category_ids}
                options={basics.categories.slice(0, 14).map((c) => ({ value: c.id, label: c.name, leading: <Emoji emoji={c.icon} className="size-7" /> }))}
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
              Remove recipe
            </Button>
          </form>
        </div>
      )}
    </Modal>
  );
}
