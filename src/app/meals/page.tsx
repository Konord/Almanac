import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppFrame, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { isLocalDate } from "@/lib/time";

/**
 * The Menu Manager's front door. Meals used to be planned here; all
 * planning now happens in the weekly review (Connor, 2026-11-09), so this
 * opens the recipes, and old links to a week or a meal go to the review.
 */
export default function MealsPage(props: PageProps<"/meals">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Forward searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Forward({ searchParams }: { searchParams: PageProps<"/meals">["searchParams"] }): Promise<never> {
  await requireHousehold();
  const params = await searchParams;
  const meal = firstParam(params.meal);
  const week = firstParam(params.week);
  if (meal && /^[0-9a-f-]{36}$/i.test(meal)) redirect(`/review?meal=${meal}`);
  if (week && isLocalDate(week)) redirect(`/review?week=${week}`);
  redirect("/meals/library");
}
