"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowsClockwise, Plus, Trash, X } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import { newId } from "@/lib/ids";
import { BATCHES } from "@/lib/meals";
import { dishesOfKind, mainDish, mealsUnder, startDishes, type DraftDish } from "@/lib/menu";
import type { DraftMeal } from "@/lib/weekly-review";
import type { ReviewData, ReviewDish, ReviewMenuMeal } from "./data";
import { addQuickDish, saveAsMeal } from "./menu-actions";
import { Box, CloseButton, Face, Pager, Tile, type Person } from "./parts";

/*
 * The meal picker (Connor, 2026-11-10). Tapping a meal tile fills the
 * middle of the screen.
 *
 *   1. Kinds of meal (Tacos, Meat & veggies…), plus Custom meal.
 *   2. The meals under a kind: set meals ("Steak and baked potatoes"),
 *      meals with sides to pick ("Pork chops + Mashed potatoes + Veggie")
 *      and Custom meal. Only meals show here, never single dishes.
 *   3. The plate: every dish of the meal, each with ×1/×2/×3 batches and
 *      Swap (for this day only), open spots to pick, + Dish for a starter,
 *      side or dessert, who's eating, and Save as meal.
 *
 * Everything goes into the review's draft and waits for Save, except a
 * quick new dish and Save as meal, which change the menu itself.
 */

export type MealTarget = {
  /** The meal being changed, or null for an empty tile. */
  meal: DraftMeal | null;
  date: string;
  mealTimeId: string;
  /** "Dinner · Tuesday 17" */
  where: string;
  /** Who a new meal is for: the people with this meal block that day (empty: everyone). */
  eaters: string[];
};

type Mode = { name: "kinds" } | { name: "meals"; categoryId: string } | { name: "plate" } | { name: "backups" };

const KINDS_PER_PAGE = 11;
const MEALS_PER_PAGE = 5;
const DISHES_PER_PAGE = 8;
const PICKS_PER_PAGE = 8;

const ink = "text-[color-mix(in_srgb,var(--color-meal-ink)_70%,var(--color-meal))]";

