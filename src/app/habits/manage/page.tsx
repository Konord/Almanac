import { Suspense } from "react";
import { AppFrame, firstParam, LoadingOutline } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { stepKey } from "@/lib/habits";
import type { HabitManagerDraft } from "@/lib/habit-manager";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { loadRoutines } from "../../routines/data";
import { HabitManager, type FromRoutine } from "./manager";

/**
 * The Habit Manager (2026-11-12): set up habits (Habits tab) and health
 * trackers (Health tab). One Save for both; nothing scrolls. Habits tracked
 * from routines are listed too, and are switched on in Routines.
 *
 * ?tab=health opens the Health tab.
 */
export default function HabitManagerPage(props: PageProps<"/habits/manage">) {
  return (
    <AppFrame section="habits">
      <Suspense fallback={<LoadingOutline />}>
        <Manager searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Manager({ searchParams }: { searchParams: PageProps<"/habits/manage">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone, temperatureUnit } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const supabase = await createClient();
  const [routines, habits, habitMembers, trackers, trackerMembers, choices, amounts] = await Promise.all([
    loadRoutines(today),
    supabase.from("habits").select("id, name, icon, measure, goal, unit, step, frequency, weekdays, times, since").order("sort_order").order("name"),
    supabase.from("habit_members").select("habit_id, member_id"),
    supabase.from("health_trackers").select("id, name, icon, kind, unit, alert_above").order("sort_order").order("name"),
    supabase.from("health_tracker_members").select("tracker_id, member_id"),
    supabase.from("health_choices").select("id, tracker_id, name, icon, wait_minutes, max_per_day").order("sort_order").order("name"),
    supabase.from("health_choice_amounts").select("choice_id, member_id, amount"),
  ]);
  for (const r of [habits, habitMembers, trackers, trackerMembers, choices, amounts]) if (r.error) throw r.error;

  const members = routines.members.map(({ id, name, colour, icon, role }) => ({ id, name, colour, icon, role }));
  const initial: HabitManagerDraft = {
    habits: (habits.data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      measure: h.measure === "count" ? "count" : "check",
      goal: h.goal,
      unit: h.unit ?? "",
      step: h.step,
      frequency: (["daily", "days", "week", "month"].includes(h.frequency) ? h.frequency : "daily") as HabitManagerDraft["habits"][number]["frequency"],
      weekdays: [...h.weekdays].sort(),
      times: h.times,
      since: h.since,
      member_ids: (habitMembers.data ?? []).filter((m) => m.habit_id === h.id).map((m) => m.member_id),
    })),
    trackers: (trackers.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      kind: t.kind === "medicine" ? "medicine" : t.kind === "number" ? "number" : "note",
      unit: t.unit ?? "",
      alert_above: t.alert_above,
      member_ids: (trackerMembers.data ?? []).filter((m) => m.tracker_id === t.id).map((m) => m.member_id),
      choices: (choices.data ?? [])
        .filter((c) => c.tracker_id === t.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          wait_minutes: c.wait_minutes,
          max_per_day: c.max_per_day,
          amounts: Object.fromEntries((amounts.data ?? []).filter((a) => a.choice_id === c.id).map((a) => [a.member_id, a.amount])),
        })),
    })),
  };

  // Habits tracked from routines: whole routines, then steps (one per name).
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const peopleOf = (templateId: string) => [...new Set(routines.assignments.filter((a) => a.template_id === templateId).map((a) => a.member_id))];
  const templates = routines.templates.filter((t) => !t.is_template);
  const fromRoutines: FromRoutine[] = templates
    .filter((t) => t.habit_since)
    .map((t) => ({ key: `r:${t.id}`, name: t.name, icon: routines.steps.find((s) => s.template_id === t.id)?.icon ?? null, people: peopleOf(t.id).map(nameOf), routines: 0 }));
  const steps = new Map<string, FromRoutine & { templates: Set<string> }>();
  for (const s of routines.steps.filter((x) => x.habit_since && templates.some((t) => t.id === x.template_id))) {
    const k = stepKey(s.text);
    const g = steps.get(k) ?? { key: `s:${k}`, name: s.text.trim(), icon: s.icon, people: [], routines: 0, templates: new Set<string>() };
    g.templates.add(s.template_id);
    const who = s.member_ids.length ? s.member_ids : peopleOf(s.template_id);
    g.people = [...new Set([...g.people, ...who.map(nameOf)])];
    g.routines = g.templates.size;
    steps.set(k, g);
  }
  fromRoutines.push(...[...steps.values()].map(({ templates: _t, ...rest }) => rest));

  return (
    <HabitManager
      key={JSON.stringify(initial)}
      initial={initial}
      members={members}
      fromRoutines={fromRoutines}
      today={today}
      locale={locale}
      celsius={temperatureUnit !== "fahrenheit"}
      startTab={firstParam(params.tab) === "health" ? "health" : "habits"}
    />
  );
}
