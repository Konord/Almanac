import { createClient } from "@/lib/supabase/server";
import { dayFor } from "@/lib/day-types";
import {
  combineDays,
  datesBetween,
  habitDay,
  habitPeriods,
  habitStats,
  periodStats,
  ruleDay,
  stepKey,
  type Frequency,
  type HabitDay,
  type HabitPeriod,
  type HabitRule,
  type HabitStats,
} from "@/lib/habits";
import { assignmentsForDay, stepsForMember } from "@/lib/routines";
import { addDays, type LocalDate } from "@/lib/time";
import { loadBreaks, loadEventDays, loadRoutines, type RoutineMember } from "../routines/data";

/*
 * Everything the Habits page draws (2026-11-12). Habits come from two places:
 *
 * - Routines: a whole routine that's tracked (done when every one of the
 *   person's steps is ticked), or single tracked steps. Steps are matched
 *   by name per person, so the same step in two routines is one habit.
 *   They follow the routine's own days and are tick only.
 * - The Habit Manager: check or count habits, every day, some weekdays,
 *   or a number of times a week or month.
 *
 * Each habit is one row per person. Whether a routine was "on" for a past
 * day is worked out from the routines and kinds of day as they're set up
 * now, plus any day that was switched to another kind of day.
 */

export type HabitMember = Pick<RoutineMember, "id" | "name" | "colour" | "icon">;

export type HabitCell = { day: HabitDay | "future"; amount: number };

export type HabitRowData = {
  /** "r:<routine>:<person>", "s:<step name>:<person>" or "h:<habit>:<person>". */
  key: string;
  member: HabitMember;
  name: string;
  icon: string | null;
  source: "routine" | "habit";
  rule: HabitRule;
  unit: string | null;
  /** How much each tap adds (count habits). */
  step: number;
  /** One per date of the range asked for. */
  cells: Map<LocalDate, HabitCell>;
  /** Week or month habits: the weeks or months over the range. */
  periods: HabitPeriod[];
  /** Up to today, over the look-back. */
  stats: HabitStats;
};

/** How far back streaks look, besides the range on screen. */
const LOOKBACK_DAYS = 120;

export function habitKey(kind: "r" | "s" | "h", id: string, memberId: string): string {
  return `${kind}:${encodeURIComponent(id)}:${memberId}`;
}

/**
 * Every habit row from `from` to `to`, for everyone. `only` keeps just
 * one row (for the 12-month popup).
 */
