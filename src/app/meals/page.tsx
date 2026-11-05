import { Suspense } from "react";
import Link from "next/link";
import { ArrowsClockwise, CaretLeft, CaretRight, CookingPot, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Chips, Emoji, IconLink, Input, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { weekDates, weekStartOf } from "@/lib/meals";
import { addDays, isLocalDate, localDateOf, zonedToUtc } from "@/lib/time";
import { pickVariant, removeMealForm, setMealPeople, setServings, swapMeal } from "./actions";
import { energyModes, loadBackupParts, loadMealBasics, loadMeals, mealIcon, mealName, readyCount } from "./data";
import { ENERGY_LOOK, MealsHeader, Modal, linker } from "./parts";
import { PlannerBoard, type BoardMeal } from "./planner-board";
import { ensurePresets } from "./shared";

/**
 * The meal planner: one week at a time, a row for each meal time, a
 * column for each day. Categories from the tray on the right are dragged
 * (or tapped, then tapped into place) onto the week. Presets ("Tuesday is
 * Tacos") fill themselves in the first time a week is opened.
 */
export default function MealsPage(props: PageProps<"/meals">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Planner searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Planner({ searchParams }: { searchParams: PageProps<"/meals">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { timeZone, locale, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const weekParam = firstParam(params.week);
  const week = weekStartOf(weekParam && isLocalDate(weekParam) ? weekParam : today, weekStartsOn);
  const dates = weekDates(week);
  await ensurePresets(household.id, week, today);

  const [basics, meals, modes] = await Promise.all([loadMealBasics(), loadMeals(dates[0], dates[6]), energyModes(week, 7)]);
  const recipeById = new Map(basics.recipes.map((r) => [r.id, r]));
  const categoryById = new Map(basics.categories.map((c) => [c.id, c]));
  const memberById = new Map(basics.members.map((m) => [m.id, m]));
  const thisWeek = weekStartOf(today, weekStartsOn);

  const here = linker("/meals", { week: week === thisWeek ? null : week });
  const returnTo = here({});
  const openMealId = firstParam(params.meal);
  const swapId = firstParam(params.swap);
  const cellParam = firstParam(params.cell);

  const day = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...opts }).format(zonedToUtc(d, "12:00", timeZone));
  const sameMonth = day(dates[0], { month: "short" }) === day(dates[6], { month: "short" });
  const title = sameMonth
    ? `${day(dates[0], { month: "long" })} ${day(dates[0], { day: "numeric" })} – ${day(dates[6], { day: "numeric" })}`
    : `${day(dates[0], { month: "short", day: "numeric" })} – ${day(dates[6], { month: "short", day: "numeric" })}`;

  const times = basics.mealTimes.filter((t) => t.show_on_planner);
  const boardMeals: BoardMeal[] = meals
    .filter((m) => m.status !== "swapped")
    .map((m) => ({
      id: m.id,
      date: m.date,
      mealTimeId: m.meal_time_id,
      name: mealName(m, recipeById, categoryById),
      icon: mealIcon(m, recipeById, categoryById),
      undecided: !m.recipe_id,
      cooked: m.status === "cooked",
      skipped: m.status === "skipped",
      backup: m.recipe_id ? (recipeById.get(m.recipe_id)?.is_backup ?? false) : false,
      people: m.member_ids.map((id) => memberById.get(id)).filter((x) => x !== undefined),
    }));

  const openMeal = openMealId ? meals.find((m) => m.id === openMealId) : undefined;
  const swapMealRow = swapId ? meals.find((m) => m.id === swapId) : undefined;

  return (
    <>
      <MealsHeader title={title} tab="plan" error={firstParam(params.error)} message={firstParam(params.message)}>
        <div className="flex items-center gap-2">
          <IconLink href={here({ week: addDays(week, -7) })} label="Previous week" icon={CaretLeft} />
          <SoftLink href="/meals">This week</SoftLink>
          <IconLink href={here({ week: addDays(week, 7) })} label="Next week" icon={CaretRight} />
        </div>
      </MealsHeader>

      {times.length === 0 ? (
        <p className="text-xl text-ink-muted">
          No meal times are shown on the planner. <Link href="/meals/setup" className="font-bold text-accent underline">Set them up</Link>.
        </p>
      ) : (
        <PlannerBoard
          days={dates.map((d) => ({
            date: d,
            weekday: day(d, { weekday: "short" }),
            number: day(d, { day: "numeric" }),
            isToday: d === today,
            past: d < today,
            energy: modes.get(d) && modes.get(d) !== "normal" ? ENERGY_LOOK[modes.get(d)!] : null,
          }))}
          times={times.map((t) => ({ id: t.id, name: t.name, icon: t.icon, usual: t.usual_time }))}
          meals={boardMeals}
          categories={basics.categories
            .filter((c) => c.active)
            .map((c) => ({
              id: c.id,
              name: c.name,
              icon: c.icon,
              mealTimeIds: c.meal_time_ids,
              variants: basics.recipes.filter((r) => r.category_ids.includes(c.id)).length,
            }))}
          perCell={times.length <= 2 ? 3 : times.length === 3 ? 2 : 1}
          baseHref={returnTo}
        />
      )}

      {openMeal ? (
        <MealCard
          meal={openMeal}
          basics={basics}
          returnTo={here({ meal: openMeal.id })}
          closeHref={returnTo}
          swapHref={here({ swap: openMeal.id })}
          dayLabel={day(openMeal.date, { weekday: "long", month: "long", day: "numeric" })}
        />
      ) : null}
      {swapMealRow ? <SwapCard meal={swapMealRow} basics={basics} returnTo={returnTo} closeHref={here({ meal: swapMealRow.id })} /> : null}
      {cellParam ? <CellCard cell={cellParam} meals={boardMeals} times={times} here={here} dayOf={(d) => day(d, { weekday: "long", month: "long", day: "numeric" })} /> : null}
    </>
  );
}

type Basics = Awaited<ReturnType<typeof loadMealBasics>>;
type PlannedMeal = Awaited<ReturnType<typeof loadMeals>>[number];

/** The card for one planned meal: which variant, who it's for, servings, cook, swap, remove. */
function MealCard({
  meal,
  basics,
  returnTo,
  closeHref,
  swapHref,
  dayLabel,
}: {
  meal: PlannedMeal;
  basics: Basics;
  returnTo: string;
  closeHref: string;
  swapHref: string;
  dayLabel: string;
}) {
  const recipeById = new Map(basics.recipes.map((r) => [r.id, r]));
  const categoryById = new Map(basics.categories.map((c) => [c.id, c]));
  const category = meal.category_id ? categoryById.get(meal.category_id) : undefined;
  const recipe = meal.recipe_id ? recipeById.get(meal.recipe_id) : undefined;
  const variants = category ? basics.recipes.filter((r) => r.category_ids.includes(category.id)).slice(0, 8) : [];
  const time = basics.mealTimes.find((t) => t.id === meal.meal_time_id);

  return (
    <Modal
      title={mealName(meal, recipeById, categoryById)}
      icon={<Emoji emoji={mealIcon(meal, recipeById, categoryById)} className="size-14" />}
      closeHref={closeHref}
      aside={<span className="text-lg text-ink-muted">{`${dayLabel} · ${time?.name ?? ""}`}</span>}
    >
      <div className="flex flex-col gap-5">
        {category ? (
          <section>
            <h3 className="mb-2 text-xl font-bold text-ink">{recipe ? `Which ${category.name.toLowerCase()}?` : `Choose the ${category.name.toLowerCase()}`}</h3>
            {variants.length === 0 ? (
              <p className="text-lg text-ink-muted">
                {category.name} has no variants yet. <Link className="font-bold text-accent underline" href={`/meals/library?category=${category.id}`}>Add some</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2.5">
                {variants.map((v) => (
                  <form key={v.id} action={pickVariant}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="mealId" value={meal.id} />
                    <input type="hidden" name="recipeId" value={v.id} />
                    <input type="hidden" name="keepOpen" value="1" />
                    <button
                      className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border-2 px-3 text-left text-lg font-bold text-ink ${
                        v.id === meal.recipe_id ? "border-meal-ink bg-meal" : "border-frame bg-board hover:bg-rail"
                      }`}
                    >
                      <Emoji emoji={v.icon ?? category.icon} className="size-11" />
                      <span className="min-w-0 flex-1 leading-tight">{v.name}</span>
                    </button>
                  </form>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
          <form action={setMealPeople} className="flex flex-col gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="mealId" value={meal.id} />
            <Chips
              name="memberIds"
              label="Who's eating? (none ticked means everyone)"
              multiple
              defaultValue={meal.member_ids}
              options={basics.members.map((m) => ({ value: m.id, label: m.name, leading: <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" /> }))}
            />
            <Button variant="secondary" className="self-start">
              Save who
            </Button>
          </form>
          <form action={setServings} className="flex flex-col gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="mealId" value={meal.id} />
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-bold text-ink">Servings</span>
              <Input type="number" name="servings" min={1} max={50} defaultValue={meal.servings ?? recipe?.serves ?? ""} placeholder={String(recipe?.serves ?? 4)} />
            </label>
            <Button variant="secondary" className="self-start">
              Save
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-frame pt-4">
          {recipe ? (
            <Link
              href={`/meals/cook/${meal.id}`}
              className="inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] bg-ink px-6 text-lg font-bold text-board"
            >
              <CookingPot size="1.5rem" aria-hidden />
              Start cooking
            </Link>
          ) : null}
          {recipe?.is_backup ? null : (
            <SoftLink href={swapHref}>
              <ArrowsClockwise size="1.5rem" aria-hidden />
              Swap for a backup meal
            </SoftLink>
          )}
          {recipe ? (
            <SoftLink href={`/meals/library?recipe=${recipe.id}&tab=ingredients${category ? `&category=${category.id}` : ""}`}>Open the recipe</SoftLink>
          ) : null}
          <form action={removeMealForm} className="ml-auto">
            <input type="hidden" name="returnTo" value={closeHref} />
            <input type="hidden" name="mealId" value={meal.id} />
            <Button variant="danger">
              <Trash size="1.375rem" aria-hidden />
              Take off the plan
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

/** Swapping a meal for a backup one (a survival-day rescue). */
async function SwapCard({ meal, basics, returnTo, closeHref }: { meal: PlannedMeal; basics: Basics; returnTo: string; closeHref: string }) {
  const parts = await loadBackupParts();
  const backups = basics.recipes.filter((r) => r.is_backup).slice(0, 8);
  const recipeById = new Map(basics.recipes.map((r) => [r.id, r]));
  const categoryById = new Map(basics.categories.map((c) => [c.id, c]));
  const name = mealName(meal, recipeById, categoryById);
  return (
    <Modal title={`Swap ${name}`} icon={<Emoji emoji="🛟" className="size-12" />} closeHref={closeHref}>
      {backups.length === 0 ? (
        <p className="text-xl text-ink-muted">
          No backup meals yet. <Link className="font-bold text-accent underline" href="/meals/backups">Make one</Link>, like a frozen lasagne and garlic bread.
        </p>
      ) : (
        <form action={swapMeal} className="flex flex-col gap-5">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="mealId" value={meal.id} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xl font-bold text-ink">Which backup meal?</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {backups.map((b, i) => {
                const ready = readyCount(parts.filter((p) => p.recipe_id === b.id));
                return (
                  <label
                    key={b.id}
                    className="flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border-2 border-frame px-4 has-checked:border-meal-ink has-checked:bg-meal"
                  >
                    <input type="radio" name="backupId" value={b.id} defaultChecked={i === 0} className="sr-only" />
                    <Emoji emoji={b.icon ?? "🧊"} className="size-12" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xl font-bold text-ink">{b.name}</span>
                      <span className={`text-base ${ready > 0 ? "text-ink-muted" : "text-danger"}`}>
                        {ready > 0 ? `Enough for ${ready} time${ready === 1 ? "" : "s"}` : "Parts are running out"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {meal.recipe_id || meal.category_id ? (
            <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-xl text-ink">
              <input type="checkbox" name="move" defaultChecked className="size-7 accent-[var(--color-ink)]" />
              Move {name} to the next free night
            </label>
          ) : null}
          <p className="text-lg text-ink-muted">
            Fresh things from {name} (like meat) become a must-do to put away. The backup&apos;s parts count down, and any that run low are suggested for the grocery list.
          </p>
          <Button className="self-start">Swap it</Button>
        </form>
      )}
    </Modal>
  );
}

/** Everything planned in one busy slot (when they don't all fit). */
function CellCard({
  cell,
  meals,
  times,
  here,
  dayOf,
}: {
  cell: string;
  meals: BoardMeal[];
  times: { id: string; name: string }[];
  here: ReturnType<typeof linker>;
  dayOf: (d: string) => string;
}) {
  const [date, timeId] = cell.split("|");
  const list = meals.filter((m) => m.date === date && m.mealTimeId === timeId);
  const time = times.find((t) => t.id === timeId);
  if (!isLocalDate(date ?? "") || !time) return null;
  return (
    <Modal title={`${dayOf(date)} · ${time.name}`} closeHref={here({})}>
      <div className="grid grid-cols-2 gap-3">
        {list.slice(0, 10).map((m) => (
          <Link key={m.id} href={here({ meal: m.id })} scroll={false} className="flex min-h-20 items-center gap-3 rounded-2xl bg-meal px-4 text-meal-ink">
            <Emoji emoji={m.icon} className="size-12" />
            <span className="font-hand min-w-0 flex-1 text-2xl">{m.name}</span>
            <span className="flex -space-x-2">
              {m.people.map((p) => (
                <Avatar key={p.id} name={p.name} colour={p.colour} icon={p.icon} size="sm" />
              ))}
            </span>
          </Link>
        ))}
      </div>
    </Modal>
  );
}
