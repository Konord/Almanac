import { Suspense } from "react";
import { AppFrame } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import type { ManagerDraft } from "@/lib/routine-manager";
import { DEFAULT_MINUTES } from "@/lib/routine-placement";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
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
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Manager />
      </Suspense>
    </AppFrame>
  );
}

async function Manager() {
  const household = await requireHousehold();
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const [data, mealTimes] = await Promise.all([
    loadRoutines(today),
    supabase.from("meal_times").select("id, name, usual_time").order("sort_order").order("name"),
  ]);
  if (mealTimes.error) throw mealTimes.error;

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
    })),
    steps: data.steps.map((s) => ({ id: s.id, routine_id: s.template_id, text: s.text, icon: s.icon, habit: s.habit })),
    uses: data.assignments.flatMap((a) =>
      a.day_type_id ? [{ id: a.id, routine_id: a.template_id, member_id: a.member_id, day_type_id: a.day_type_id }] : [],
    ),
  };

  return (
    <RoutineManager
      // A fresh start after each save, so the screen shows what was saved.
      key={hash(JSON.stringify(initial))}
      initial={initial}
      members={data.members.map((m) => ({ id: m.id, name: m.name, colour: m.colour, icon: m.icon }))}
      dayTypes={data.dayTypes}
      mealTimes={(mealTimes.data ?? []).map((m) => ({ id: m.id, name: m.name, usual_time: m.usual_time.slice(0, 5) }))}
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
