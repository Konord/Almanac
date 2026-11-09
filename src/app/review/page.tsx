import { Suspense } from "react";
import { AppFrame, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { weekStartOf } from "@/lib/meals";
import { addDays, isLocalDate, localDateOf, zonedToUtc } from "@/lib/time";
import { ReviewBoard } from "./board";
import { comingWeek, loadReview } from "./data";

/**
 * The weekly review (tasks rework, step 4): confirm and tweak the coming
 * week. Opens on the coming week; arrows go to other weeks. Nothing
 * scrolls, and one Confirm week saves everything.
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
  const asked = firstParam(params.week);
  const week = asked && isLocalDate(asked) ? weekStartOf(asked, weekStartsOn) : coming;
  const data = await loadReview(household, week, today);

  const format = new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" });
  const range = format.formatRange(zonedToUtc(week, "12:00", timeZone), zonedToUtc(addDays(week, 6), "12:00", timeZone));
  const href = (w: string) => (w === coming ? "/review" : `/review?week=${w}`);

  return (
    <ReviewBoard
      // A new key after Confirm week starts the screen afresh from what was saved.
      key={`${week}:${data.reviewed}:${JSON.stringify(data.initial)}`}
      data={data}
      range={range}
      weekHref={{ prev: href(addDays(week, -7)), next: href(addDays(week, 7)), coming: "/review", isComing: week === coming }}
    />
  );
}
