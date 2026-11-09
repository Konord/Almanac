import { createClient } from "@/lib/supabase/server";
import { choreDaysOn, type ChoreDay } from "@/lib/chore-days";
import { dayFor } from "@/lib/day-types";
import type { Household } from "@/lib/household";
import { EATING_MINUTES, weekDates, weekStartOf } from "@/lib/meals";
import { addDays, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { reviewDue, type ReviewDay, type ReviewDraft } from "@/lib/weekly-review";
import { loadCalendar, profilesFor, rangeOf } from "../calendar/data";
import { eventsOnDay, isAllDayStyle, shortTime } from "../calendar/views";
import { choreSchedule, loadChoreDayMoves } from "../chores/plan";
import { loadChoreDays } from "../chores/data";
import { loadMealBasics, loadMeals, mealIcon, mealName } from "../meals/data";
import { ensurePresets } from "../meals/shared";
import { loadRoutines } from "../routines/data";

/** A day on the review screen: what the checks need, plus what it shows. */
export type ReviewColumn = ReviewDay & {
  /** "Mon 16" */
  label: string;
  /** A glance at its plans: the first few, with times. */
  events: { id: string; time: string | null; title: string; icon: string | null }[];
  moreEvents: number;
  /** How each meal looks before any swap. */
  mealLooks: Record<string, { title: string; icon: string }>;
};

export type ReviewData = {
  week: LocalDate;
  columns: ReviewColumn[];
  members: { id: string; name: string; colour: string; icon: string | null }[];
  dayTypes: { id: string; member_id: string; name: string; icon: string | null }[];
  choreDays: ChoreDay[];
  /** Meal themes to swap to, and which meal times each suits (empty: any). */
  categories: { id: string; name: string; icon: string | null; meal_time_ids: string[] }[];
  /** Meal id → its meal time, for the swap picker. */
  mealTimeOf: Record<string, string>;
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
  const [calendar, routines, choreDays, moves, basics, meals, schedule, review] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(week),
    loadChoreDays(),
    loadChoreDayMoves(dates[0], dates[6]),
    loadMealBasics(),
    loadMeals(dates[0], dates[6]),
    choreSchedule(household, today, timeZone, false),
    loadWeekReview(week),
  ]);
  const profiles = profilesFor(dates, calendar.items, calendar.layers, household);
  const recipes = new Map(basics.recipes.map((r) => [r.id, r]));
  const categories = new Map(basics.categories.map((c) => [c.id, c]));
  const plannerTimes = basics.mealTimes.filter((t) => t.show_on_planner);
  const memberIds = routines.members.map((m) => m.id);

  const columns: ReviewColumn[] = dates.map((date) => {
    const noon = zonedToUtc(date, "12:00", timeZone);
    const items = eventsOnDay(calendar.items, date, timeZone).toSorted((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    const allDay = items.filter((e) => isAllDayStyle(e, timeZone));
    const timed = items.filter((e) => !isAllDayStyle(e, timeZone));
    const shown = [...allDay, ...timed];
    const dayMeals = plannerTimes.flatMap((t) =>
      meals
        .filter((m) => m.date === date && m.meal_time_id === t.id && m.status !== "skipped")
        .map((m) => {
          const start = zonedToUtc(date, t.usual_time, timeZone).getTime();
          const end = start + EATING_MINUTES * 60_000;
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
    const profile = profiles.get(date);
    return {
      date,
      name: new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(noon),
      label: new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric" }).format(noon),
      past: date < today,
      away: routines.breaks.some((b) => b.away && b.start_date <= date && date <= b.end_date),
      busy: profile?.kind === "busy",
      busyMinutes: profile?.busyMinutes ?? 0,
      meals: dayMeals.map(({ meal, time, everyoneOut }) => ({ id: meal.id, mealTimeName: time.name, categoryId: meal.category_id, everyoneOut })),
      mealLooks: Object.fromEntries(dayMeals.map(({ meal }) => [meal.id, { title: mealName(meal, recipes, categories), icon: mealIcon(meal, recipes, categories) }])),
      events: shown.slice(0, 3).map((e) => ({
        id: `${e.id}-${e.starts_at}`,
        time: isAllDayStyle(e, timeZone) ? null : shortTime(new Date(e.starts_at), household),
        title: e.title,
        icon: e.icon ?? null,
      })),
      moreEvents: Math.max(0, shown.length - 3),
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
    categories: basics.categories.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, icon: c.icon, meal_time_ids: c.meal_time_ids })),
    mealTimeOf: Object.fromEntries(meals.map((m) => [m.id, m.meal_time_id])),
    hardChores: schedule.chores.filter((c) => schedule.hard.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    initial,
    reviewed: review !== null,
  };
}