export async function loadHabitRows(from: LocalDate, to: LocalDate, today: LocalDate, only?: string): Promise<{ members: HabitMember[]; rows: HabitRowData[] }> {
  const data = await loadRoutines(today);
  const members = data.members.map(({ id, name, colour, icon }) => ({ id, name, colour, icon }));
  const start = [from, addDays(today, -LOOKBACK_DAYS)].sort()[0];
  const end = [to, today].sort()[1];
  const dates = datesBetween(start, end);
  const shown = datesBetween(from, to);
  const supabase = await createClient();

  const [habits, habitMembers, logs, checks, overrides, days, breaks, eventDays] = await Promise.all([
    supabase.from("habits").select("id, name, icon, measure, goal, unit, step, frequency, weekdays, times, since, sort_order").order("sort_order").order("name"),
    supabase.from("habit_members").select("habit_id, member_id"),
    supabase.from("habit_logs").select("habit_id, member_id, log_date, amount").gte("log_date", start).lte("log_date", end),
    supabase.from("routine_checks").select("member_id, step_id, check_date").gte("check_date", start).lte("check_date", end),
    supabase.from("day_overrides").select("member_id, date, day_type_id, wake_time, bed_time").gte("date", addDays(start, -1)).lte("date", end),
    supabase.from("days").select("date, energy_mode").gte("date", start).lte("date", end),
    loadBreaks(start, end),
    loadEventDays(start, end),
  ]);
  for (const r of [habits, habitMembers, logs, checks, overrides, days]) if (r.error) throw r.error;

  const rows: HabitRowData[] = [];
  const keep = (key: string) => !only || only === key;

  // --- From routines -------------------------------------------------------
  const ticked = new Set((checks.data ?? []).map((c) => `${c.member_id}:${c.step_id}:${c.check_date}`));
  const survival = new Set((days.data ?? []).filter((d) => d.energy_mode === "survival").map((d) => d.date));
  const rangeData = { ...data, overrides: overrides.data ?? [], breaks, eventDays };
  const templates = data.templates.filter((t) => !t.is_template);
  const kindOf = (id: string) => data.templates.find((t) => t.id === id)?.kind;
  const anyTracked = templates.some((t) => t.habit_since) || data.steps.some((s) => s.habit_since);

  for (const member of data.members) {
    if (!anyTracked) break;
    const mine = templates.filter((t) => data.assignments.some((a) => a.member_id === member.id && a.template_id === t.id));
    // Which routines were on for this person, each day.
    const onByDate = new Map(
      dates.map((date) => {
        const dayTypeId = dayFor(member, rangeData, date).dayType?.id ?? null;
        return [date, new Set(assignmentsForDay(data.assignments, member.id, date, dayTypeId, kindOf).map((a) => a.template_id))];
      }),
    );
    const stepDay = (stepIds: string[], templateIds: string[], since: LocalDate, date: LocalDate): HabitDay =>
      habitDay(
        {
          date,
          scheduled: templateIds.some((t) => onByDate.get(date)?.has(t)),
          done: stepIds.some((id) => ticked.has(`${member.id}:${id}:${date}`)),
          survival: survival.has(date),
        },
        since,
        today,
      );
    const tick: Omit<HabitRule, "since" | "frequency" | "weekdays"> = { measure: "check", goal: 1, times: 1 };

    // A whole routine: done when every one of the person's steps is ticked.
    for (const template of mine.filter((t) => t.habit_since)) {
      const key = habitKey("r", template.id, member.id);
      if (!keep(key)) continue;
      const steps = stepsForMember(data.steps.filter((s) => s.template_id === template.id), member.id);
      if (steps.length === 0) continue;
      const since = template.habit_since!;
      const dayOf = (date: LocalDate) => combineDays(steps.map((s) => stepDay([s.id], [template.id], since, date)));
      rows.push(routineRow(key, member, template.name, steps[0]?.icon ?? null, since, dates, shown, dayOf, today, tick));
    }

    // Single steps, one habit per name for this person across their routines.
    const groups = new Map<string, { name: string; icon: string | null; stepIds: string[]; templateIds: string[]; since: LocalDate }>();
    for (const template of mine) {
      for (const step of stepsForMember(data.steps.filter((s) => s.template_id === template.id && s.habit_since), member.id)) {
        const k = stepKey(step.text);
        const g = groups.get(k) ?? { name: step.text.trim(), icon: step.icon, stepIds: [], templateIds: [], since: step.habit_since! };
        g.stepIds.push(step.id);
        if (!g.templateIds.includes(template.id)) g.templateIds.push(template.id);
        if (step.habit_since! < g.since) g.since = step.habit_since!;
        g.icon ??= step.icon;
        groups.set(k, g);
      }
    }
    for (const [k, g] of groups) {
      const key = habitKey("s", k, member.id);
      if (!keep(key)) continue;
      rows.push(routineRow(key, member, g.name, g.icon, g.since, dates, shown, (date) => stepDay(g.stepIds, g.templateIds, g.since, date), today, tick));
    }
  }

  // --- From the Habit Manager ----------------------------------------------
  const amountOf = new Map((logs.data ?? []).map((l) => [`${l.habit_id}:${l.member_id}:${l.log_date}`, l.amount]));
  for (const h of habits.data ?? []) {
    const rule: HabitRule = {
      measure: h.measure === "count" ? "count" : "check",
      goal: h.measure === "count" ? h.goal : 1,
      frequency: (["daily", "days", "week", "month"].includes(h.frequency) ? h.frequency : "daily") as Frequency,
      weekdays: h.weekdays,
      times: h.times,
      since: h.since,
    };
    for (const link of (habitMembers.data ?? []).filter((m) => m.habit_id === h.id)) {
      const member = data.members.find((m) => m.id === link.member_id);
      const key = habitKey("h", h.id, link.member_id);
      if (!member || !keep(key)) continue;
      const amount = (date: LocalDate) => amountOf.get(`${h.id}:${member.id}:${date}`) ?? 0;
      const cells = new Map<LocalDate, HabitCell>(
        shown.map((date) => [date, { day: date > today ? "future" : ruleDay(rule, date, amount(date), today), amount: amount(date) }]),
      );
      const periodic = rule.frequency === "week" || rule.frequency === "month";
      const allPeriods = periodic ? habitPeriods(rule, start, end, amount, today) : [];
      rows.push({
        key,
        member: { id: member.id, name: member.name, colour: member.colour, icon: member.icon },
        name: h.name,
        icon: h.icon,
        source: "habit",
        rule,
        unit: h.unit,
        step: h.step,
        cells,
        periods: allPeriods.filter((p) => p.to >= from && p.from <= to),
        stats: periodic
          ? periodStats(allPeriods.filter((p) => p.from <= today))
          : habitStats(dates.filter((d) => d <= today).map((d) => ruleDay(rule, d, amount(d), today))),
      });
    }
  }

  // Grouped by person (in the household's order), habits in their own order within.
  const order = new Map(data.members.map((m, i) => [m.id, i]));
  rows.sort((a, b) => (order.get(a.member.id) ?? 0) - (order.get(b.member.id) ?? 0));
  return { members, rows };
}

