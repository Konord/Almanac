import { Suspense } from "react";
import { AppFrame, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { weekStartOf } from "@/lib/meals";
import { addDays, isLocalDate, localDateOf, zonedToUtc } from "@/lib/time";
import { ReviewBoard } from "./board";
import { comingWeek, loadReview } from "./data";

/**
 * The weekly review (tasks rework, step 4): confirm and tweak the coming
 * week. Opens on the coming week; arrows go to other weeks. Nothing
 * scrolls, and one Save in the header keeps everything.
 */
export default function ReviewPage(props: PageProps<"/review">) {
  return (
    <AppFrame section="review">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Review searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Review({ searchParams }: { searchParams: PageProps<"/review">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { timeZone, locale, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const coming = comingWeek(household, today);
  // A meal to open (from the Today panel or the calendar): its week, with its picker up.
  const mealParam = firstParam(params.meal);
  const meal = mealParam && /^[0-9a-f-]{36}$/i.test(mealParam) ? await findMeal(mealParam) : null;
  const asked = meal?.date ?? firstParam(params.week);
  const week = asked && isLocalDate(asked) ? weekStartOf(asked, weekStartsOn) : coming;
  const data = await loadReview(household, week, today);

  const format = new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" });
  const range = format.formatRange(zonedToUtc(week, "12:00", timeZone), zonedToUtc(addDays(week, 6), "12:00", timeZone));
  const href = (w: string) => (w === coming ? "/review" : `/review?week=${w}`);

  return (
    <ReviewBoard
      // A new key after Save starts the screen afresh from what was saved.
      key={`${week}:${data.reviewed}:${JSON.stringify(data.initial)}:${JSON.stringify(data.meals)}`}
      data={data}
      range={range}
      openMeal={meal && meal.date >= today ? meal : null}
      weekHref={{ prev: href(addDays(week, -7)), next: href(addDays(week, 7)), coming: "/review", isComing: week === coming }}
    />
  );
}

/** A meal's day and meal time, to open it on the review. */
async function findMeal(id: string): Promise<{ id: string; date: string; mealTimeId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("meals").select("id, date, meal_time_id").eq("id", id).maybeSingle();
  return data ? { id: data.id, date: data.date, mealTimeId: data.meal_time_id } : null;
}
