import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import type { Household } from "@/lib/household";
import { EATING_MINUTES, mealSlot } from "@/lib/meals";
import { placeRoutines, type Busy } from "@/lib/routine-placement";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import { mealIcon, mealName, type Meal, type MealBasics } from "./data";

/*
 * Meals on the Today screen: a block on the timeline for each meal (it
 * moves around the plans of the people eating it, like a routine), and
 * the Survival button.
 */

export type TodayMeal = {
  id: string;
  mealTimeId: string;
  name: string;
  icon: string;
  /** Who it's for; empty means everyone. */
  memberIds: string[];
  startMin: number;
  endMin: number;
  /** Minutes before eating that cooking starts. */
  cookMinutes: number;
  /** Who's cooking: they get the prep time. Null: not decided. */
  cookId: string | null;
  /** When eating starts and ends (tidying up follows, until endMin). */
  eatStart: number;
  eatEnd: number;
  cooked: boolean;
  canCook: boolean;
  backup: boolean;
  movedFor: string | null;
};

/**
 * Where today's meals sit: prep, eating, then tidying up. A shared meal
 * stays put when someone's own plans move; it only moves for its cook's
 * plans, or for a plan for the whole family (or everyone eating it).
 */
export function placeTodayMeals(
  meals: Meal[],
  basics: MealBasics,
  events: { startMin: number; endMin: number; title: string; memberIds: string[] }[],
): TodayMeal[] {
  const recipes = new Map(basics.recipes.map((r) => [r.id, r]));
  const categories = new Map(basics.categories.map((c) => [c.id, c]));
  const times = new Map(basics.mealTimes.map((t) => [t.id, t]));
  const shown = meals.filter((m) => m.status === "planned" || m.status === "cooked");
  return shown.map((m) => {
    const recipe = m.recipe_id ? (recipes.get(m.recipe_id) ?? null) : null;
    const slot = mealSlot(times.get(m.meal_time_id)?.usual_time ?? "18:00", recipe);
    const busy: Busy[] = events
      .filter(
        (e) =>
          e.memberIds.length === 0 ||
          (m.cook_id !== null && e.memberIds.includes(m.cook_id)) ||
          (m.member_ids.length > 0 && m.member_ids.every((id) => e.memberIds.includes(id))),
      )
      .map(({ startMin, endMin, title }) => ({ startMin, endMin, title }));
    const [placed] = m.status === "cooked" ? [{ startMin: slot.start, endMin: slot.start + slot.minutes, movedFor: null }] : placeRoutines([{ id: m.id, start: slot.start, minutes: slot.minutes, direction: "later" }], busy);
    return {
      id: m.id,
      mealTimeId: m.meal_time_id,
      name: mealName(m, recipes, categories),
      icon: mealIcon(m, recipes, categories),
      memberIds: m.member_ids,
      startMin: placed.startMin,
      endMin: placed.endMin,
      cookMinutes: slot.cookMinutes,
      cookId: m.cook_id,
      eatStart: placed.startMin + slot.cookMinutes,
      eatEnd: placed.startMin + slot.cookMinutes + EATING_MINUTES,
      cooked: m.status === "cooked",
      canCook: Boolean(m.recipe_id),
      backup: recipe?.is_backup ?? false,
      movedFor: placed.movedFor,
    };
  });
}

/**
 * Today's meals as routines see them: busy while eating and tidying for
 * the people eating, and busy while prepping for the cook.
 */
export function mealsForRoutines(meals: TodayMeal[]): { mealTimeId: string; eatStart: number; endMin: number; memberIds: string[]; title: string }[] {
  return meals.flatMap((m) => [
    { mealTimeId: m.mealTimeId, eatStart: m.eatStart, endMin: m.endMin, memberIds: m.memberIds, title: m.name },
    ...(m.cookId ? [{ mealTimeId: m.mealTimeId, eatStart: m.startMin, endMin: m.eatStart, memberIds: [m.cookId], title: `cooking ${m.name}` }] : []),
  ]);
}

function clock(minutes: number, date: LocalDate, household: Household): string {
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return new Intl.DateTimeFormat(household.settings.locale, { timeZone: household.settings.timeZone, hour: "numeric", minute: "2-digit" })
    .format(zonedToUtc(date, `${hh}:${mm}`, household.settings.timeZone))
    .replace(":00", "");
}

/**
 * A meal on the timeline: butter yellow, big picture, name in handwriting.
 * With a cook, the prep part sits in the cook's column ("prep") and the
 * eating and tidying in the eaters' ("eat"); without one it's all one
 * block ("whole").
 */
export function MealBlock({
  meal,
  date,
  household,
  style,
  part = "whole",
}: {
  meal: TodayMeal;
  date: LocalDate;
  household: Household;
  style: React.CSSProperties;
  part?: "whole" | "prep" | "eat";
}) {
  const eat = clock(meal.eatStart, date, household);
  const detail = meal.cooked
    ? "Cooked"
    : part === "eat"
        ? `eat ${eat}, then tidy`
        : `cook ${clock(meal.startMin, date, household)}, eat ${eat}`;
  if (part === "prep") {
    // Prep is often short on the timeline: one small line.
    return (
      <Link
        href={meal.canCook ? `/meals/cook/${meal.id}` : `/meals?meal=${meal.id}`}
        title={`${meal.name}: start cooking ${clock(meal.startMin, date, household)}, eat ${eat}`}
        className={`absolute flex items-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed border-meal-ink/50 bg-meal/60 px-2 text-meal-ink ${meal.cooked ? "opacity-60" : ""}`}
        style={style}
      >
        <Emoji emoji="🔪" className="size-5" />
        <span className="min-w-0 flex-1 truncate text-sm leading-none font-bold">
          {meal.cooked ? "Cooked" : `Cook ${clock(meal.startMin, date, household)}`}
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={meal.canCook ? `/meals/cook/${meal.id}` : `/meals?meal=${meal.id}`}
      title={`${meal.name}: start cooking ${clock(meal.startMin, date, household)}, eat ${eat}, then tidy up`}
      className={`absolute flex items-start gap-2 overflow-hidden rounded-2xl bg-meal px-2.5 py-1 text-meal-ink ${meal.cooked ? "opacity-60" : ""}`}
      style={style}
    >
      <Emoji emoji={meal.icon} className="size-9" />
      <span className="min-w-0 flex-1 truncate leading-[1.1]">
        <span className="font-hand text-2xl">{meal.name}</span>{" "}
        <span className="text-sm font-bold whitespace-nowrap">
          {detail}
          {meal.movedFor ? ` · after ${meal.movedFor}` : ""}
        </span>
      </span>
      {meal.cooked ? <Check size="1.5rem" weight="bold" className="shrink-0" aria-label="Cooked" /> : null}
    </Link>
  );
}

/**
 * The Survival button in the Today header: opens the Survival card (and
 * shows a lifebuoy-filled look once today has been a survival day).
 */
export function SurvivalButton({ used, href }: { used: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl px-3.5 text-lg font-bold ${
        used ? "bg-meal text-meal-ink" : "bg-panel text-ink"
      }`}
    >
      <Emoji emoji="🛟" className="size-8" />
      Survival
    </Link>
  );
}
