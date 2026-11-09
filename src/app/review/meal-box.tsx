"use client";

import { useState } from "react";
import { ArrowLeft, Minus, Plus, Trash } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import type { DraftMeal } from "@/lib/weekly-review";
import type { ReviewData, ReviewRecipe } from "./data";
import { Box, CloseButton, Face, Pager, Tile, type Person } from "./parts";

/*
 * The meal picker: tapping a meal tile fills the middle of the screen.
 * An empty tile opens on every kind of meal that suits the meal time; a
 * set meal opens on its kind's recipes ("Bean, Beef or Chicken tacos")
 * with Change kind to go back. Who's eating and servings are here too.
 * Everything goes into the review's draft and waits for Save.
 */

export type MealTarget = {
  /** The meal being changed, or null for an empty tile. */
  meal: DraftMeal | null;
  date: string;
  mealTimeId: string;
  /** "Dinner · Tuesday 17" */
  where: string;
};

type Mode = "kinds" | "recipes" | "backups";

const KINDS_PER_PAGE = 12;
const RECIPES_PER_PAGE = 10;

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
  const recipe = (id: string | null) => data.recipes.find((r) => r.id === id);
  const startMode: Mode = !meal ? "kinds" : meal.categoryId ? "recipes" : recipe(meal.recipeId)?.isBackup ? "backups" : "kinds";
  const [mode, setMode] = useState<Mode>(startMode);
  const [page, setPage] = useState(0);
  const go = (m: Mode) => {
    setMode(m);
    setPage(0);
  };

  const kinds = data.categories.filter((c) => c.meal_time_ids.length === 0 || c.meal_time_ids.includes(target.mealTimeId));
  const variantsOf = (categoryId: string | null): ReviewRecipe[] => data.recipes.filter((r) => !r.isBackup && categoryId !== null && r.categoryIds.includes(categoryId));
  const backups = data.recipes.filter((r) => r.isBackup);
  const kind = data.categories.find((c) => c.id === meal?.categoryId);

  const base = (): DraftMeal =>
    meal ?? { id: `new-${crypto.randomUUID()}`, date: target.date, mealTimeId: target.mealTimeId, categoryId: null, recipeId: null, memberIds: [], servings: null };

  const pickKind = (categoryId: string) => {
    const variants = variantsOf(categoryId);
    // A kind with one recipe needs no choosing.
    const next = { ...base(), categoryId, recipeId: variants.length === 1 ? variants[0].id : null };
    onChange(next);
    if (variants.length > 1) go("recipes");
    else onClose();
  };

  const look = meal ? (recipe(meal.recipeId) ?? kind) : null;
  const title = meal ? (recipe(meal.recipeId)?.name ?? kind?.name ?? "Meal") : "What's for it?";

  // --- The grid in the middle ---------------------------------------------

  let grid: React.ReactNode;
  let pages = 1;
  if (mode === "kinds") {
    pages = Math.max(1, Math.ceil(kinds.length / KINDS_PER_PAGE));
    const shown = kinds.slice(page * KINDS_PER_PAGE, (page + 1) * KINDS_PER_PAGE);
    grid =
      kinds.length === 0 ? (
        <p className="text-lg text-ink-muted">No meal categories suit this meal time yet. Add some in the Menu Manager.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-6">
          {shown.map((c) => {
            const n = variantsOf(c.id).length;
            return <Tile key={c.id} icon={c.icon} label={c.name} note={n > 1 ? `${n} types` : undefined} on={meal?.categoryId === c.id} onClick={() => pickKind(c.id)} />;
          })}
        </div>
      );
  } else if (mode === "recipes" && meal) {
    const variants = variantsOf(meal.categoryId);
    pages = Math.max(1, Math.ceil(variants.length / RECIPES_PER_PAGE));
    const shown = variants.slice(page * RECIPES_PER_PAGE, (page + 1) * RECIPES_PER_PAGE);
    grid = (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Which {kind?.name.toLowerCase() ?? "one"}?</h3>
        {variants.length === 0 ? (
          <p className="text-lg text-ink-muted">There are no recipes for {kind?.name ?? "this"} yet. It stays on the plan as {kind?.name ?? "it is"}.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-5">
            {shown.map((r) => (
              <Tile key={r.id} icon={r.icon ?? kind?.icon} label={r.name} on={meal.recipeId === r.id} onClick={() => onChange({ ...meal, recipeId: meal.recipeId === r.id ? null : r.id })} height="h-[9.5rem]" />
            ))}
          </div>
        )}
      </div>
    );
  } else {
    pages = Math.max(1, Math.ceil(backups.length / KINDS_PER_PAGE));
    const shown = backups.slice(page * KINDS_PER_PAGE, (page + 1) * KINDS_PER_PAGE);
    grid = (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Backup meals</h3>
        {backups.length === 0 ? (
          <p className="text-lg text-ink-muted">No backup meals yet. Add them in the Menu Manager.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-6">
            {shown.map((r) => (
              <Tile
                key={r.id}
                icon={r.icon}
                label={r.name}
                on={meal?.recipeId === r.id}
                onClick={() => {
                  onChange({ ...base(), categoryId: null, recipeId: r.id });
                  onClose();
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Who's eating and servings (for a meal that's set) ------------------

  const toggle = (id: string) => {
    if (!meal) return;
    const now = meal.memberIds.length === 0 ? [] : meal.memberIds;
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    onChange({ ...meal, memberIds: next.length >= members.length ? [] : next });
  };
  const serves = recipe(meal?.recipeId ?? null)?.serves ?? members.length;
  const servings = meal?.servings ?? null;
  const setServings = (n: number) => meal && onChange({ ...meal, servings: Math.min(50, Math.max(1, n)) });

  return (
    <Box label={`${title}, ${target.where}`} width="w-[86rem]" onClose={onClose}>
      <div className="flex items-center gap-4">
        {look ? <Emoji emoji={look.icon ?? "🍽️"} className="size-16" /> : <Emoji emoji="🍽️" className="size-16" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-4xl font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
          <p className="text-lg font-bold text-ink-muted">{target.where}</p>
        </div>
        {mode !== "kinds" ? (
          <button type="button" onClick={() => go("kinds")} className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel">
            <ArrowLeft size="1.25rem" weight="bold" aria-hidden />
            Change category
          </button>
        ) : null}
        <CloseButton onClick={onClose} />
      </div>

      {grid}

      {meal && mode === "recipes" ? (
        <div className="flex flex-wrap items-start gap-x-14 gap-y-4">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Who&rsquo;s eating? (none picked means everyone)</h3>
            <div className="flex flex-wrap gap-2.5">
              {members.map((m) => {
                const on = meal.memberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    className={`flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-full border-2 pr-5 pl-2 text-lg font-bold ${on ? "border-ink bg-rail text-ink" : "border-frame text-ink"}`}
                  >
                    <Face person={m} size="size-10 text-base" />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Servings</h3>
            <div className="flex items-center gap-3.5">
              <button type="button" aria-label="Fewer" onClick={() => setServings((servings ?? serves) - 1)} className="flex size-[var(--touch-target)] items-center justify-center rounded-2xl bg-rail text-ink hover:bg-panel">
                <Minus size="1.5rem" weight="bold" aria-hidden />
              </button>
              <span className="min-w-12 text-center text-2xl font-extrabold text-ink tabular-nums">{servings ?? serves}</span>
              <button type="button" aria-label="More" onClick={() => setServings((servings ?? serves) + 1)} className="flex size-[var(--touch-target)] items-center justify-center rounded-2xl bg-rail text-ink hover:bg-panel">
                <Plus size="1.5rem" weight="bold" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-frame pt-4.5">
        {mode !== "backups" && backups.length > 0 ? (
          <button type="button" onClick={() => go("backups")} className="flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-2xl bg-meal px-5 text-lg font-bold text-meal-ink">
            <Emoji emoji="🥫" className="size-7" />
            Use a backup meal
          </button>
        ) : null}
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