function routineRow(
  key: string,
  member: HabitMember,
  name: string,
  icon: string | null,
  since: LocalDate,
  dates: LocalDate[],
  shown: LocalDate[],
  dayOf: (date: LocalDate) => HabitDay,
  today: LocalDate,
  tick: Omit<HabitRule, "since" | "frequency" | "weekdays">,
): HabitRowData {
  return {
    key,
    member: { id: member.id, name: member.name, colour: member.colour, icon: member.icon },
    name,
    icon,
    source: "routine",
    rule: { ...tick, frequency: "daily", weekdays: [], since },
    unit: null,
    step: 1,
    cells: new Map(shown.map((date) => {
      const day = date > today ? "future" : dayOf(date);
      return [date, { day, amount: day === "done" ? 1 : 0 }];
    })),
    periods: [],
    stats: habitStats(dates.filter((d) => d <= today).map(dayOf)),
  };
}

/** A habit's short line: "8 glasses", "2 a week", "Mon–Fri". */
export function habitSub(row: Pick<HabitRowData, "rule" | "unit">, locale: string): string {
  const { rule } = row;
  const parts: string[] = [];
  if (rule.measure === "count") parts.push(`${rule.goal}${row.unit ? ` ${row.unit}` : ""}`);
  if (rule.frequency === "week") parts.push(rule.times === 1 ? "weekly" : `${rule.times}× a week`);
  else if (rule.frequency === "month") parts.push(rule.times === 1 ? "monthly" : `${rule.times}× a month`);
  else if (rule.frequency === "days") parts.push(weekdaysText(rule.weekdays, locale));
  return parts.join(" · ");
}

/** "Mon–Fri", "Sat, Sun", "Mon, Wed, Fri". */
export function weekdaysText(weekdays: number[], locale: string): string {
  const name = (d: number) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + d)));
  const sorted = [...new Set(weekdays)].map((d) => (d + 6) % 7).sort((a, b) => a - b); // Monday first
  if (sorted.length === 7) return "every day";
  const runs: number[][] = [];
  for (const d of sorted) {
    const last = runs.at(-1);
    if (last && d === last.at(-1)! + 1) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${name((r[0] + 1) % 7)}–${name((r.at(-1)! + 1) % 7)}` : r.map((d) => name((d + 1) % 7)).join(", "))).join(", ");
}
