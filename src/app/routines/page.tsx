import { Suspense } from "react";
import { AppFrame, LoadingOutline } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { menuMealIcon, menuMealName } from "@/lib/menu";
import { noPresets, type ManagerDraft } from "@/lib/routine-manager";
import { DEFAULT_MINUTES } from "@/lib/routine-placement";
import { localDateOf } from "@/lib/time";
import { loadMealBasics, loadPresets } from "../meals/data";
import { loadRoutines } from "./data";
import { RoutineManager } from "./manager";

/**
 * The Routine Manager: every routine, laid out by kind of day or by person,
 * with an editor beside it. Ticking routines off happens on the calendar
 * (tap a routine block); this screen is for setting them up.
 */
export default function RoutinesPage() {
  return (
    <AppFrame section="routines">
      <Suspense fallback={<LoadingOutline />}>
        <Manager />
      </Suspense>
    </AppFrame>
  );
}

async function Manager() {
  const household = await requireHousehold();
  const today = localDateOf(new Date(), household.settings.timeZone);
  const [data, basics, presets] = await Promise.all([loadRoutines(today), loadMealBasics(), loadPresets()]);
  const dishById = new Map(basics.recipes.map((r) => [r.id, r]));

  const initial: ManagerDraft = {
    routines: data.templates.map((t) => ({
      id: t.id,
      name: t.name,
      anchor: t.anchor,
      anchor_meal_time_id: t.anchor_meal_time_id,
      anchor_offset: t.anchor_offset,
      usual_start: t.usual_start?.slice(0, 5) ?? (t.anchor === "clock" ? defaultStart(t.kind) : null),
      usual_minutes: t.usual_minutes ?? DEFAULT_MINUTES,
      loose: t.loose,
      habit_since: t.habit_since,
      visibility: t.visibility,
      is_template: t.is_template,
    })),
    steps: data.steps.map((s) => ({
      id: s.id,
      routine_id: s.template_id,
      text: s.text,
      icon: s.icon,
      habit_since: s.habit_since,
      member_ids: s.member_ids,
      daily_list: s.daily_list,
    })),
    uses: data.assignments.flatMap((a) =>
      a.day_type_id ? [{ id: a.id, routine_id: a.template_id, member_id: a.member_id, day_type_id: a.day_type_id }] : [],
    ),
    // Meal blocks (Lunch, Dinner) live here too (Connor, 2026-11-11).
    meals: basics.mealTimes.map((t) => {
      const days = noPresets();
      for (const p of presets.filter((x) => x.meal_time_id === t.id)) {
        days[p.weekday] = p.menu_meal_id ? `m:${p.menu_meal_id}` : p.category_id ? `c:${p.category_id}` : null;
      }
      return { id: t.id, name: t.name, icon: t.icon, usual_time: t.usual_time, minutes: t.minutes, presets: days };
    }),
    mealUses: basics.mealTimeUses.map((u) => ({ id: u.id, meal_id: u.meal_time_id, member_id: u.member_id, day_type_id: u.day_type_id })),
  };

  return (
    <RoutineManager
      // A fresh start after each save, so the screen shows what was saved.
      key={hash(JSON.stringify(initial))}
      initial={initial}
      members={data.members.map((m) => ({ id: m.id, name: m.name, colour: m.colour, icon: m.icon }))}
      dayTypes={data.dayTypes}
      mealChoices={{
        kinds: basics.categories.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
        meals: basics.menuMeals.map((m) => ({ id: m.id, name: menuMealName(m, dishById), icon: menuMealIcon(m, dishById), categoryIds: m.category_ids })),
      }}
      weekStartsOn={household.settings.weekStartsOn}
      today={today}
      locale={household.settings.locale}
      flexMinutes={household.settings.routineFlexMinutes}
    />
  );
}

function defaultStart(kind: string): string {
  return kind === "morning" ? "07:00" : kind === "night" ? "19:30" : "16:00";
}

/** A short fingerprint of the saved routines. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