export function MealBox({
  target,
  data,
  members,
  onChange,
  onRemove,
  onAddAnother,
  onClose,
}: {
  target: MealTarget;
  data: ReviewData;
  members: Person[];
  /** Saves the meal into the draft (a new one gets its id here). */
  onChange: (meal: DraftMeal) => void;
  onRemove: (mealId: string) => void;
  /** Another meal in the same meal time, for some people. */
  onAddAnother: () => void;
  onClose: () => void;
}) {
  const meal = target.meal;
  // Dishes and meals made here (quick dishes, Save as meal) until the page catches up.
  const [newDishes, setNewDishes] = useState<ReviewDish[]>([]);
  const [newMeals, setNewMeals] = useState<ReviewMenuMeal[]>([]);
  const dishes = [...data.dishes, ...newDishes.filter((d) => !data.dishes.some((x) => x.id === d.id))];
  const menuMeals = [...data.menuMeals, ...newMeals.filter((m) => !data.menuMeals.some((x) => x.id === m.id))];
  const dish = new Map(dishes.map((d) => [d.id, d]));
  const kind = new Map(data.kinds.map((k) => [k.id, k]));
  const known = new Set(dishes.map((d) => d.id));
  const lastPicks = new Map(Object.entries(data.lastPicks));

  const blankId = data.categories.find((c) => c.is_leftovers)?.id ?? null;
  const startMode: Mode =
    !meal ? { name: "kinds" } : meal.dishes.length > 0 ? { name: "plate" } : meal.categoryId && meal.categoryId !== blankId ? { name: "meals", categoryId: meal.categoryId } : { name: "kinds" };
  const [mode, setMode] = useState<Mode>(startMode);
  const [page, setPage] = useState(0);
  const go = (m: Mode) => {
    setMode(m);
    setPage(0);
  };

  // Leftovers isn't a kind with meals in it: it has its own tile, last.
  const categories = data.categories.filter((c) => !c.is_leftovers);
  const blank = blankId ? data.categories.find((c) => c.id === blankId) : undefined;
  const category = new Map(data.categories.map((c) => [c.id, c]));
  const backups = dishes.filter((r) => r.is_backup);

  const base = (): DraftMeal =>
    meal ?? { id: `new-${newId()}`, date: target.date, mealTimeId: target.mealTimeId, categoryId: null, menuMealId: null, dishes: [], memberIds: target.eaters };

  /** Leftovers: a blank on the plan. No dishes, so no cooking, heads-ups or groceries. */
  const pickBlank = () => {
    if (!blankId) return;
    onChange({ ...base(), categoryId: blankId, menuMealId: null, dishes: [] });
    onClose();
  };

  const pickMeal = (m: ReviewMenuMeal, categoryId: string | null) => {
    const next = { ...base(), categoryId, menuMealId: m.id, dishes: startDishes(m, lastPicks, known) };
    onChange(next);
    // A one-dish meal is done; one with sides opens on its plate.
    if (next.dishes.length === 1 && next.dishes[0].recipeId) onClose();
    else go({ name: "plate" });
  };

  const pickCategory = (categoryId: string) => {
    const options = mealsUnder(menuMeals, categoryId);
    if (options.length === 1) return pickMeal(options[0], categoryId);
    // Several (or none yet): it stays on the plan as the kind until one is picked.
    onChange({ ...base(), categoryId, menuMealId: null, dishes: [] });
    go({ name: "meals", categoryId });
  };

  const startCustom = (categoryId: string | null) => {
    const main = data.kinds.find((k) => k.name.toLowerCase() === "main") ?? null;
    onChange({ ...base(), categoryId, menuMealId: null, dishes: [{ kindId: main?.id ?? null, recipeId: null, batches: 1, spot: null }] });
    go({ name: "plate" });
  };

  const mainId = meal ? mainDish(meal.dishes) : null;
  const menuMeal = meal?.menuMealId ? menuMeals.find((m) => m.id === meal.menuMealId) : undefined;
  const title = meal ? (menuMeal?.name ?? (mainId ? dish.get(mainId)?.name : undefined) ?? category.get(meal.categoryId ?? "")?.name ?? "Custom meal") : `What's for ${target.where.split(" · ")[0].toLowerCase()}?`;
  const icon = meal ? (menuMeal?.icon ?? (mainId ? dish.get(mainId)?.icon : undefined) ?? category.get(meal.categoryId ?? "")?.icon ?? "🍽️") : "🍽️";

  // --- The middle -----------------------------------------------------------

  let body: React.ReactNode = null;
  let pages = 1;
  if (mode.name === "kinds") {
    // Leftovers and Custom meal take the last two spots on every page.
    const per = blank ? KINDS_PER_PAGE - 1 : KINDS_PER_PAGE;
    pages = Math.max(1, Math.ceil(categories.length / per));
    const shown = categories.slice(page * per, (page + 1) * per);
    body = (
      <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-6">
        {shown.map((c) => {
          const n = mealsUnder(menuMeals, c.id).length;
          return <Tile key={c.id} icon={c.icon} label={c.name} note={n > 1 ? `${n} meals` : undefined} on={meal?.categoryId === c.id} onClick={() => pickCategory(c.id)} />;
        })}
        {blank ? <Tile icon={blank.icon} label={blank.name} note="No cooking" on={meal?.categoryId === blank.id} onClick={pickBlank} /> : null}
        <CustomTile onClick={() => startCustom(null)} />
      </div>
    );
  } else if (mode.name === "meals") {
    const c = category.get(mode.categoryId);
    const options = mealsUnder(menuMeals, mode.categoryId);
    pages = Math.max(1, Math.ceil((options.length + 1) / (MEALS_PER_PAGE + 1)));
    const shown = options.slice(page * MEALS_PER_PAGE, (page + 1) * MEALS_PER_PAGE);
    body = (
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[repeat(2,minmax(0,15rem))] gap-4">
        {shown.map((m) => (
          <MealCard key={m.id} meal={m} dish={dish} kind={kind} on={meal?.menuMealId === m.id} onClick={() => pickMeal(m, mode.categoryId)} />
        ))}
        <button
          type="button"
          onClick={() => startCustom(mode.categoryId)}
          className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-[1.375rem] border-[3px] border-dashed border-check-border bg-rail p-5 text-center text-ink hover:bg-panel"
        >
          <Plus size="3rem" weight="bold" aria-hidden className="text-ink-muted" />
          <span className="text-2xl font-extrabold">Custom meal</span>
          <span className="text-base text-ink-muted">Pick a {c?.name.toLowerCase() ?? ""} main, then add sides</span>
        </button>
        {options.length === 0 ? <p className="col-span-2 self-center text-lg text-ink-muted">No meals under {c?.name ?? "this"} yet. Add them in the Menu Manager, or make a custom one.</p> : null}
      </div>
    );
  } else if (mode.name === "backups") {
    pages = Math.max(1, Math.ceil(backups.length / KINDS_PER_PAGE));
    const shown = backups.slice(page * KINDS_PER_PAGE, (page + 1) * KINDS_PER_PAGE);
    body = (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Backup meals</h3>
        {backups.length === 0 ? <p className="text-lg text-ink-muted">No backup meals yet.</p> : null}
        <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-6">
          {shown.map((r) => (
            <Tile
              key={r.id}
              icon={r.icon}
              label={r.name}
              on={mainId === r.id}
              onClick={() => {
                onChange({ ...base(), categoryId: null, menuMealId: null, dishes: [{ kindId: null, recipeId: r.id, batches: 1, spot: null }] });
                onClose();
              }}
            />
          ))}
        </div>
      </div>
    );
  } else if (meal) {
    body = (
      <Plate
        meal={meal}
        dishes={dishes}
        dish={dish}
        kinds={data.kinds}
        categories={categories}
        members={members}
        onChange={onChange}
        onDish={(d) => setNewDishes((x) => [...x, d])}
        onSavedMeal={(m) => {
          setNewMeals((x) => [...x, m]);
          onChange({ ...meal, menuMealId: m.id, categoryId: meal.categoryId ?? m.category_ids[0] ?? null });
        }}
      />
    );
  }

  const back =
    mode.name === "plate"
      ? meal?.categoryId
        ? { label: "Change meal", to: { name: "meals", categoryId: meal.categoryId } as Mode }
        : { label: "Change meal", to: { name: "kinds" } as Mode }
      : mode.name === "meals" || mode.name === "backups"
        ? { label: "All kinds", to: { name: "kinds" } as Mode }
        : null;

  return (
    <Box label={`${title}, ${target.where}`} width="w-[90rem]" onClose={onClose}>
      <div className="flex shrink-0 items-center gap-4">
        {back ? (
          <button type="button" onClick={() => go(back.to)} className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel">
            <ArrowLeft size="1.25rem" weight="bold" aria-hidden />
            {back.label}
          </button>
        ) : null}
        <Emoji emoji={mode.name === "meals" ? (category.get(mode.categoryId)?.icon ?? icon) : icon} className="size-16" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-4xl font-extrabold tracking-[-0.02em] text-ink">{mode.name === "meals" ? (category.get(mode.categoryId)?.name ?? title) : title}</h2>
          <p className="text-lg font-bold text-ink-muted">{target.where}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div className={`flex min-h-0 flex-col ${mode.name === "meals" || mode.name === "plate" ? "h-[41rem]" : ""}`}>{body}</div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-frame pt-4.5">
        {/* "Use a backup meal" is hidden for now (Connor, 2026-11-10); it returns with backup meals. */}
        {meal ? (
          <button type="button" onClick={onAddAnother} className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel">
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Another meal for some people
          </button>
        ) : null}
        <div className="flex-1" />
        <Pager page={page} pages={pages} setPage={setPage} />
        {meal ? (
          <button
            type="button"
            onClick={() => {
              onRemove(meal.id);
              onClose();
            }}
            className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--color-danger)_9%,white)] px-5 text-lg font-bold text-danger"
          >
            <Trash size="1.25rem" weight="bold" aria-hidden />
            Take off the plan
          </button>
        ) : null}
        {meal ? (
          <button type="button" onClick={onClose} className="flex min-h-[var(--touch-target)] items-center rounded-2xl bg-ink px-6 text-lg font-bold text-board">
            Done
          </button>
        ) : null}
      </div>
    </Box>
  );
}

function CustomTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[10.5rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.375rem] border-[3px] border-dashed border-check-border bg-board px-2 text-center text-lg leading-tight font-extrabold text-ink hover:bg-rail"
    >
      <Plus size="2.75rem" weight="bold" aria-hidden className="text-ink-muted" />
      Custom meal
      <span className="text-sm font-bold text-ink-muted">Any main, any sides</span>
    </button>
  );
}

/** A meal on the menu as a card: its dishes' pictures, its name, set dishes and the ones to pick. */
function MealCard({
  meal,
  dish,
  kind,
  on,
  onClick,
}: {
  meal: ReviewMenuMeal;
  dish: Map<string, ReviewDish>;
  kind: Map<string, { name: string }>;
  on: boolean;
  onClick: () => void;
}) {
  const spots = meal.spots.toSorted((a, b) => a.position - b.position);
  const pictures = spots.flatMap((s) => (s.recipe_id && dish.get(s.recipe_id)?.icon ? [dish.get(s.recipe_id)!.icon!] : [])).slice(0, 3);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-[1.375rem] border-[3px] p-4.5 text-left ${on ? "border-meal-ink bg-meal" : "border-frame bg-board hover:bg-rail"}`}
    >
      <span className="flex shrink-0">
        {(pictures.length ? pictures : [meal.icon ?? "🍽️"]).map((p, i) => (
          <span key={i} className={i > 0 ? "-ml-3" : ""}>
            <Emoji emoji={p} className="size-14" />
          </span>
        ))}
      </span>
      <span className="shrink-0 truncate text-2xl leading-tight font-extrabold text-ink">{meal.name}</span>
      <span className="flex min-w-0 shrink-0 gap-1.5 overflow-hidden">
        {spots.slice(0, 4).map((s) =>
          s.recipe_id ? (
            <span key={s.position} className="min-w-0 truncate rounded-xl bg-meal px-3 py-1 text-base font-bold text-meal-ink">
              {dish.get(s.recipe_id)?.name ?? "Dish"}
            </span>
          ) : (
            <span key={s.position} className={`shrink-0 rounded-xl border-2 border-dashed border-[color-mix(in_srgb,var(--color-meal-ink)_45%,white)] px-3 py-0.5 text-base font-bold ${ink}`}>
              + {kind.get(s.kind_id ?? "")?.name ?? "Dish"}
            </span>
          ),
        )}
        {spots.length > 4 ? <span className="shrink-0 px-1 py-1 text-base font-bold text-ink-muted">+{spots.length - 4}</span> : null}
      </span>
      <span className="mt-auto shrink-0 text-sm font-bold text-ink-muted">{meal.summary}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The plate
// ---------------------------------------------------------------------------

type Picking = { index: number; kindId: string | null } | null;

function Plate({
  meal,
  dishes,
  dish,
  kinds,
  categories,
  members,
  onChange,
  onDish,
  onSavedMeal,
}: {
  meal: DraftMeal;
  dishes: ReviewDish[];
  dish: Map<string, ReviewDish>;
  kinds: ReviewData["kinds"];
  categories: ReviewData["categories"];
  members: Person[];
  onChange: (meal: DraftMeal) => void;
  onDish: (d: ReviewDish) => void;
  onSavedMeal: (m: ReviewMenuMeal) => void;
}) {
  const firstOpen = meal.dishes.findIndex((d) => d.recipeId === null);
  const [picking, setPicking] = useState<Picking>(firstOpen >= 0 ? { index: firstOpen, kindId: meal.dishes[firstOpen].kindId } : null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const kind = new Map(kinds.map((k) => [k.id, k]));
  const pages = Math.max(1, Math.ceil(meal.dishes.length / DISHES_PER_PAGE));
  const p = Math.min(page, pages - 1);

  const setDishes = (next: DraftDish[]) => onChange({ ...meal, dishes: next });
  const patch = (i: number, change: Partial<DraftDish>) => setDishes(meal.dishes.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const add = (kindId: string | null) => {
    const next = [...meal.dishes, { kindId, recipeId: null, batches: 1, spot: null }];
    setDishes(next);
    setPicking({ index: next.length - 1, kindId });
    setPage(Math.floor((next.length - 1) / DISHES_PER_PAGE));
  };
  const remove = (i: number) => {
    setDishes(meal.dishes.filter((_, j) => j !== i));
    setPicking(null);
  };
  const shortcut = (name: string) => kinds.find((k) => k.name.toLowerCase() === name);
  const shortcuts = ["starter", "dessert"].map(shortcut).filter((k): k is NonNullable<typeof k> => Boolean(k));

  const toggle = (id: string) => {
    const now = meal.memberIds.length === 0 ? [] : meal.memberIds;
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    onChange({ ...meal, memberIds: next.length >= members.length ? [] : next });
  };

  return (
    <div className="flex min-h-0 flex-1 gap-8 pt-1">
      <div className="flex w-[46rem] shrink-0 flex-col gap-2.5">
        {meal.dishes.slice(p * DISHES_PER_PAGE, (p + 1) * DISHES_PER_PAGE).map((d, k) => {
          const i = p * DISHES_PER_PAGE + k;
          const r = d.recipeId ? dish.get(d.recipeId) : undefined;
          const kindName = kind.get(d.kindId ?? "")?.name ?? "Dish";
          const active = picking?.index === i;
          return (
            <div
              key={i}
              className={`flex min-h-[4.5rem] items-center gap-3.5 rounded-[1.25rem] border-2 px-3.5 py-1.5 ${active ? "border-accent shadow-[0_0_0_3px_var(--color-person-blue-soft)]" : "border-frame"} ${r ? "bg-board" : "border-dashed bg-rail"}`}
            >
              <Emoji emoji={r?.icon ?? kind.get(d.kindId ?? "")?.icon ?? "🍽️"} className="size-12" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`text-sm font-extrabold tracking-wide uppercase ${active ? "text-accent" : "text-ink-muted"}`}>{active ? `${kindName} · picking` : kindName}</span>
                <span className="truncate text-xl font-extrabold text-ink">{r?.name ?? `Pick a ${kindName.toLowerCase()}`}</span>
              </span>
              <div className="flex rounded-2xl bg-panel p-1" role="group" aria-label={`Batches of ${r?.name ?? kindName}`}>
                {BATCHES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={d.batches === n}
                    onClick={() => patch(i, { batches: n })}
                    className={`min-h-12 min-w-14 rounded-xl text-lg font-extrabold ${d.batches === n ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.15)]" : "text-ink-muted"}`}
                  >
                    ×{n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPicking(active ? null : { index: i, kindId: d.kindId })}
                className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl px-4 text-lg font-bold ${active ? "bg-accent text-board" : "bg-rail text-ink hover:bg-panel"}`}
              >
                <ArrowsClockwise size="1.25rem" weight="bold" aria-hidden />
                {r ? "Swap" : "Pick"}
              </button>
              <button type="button" aria-label={`Take ${r?.name ?? kindName} off this meal`} onClick={() => remove(i)} className="flex size-12 items-center justify-center rounded-full text-ink-muted hover:bg-rail">
                <X size="1.25rem" weight="bold" aria-hidden />
              </button>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <span className="text-base font-bold text-ink-soft">Add</span>
          <button type="button" onClick={() => add(null)} className="flex min-h-[var(--touch-target)] items-center gap-1.5 rounded-2xl bg-rail px-4 text-lg font-bold text-ink hover:bg-panel">
            <Plus size="1.125rem" weight="bold" aria-hidden />
            Side
          </button>
          {shortcuts.map((k) => (
            <button key={k.id} type="button" onClick={() => add(k.id)} className="flex min-h-[var(--touch-target)] items-center gap-1.5 rounded-2xl bg-rail px-4 text-lg font-bold text-ink hover:bg-panel">
              <Plus size="1.125rem" weight="bold" aria-hidden />
              {k.name}
            </button>
          ))}
          <div className="flex-1" />
          <Pager page={p} pages={pages} setPage={setPage} />
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <span className="text-sm font-bold tracking-wide text-ink-muted uppercase">Who&rsquo;s eating? (none picked means everyone)</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = meal.memberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-full border-2 pr-4 pl-1.5 text-lg font-bold ${on ? "border-ink bg-rail text-ink" : "border-frame text-ink"}`}
                >
                  <Face person={m} size="size-10 text-base" />
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 border-l-2 border-frame pl-8">
        {saving ? (
          <SaveAsMeal meal={meal} categories={categories} onCancel={() => setSaving(false)} onSaved={(m) => (setSaving(false), onSavedMeal(m))} />
        ) : picking ? (
          <DishPicker
            key={`${picking.index}|${picking.kindId}`}
            current={meal.dishes[picking.index]?.recipeId ?? null}
            startKind={picking.kindId}
            goesWith={meal.categoryId ? (categories.find((c) => c.id === meal.categoryId) ?? null) : null}
            dishes={dishes}
            kinds={kinds}
            onDish={onDish}
            onPick={(recipeId, kindId) => {
              const next = meal.dishes.map((d, j) => (j === picking.index ? { ...d, recipeId, kindId: d.kindId ?? kindId } : d));
              setDishes(next);
              const open = next.findIndex((d) => d.recipeId === null);
              setPicking(open >= 0 ? { index: open, kindId: next[open].kindId } : null);
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <p className="text-xl text-ink-soft">Swap a dish for this day only, or pick ×2 or ×3 for leftovers or guests.</p>
            <p className="text-lg text-ink-muted">Batches are whole numbers, so the grocery list never asks for half an onion.</p>
            <div className="mt-auto flex flex-col gap-2 rounded-2xl bg-rail p-4">
              <span className="text-lg font-bold text-ink">Want this exact meal again?</span>
              <span className="text-base text-ink-muted">Save it as a meal and it shows up under its kind next time, ready to place.</span>
              <button
                type="button"
                onClick={() => setSaving(true)}
                disabled={!meal.dishes.some((d) => d.recipeId)}
                className="mt-1 flex min-h-[var(--touch-target)] items-center justify-center rounded-2xl bg-board text-lg font-bold text-ink shadow-[0_0_0_2px_var(--color-frame)] disabled:opacity-50"
              >
                Save as meal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Picks a dish for one spot: the spot's kind first, any dish, or a quick new one. */
function DishPicker({
  current,
  startKind,
  goesWith,
  dishes,
  kinds,
  onPick,
  onDish,
}: {
  current: string | null;
  startKind: string | null;
  /** The meal's kind (Pasta night): dishes that go with it come first. */
  goesWith: { id: string; name: string } | null;
  dishes: ReviewDish[];
  kinds: ReviewData["kinds"];
  onPick: (recipeId: string, kindId: string | null) => void;
  onDish: (d: ReviewDish) => void;
}) {
  // A spot with a kind starts on it; a side added with no kind starts on the sides.
  const sides = kinds.filter((k) => !["main", "starter", "dessert"].includes(k.name.toLowerCase()));
  const [tab, setTab] = useState<string | null>(startKind ?? sides[0]?.id ?? null);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tabs = startKind ? [startKind] : sides.map((k) => k.id);
  const kindName = (id: string | null) => kinds.find((k) => k.id === id)?.name ?? "Dish";
  const pairs = (d: ReviewDish) => Boolean(goesWith && d.goes_with?.includes(goesWith.id));
  // The dish on the plate first, then the ones that go with this kind of meal, then the rest.
  const list = dishesOfKind(dishes, tab).toSorted(
    (a, b) => (a.id === current ? -1 : b.id === current ? 1 : Number(pairs(b)) - Number(pairs(a)) || a.name.localeCompare(b.name)),
  );
  const pages = Math.max(1, Math.ceil((list.length + 1) / (PICKS_PER_PAGE + 1)));
  const p = Math.min(page, pages - 1);
  const shown = list.slice(p * PICKS_PER_PAGE, (p + 1) * PICKS_PER_PAGE);

  const make = () =>
    start(async () => {
      const result = await addQuickDish({ name, icon: null, kindId: tab });
      if (!result.ok) return setError(result.error);
      onDish(result.dish);
      setAdding(false);
      setName("");
      onPick(result.dish.id, tab);
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-2xl font-extrabold text-ink">Pick {tab ? `a ${kindName(tab).toLowerCase()}` : "a dish"}</span>
        <div className="flex flex-wrap gap-1 rounded-2xl bg-panel p-1">
          {[...tabs, null].map((id) => (
            <button
              key={id ?? "any"}
              type="button"
              onClick={() => (setTab(id), setPage(0))}
              aria-pressed={tab === id}
              className={`min-h-12 rounded-xl px-4 text-base font-bold ${tab === id ? "bg-ink text-board" : "text-ink-soft"}`}
            >
              {id ? kindName(id) : "Any dish"}
            </button>
          ))}
        </div>
      </div>
      {adding ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-rail p-4">
          <label className="flex flex-col gap-1.5 text-base font-bold text-ink">
            New {tab ? kindName(tab).toLowerCase() : "dish"}
            <input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && make()}
              placeholder="Green beans"
              className="min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-xl text-ink outline-none focus:border-accent"
            />
          </label>
          <span className="text-base text-ink-muted">Add its ingredients later in the Menu Manager, so they go on the grocery list.</span>
          {error ? <span className="text-base font-bold text-danger">{error}</span> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="min-h-[var(--touch-target)] flex-1 rounded-2xl bg-board text-lg font-bold text-ink">
              Back
            </button>
            <button type="button" disabled={!name.trim() || pending} onClick={make} className="min-h-[var(--touch-target)] flex-1 rounded-2xl bg-ink text-lg font-bold text-board disabled:opacity-50">
              {pending ? "Adding…" : "Add and pick"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[repeat(3,minmax(0,1fr))] gap-3">
          {shown.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d.id, tab)}
              aria-pressed={d.id === current}
              className={`flex min-h-0 min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.25rem] border-[3px] px-2 text-center ${d.id === current ? "border-accent bg-[color-mix(in_srgb,var(--color-accent)_7%,white)]" : "border-frame bg-board hover:bg-rail"}`}
            >
              <Emoji emoji={d.icon ?? "🍽️"} className="size-14" />
              <span className="line-clamp-2 text-lg leading-tight font-extrabold text-ink">{d.name}</span>
              {d.id === current ? (
                <span className="text-sm font-bold text-accent">On the plate</span>
              ) : pairs(d) && goesWith ? (
                <span className="truncate text-sm font-bold text-ink-muted">Goes with {goesWith.name}</span>
              ) : null}
            </button>
          ))}
          {p === pages - 1 ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.25rem] border-[3px] border-dashed border-check-border bg-rail px-2 text-center text-ink hover:bg-panel"
            >
              <Plus size="2.25rem" weight="bold" aria-hidden className="text-ink-muted" />
              <span className="text-lg font-extrabold">Quick dish</span>
              <span className="text-sm text-ink-muted">Just a name</span>
            </button>
          ) : null}
        </div>
      )}
      {!adding && pages > 1 ? (
        <div className="flex shrink-0 justify-end">
          <Pager page={p} pages={pages} setPage={setPage} />
        </div>
      ) : null}
    </div>
  );
}

