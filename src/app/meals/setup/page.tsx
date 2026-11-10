import { Suspense } from "react";
import { AppFrame, LoadingOutline } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { loadMealBasics, loadPresets } from "../data";
import type { MealSetupDraft } from "./draft";
import { MealSetupEditor } from "./editor";

/**
 * Meals setup: the meal times (rows on the planner) and presets (Tuesday
 * dinner is Tacos). One Save for both. Things bought every so often are
 * repeating groceries, set on the grocery list itself.
 */
export default function MealsSetupPage() {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<LoadingOutline />}>
        <Setup />
      </Suspense>
    </AppFrame>
  );
}

async function Setup() {
  const household = await requireHousehold();
  const [basics, presets] = await Promise.all([loadMealBasics(), loadPresets()]);
  const initial: MealSetupDraft = {
    times: basics.mealTimes.map((t) => ({ id: t.id, name: t.name, icon: t.icon, usual: t.usual_time, onPlanner: t.show_on_planner })),
    presets: Object.fromEntries(presets.filter((p) => p.category_id).map((p) => [`${p.weekday}|${p.meal_time_id}`, p.category_id])),
  };
  return <MealSetupEditor key={JSON.stringify(initial)} initial={initial} categories={basics.categories} weekStartsOn={household.settings.weekStartsOn} />;
}
