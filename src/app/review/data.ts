import { createClient } from "@/lib/supabase/server";
import { choreDaysOn, type ChoreDay } from "@/lib/chore-days";
import { dayFor } from "@/lib/day-types";
import type { Household } from "@/lib/household";
import { EATING_MINUTES, weekDates, weekStartOf } from "@/lib/meals";
import { addDays, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { lastPicksFrom, menuMealIcon, menuMealName, spotSummary } from "@/lib/menu";
import { reviewDue, type DraftMeal, type ReviewDay, type ReviewDraft } from "@/lib/weekly-review";
import { loadCalendar, rangeOf } from "../calendar/data";
import { eventsOnDay, isAllDayStyle } from "../calendar/views";
import { choreSchedule, loadChoreDayMoves } from "../chores/plan";
import { loadChoreDays } from "../chores/data";
import { loadMealBasics, loadMeals } from "../meals/data";
import { ensurePresets } from "../meals/shared";
import { loadRoutines } from "../routines/data";

/** A day on the review screen: what the checks need, plus what it shows. */
export type ReviewColumn = ReviewDay & {
  /** "Mon 16" */
  label: string;
  /** Its plans, all-day ones first, in the colour of the first person in each (no times). */
  events: { id: string; title: string; icon: string | null; memberId: string | null }[];
};

/** A dish (recipe) the review's meals can use. */
export type ReviewDish = {
  id: string;
  name: string;
  icon: string | null;
  kind_ids: string[];
  is_backup: boolean;
  serves: number;
  /** Kinds of meal it goes with (Caesar salad: Pasta, Pizza…): offered first there. */
  goes_with?: string[];
};

/** A meal on the menu, ready to pick: its spots are set dishes or kinds to pick from. */
export type ReviewMenuMeal = {
  id: string;
  name: string;
  icon: string | null;
  category_ids: string[];
  spots: { position: number; kind_id: string | null; recipe_id: string | null; batches: number }[];
  /** "2 set, 1 to pick" */
  summary: string;
};

export type ReviewData = {
  week: LocalDate;
  columns: ReviewColumn[];
  members: { id: string; name: string; colour: string; icon: string | null }[];
  dayTypes: { id: string; member_id: string; name: string; icon: string | null }[];
  choreDays: ChoreDay[];
  /** The meal blocks (Lunch, Dinner), in order. A day shows the ones someone has that day. */
  mealTimes: { id: string; name: string; icon: string | null; usual_time: string }[];
  /** Which people's kinds of day have each meal block (from the Routine Manager). */
  mealTimeUses: { meal_time_id: string; member_id: string; day_type_id: string }[];
  /** Kinds of meal. Leftovers is the blank: no dishes, no cooking, no groceries. */
  categories: { id: string; name: string; icon: string | null; is_leftovers: boolean }[];
  dishes: ReviewDish[];
  kinds: { id: string; name: string; icon: string | null }[];
  menuMeals: ReviewMenuMeal[];
  /** Last time's pick for each menu meal's open spot ("menuMealId|spot" → dish id). */
  lastPicks: Record<string, string>;
  /** The week's meals as saved (the draft holds changes to them). */
  meals: DraftMeal[];
  hardChores: { id: string; name: string }[];
  initial: ReviewDraft;
  reviewed: boolean;
};

/** The week the review looks at first: the next one. */
export function comingWeek(household: Household, today: LocalDate): LocalDate {
  return addDays(weekStartOf(today, household.settings.weekStartsOn), 7);
}

/** The review of a week, if it has been confirmed. */
async function loadWeekReview(week: LocalDate): Promise<{ dismissed: string[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("weekly_reviews").select("dismissed").eq("week_start", week).maybeSingle();
  if (error) throw error;
  return data;
}

/** Dishes picked for menu meals' open spots before this date, newest first. */
async function loadPickHistory(before: LocalDate) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("menu_meal_id, date, meal_dishes(spot_position, recipe_id)")
    .not("menu_meal_id", "is", null)
    .lt("date", before)
    .order("date", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).flatMap((m) => (m.meal_dishes ?? []).map((d) => ({ menu_meal_id: m.menu_meal_id, spot_position: d.spot_position, recipe_id: d.recipe_id })));
}

/** Whether to show the "Weekly review" reminder now. */
export async function reviewReminder(household: Household, today: LocalDate, now: Date): Promise<boolean> {
  const nextWeek = comingWeek(household, today);
  const base = { review: household.settings.weeklyReview, today, nowTime: localTimeOf(now, household.settings.timeZone), nextWeek };
  // Only ask the database when the time has come.
  if (!reviewDue({ ...base, reviewed: false })) return false;
  return !(await loadWeekReview(nextWeek));
}

/** Everything the review screen shows for a week. */
export async function loadReview(household: Household, week: LocalDate, today: LocalDate): Promise<ReviewData> {
  const { timeZone, locale } = household.settings;
  const dates = weekDates(week);
  // Preset meals ("Tuesday is Tacos") fill the week the first time it's looked at, as on the planner.
  await ensurePresets(household.id, week, today);
  const { rangeStart, rangeEnd } = rangeOf(dates, timeZone);
  const [calendar, routines, choreDays, moves, basics, meals, schedule, review, history] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(week),
    loadChoreDays(),
    loadChoreDayMoves(dates[0], dates[6]),
    loadMealBasics(),
    loadMeals(dates[0], dates[6]),
    choreSchedule(household, today, timeZone, false),
    loadWeekReview(week),
    loadPickHistory(addDays(week, 7)),
  ]);
  const dishById = new Map(basics.recipes.map((r) => [r.id, r]));
  const plannerTimes = basics.mealTimes;
  const memberIds = routines.members.map((m) => m.id);

  const columns: ReviewColumn[] = dates.map((date) => {
    const noon = zonedToUtc(date, "12:00", timeZone);
    const items = eventsOnDay(calendar.items, date, timeZone).toSorted((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    const allDay = items.filter((e) => isAllDayStyle(e, timeZone));
    const timed = items.filter((e) => !isAllDayStyle(e, timeZone));
    const shown = [...allDay, ...timed].slice(0, 12);
    const dayMeals = plannerTimes.flatMap((t) =>
      meals
        .filter((m) => m.date === date && m.meal_time_id === t.id && m.status !== "skipped" && m.status !== "swapped")
        .map((m) => {
          const start = zonedToUtc(date, m.eat_at ?? t.usual_time, timeZone).getTime();
          const end = start + (t.minutes || EATING_MINUTES) * 60_000;
          const eaters = m.member_ids.length > 0 ? m.member_ids : memberIds;
          const out = (id: string) =>
            timed.some(
              (e) =>
                (e.member_ids.length === 0 || e.member_ids.includes(id)) &&
                new Date(e.starts_at).getTime() <= start &&
                new Date(e.ends_at).getTime() >= end,
            );
          return { meal: m, time: t, everyoneOut: eaters.length > 0 && eaters.every(out) };
        }),
    );
    return {
      date,
      name: new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(noon),
      label: new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric" }).format(noon),
      past: date < today,
      away: routines.breaks.some((b) => b.away && b.start_date <= date && date <= b.end_date),
      meals: dayMeals.map(({ meal, time, everyoneOut }) => ({ id: meal.id, mealTimeName: time.name, categoryId: meal.category_id, everyoneOut })),
      events: shown.map((e) => ({
        id: `${e.id}-${e.starts_at}`,
        title: e.title,
        icon: e.icon ?? null,
        memberId: e.member_ids.find((id) => memberIds.includes(id)) ?? null,
      })),
    };
  });

  const initial: ReviewDraft = {
    choreDays: Object.fromEntries(dates.map((d) => [d, choreDaysOn(choreDays, d, moves).filter((cd) => !cd.is_free).map((cd) => cd.id)])),
    dayTypes: Object.fromEntries(
      dates.map((d) => [
        d,
        Object.fromEntries(
          routines.members.flatMap((m) => {
            const type = dayFor(m, routines, d).dayType;
            return type ? [[m.id, type.id]] : [];
          }),
        ),
      ]),
    ),
    meals: {},
    dismissed: review?.dismissed ?? [],
  };

  return {
    week,
    columns,
    members: routines.members.map((m) => ({ id: m.id, name: m.name, colour: m.colour, icon: m.icon })),
    dayTypes: routines.dayTypes.map((t) => ({ id: t.id, member_id: t.member_id, name: t.name, icon: t.icon })),
    choreDays,
    mealTimes: plannerTimes.map((t) => ({ id: t.id, name: t.name, icon: t.icon, usual_time: t.usual_time })),
    mealTimeUses: basics.mealTimeUses.map((u) => ({ meal_time_id: u.meal_time_id, member_id: u.member_id, day_type_id: u.day_type_id })),
    categories: basics.categories.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, icon: c.icon, is_leftovers: c.is_leftovers })),
    dishes: basics.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      kind_ids: r.kind_ids,
      is_backup: r.is_backup,
      serves: r.serves,
      goes_with: r.category_ids,
    })),
    kinds: basics.kinds.map((k) => ({ id: k.id, name: k.name, icon: k.icon })),
    menuMeals: basics.menuMeals.map((m) => ({
      id: m.id,
      name: menuMealName(m, dishById),
      icon: menuMealIcon(m, dishById),
      category_ids: m.category_ids,
      spots: m.spots.map((sp) => ({ position: sp.position, kind_id: sp.kind_id, recipe_id: sp.recipe_id, batches: sp.batches })),
      summary: spotSummary(m),
    })),
    lastPicks: Object.fromEntries(lastPicksFrom(history)),
    meals: meals
      .filter((m) => m.status !== "skipped" && m.status !== "swapped" && plannerTimes.some((t) => t.id === m.meal_time_id))
      .map((m) => ({
        id: m.id,
        date: m.date,
        mealTimeId: m.meal_time_id,
        categoryId: m.category_id,
        menuMealId: m.menu_meal_id,
        dishes: m.dishes.map((d) => ({ kindId: d.kind_id, recipeId: d.recipe_id, batches: d.batches, spot: d.spot_position })),
        memberIds: m.member_ids,
      })),
    hardChores: schedule.chores.filter((c) => schedule.hard.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    initial,
    reviewed: review !== null,
  };
}