/** Keeps the plate as a meal on the menu: a name and the kinds of meal it shows under. */
function SaveAsMeal({
  meal,
  categories,
  onCancel,
  onSaved,
}: {
  meal: DraftMeal;
  categories: ReviewData["categories"];
  onCancel: () => void;
  onSaved: (m: ReviewMenuMeal) => void;
}) {
  const [name, setName] = useState("");
  const [cats, setCats] = useState<string[]>(meal.categoryId ? [meal.categoryId] : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const result = await saveAsMeal({ name, icon: null, categoryIds: cats, dishes: meal.dishes });
      if (!result.ok) return setError(result.error);
      onSaved(result.meal);
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl bg-rail p-5">
      <span className="text-2xl font-extrabold text-ink">Save as meal</span>
      <label className="flex flex-col gap-1.5 text-base font-bold text-ink-soft">
        Name
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Thanksgiving dinner"
          className="min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-xl font-bold text-ink outline-none focus:border-accent"
        />
      </label>
      <div className="flex min-h-0 flex-col gap-2">
        <span className="text-base font-bold text-ink-soft">Shows under</span>
        <div className="flex flex-wrap gap-2 overflow-hidden">
          {categories.slice(0, 12).map((c) => {
            const on = cats.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
                className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 text-base font-bold ${on ? "border-ink bg-rail text-ink" : "border-frame bg-board text-ink"}`}
              >
                <Emoji emoji={c.icon} className="size-6" />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
      <span className="text-base text-ink-muted">Next time it comes with these dishes. You can still swap any of them.</span>
      {error ? <span className="text-base font-bold text-danger">{error}</span> : null}
      <div className="mt-auto flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-[var(--touch-target)] flex-1 rounded-2xl bg-board text-lg font-bold text-ink">
          Not now
        </button>
        <button type="button" disabled={!name.trim() || pending} onClick={save} className="min-h-[var(--touch-target)] flex-1 rounded-2xl bg-accent text-lg font-bold text-board disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
