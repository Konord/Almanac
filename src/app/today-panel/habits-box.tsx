import { Check, Minus, Plus } from "@phosphor-icons/react/dist/ssr";
import { PanelPages } from "@/components/panel-pages";
import { Emoji } from "@/components/ui";
import { strong } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import { dayMet, habitOn, habitPeriods, weekStart, type Frequency, type HabitRule } from "@/lib/habits";
import { createClient } from "@/lib/supabase/server";
import type { LocalDate } from "@/lib/time";
import { tapHabit } from "../habits/actions";

/** Rows on a page of the Habits box. */
const ROWS = 6;

/**
 * The Today panel's Habits box (2026-11-12): today's habits from the Habit
 * Manager, a row per person. Check habits tick; count habits add one tap's
 * worth (the − takes one back). Habits from routines are ticked with their
 * routine, so they aren't here.
 */
export async function HabitsBox({ today, returnTo }: { today: LocalDate; returnTo: string }) {
  const supabase = await createClient();
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = weekStart(today) < monthStart ? weekStart(today) : monthStart;
  const [habits, links, logs, members] = await Promise.all([
    supabase.from("habits").select("id, name, icon, measure, goal, unit, step, frequency, weekdays, times, since").order("sort_order").order("name"),
    supabase.from("habit_members").select("habit_id, member_id"),
    supabase.from("habit_logs").select("habit_id, member_id, log_date, amount").gte("log_date", from).lte("log_date", today),
    supabase.from("members").select("id, name, colour").order("sort_order").order("name"),
  ]);
  for (const r of [habits, links, logs, members]) if (r.error) throw r.error;
  const amountOf = new Map((logs.data ?? []).map((l) => [`${l.habit_id}:${l.member_id}:${l.log_date}`, l.amount]));

  const rows = (members.data ?? []).flatMap((m) =>
    (habits.data ?? []).flatMap((h) => {
      if (!(links.data ?? []).some((l) => l.habit_id === h.id && l.member_id === m.id) || h.since > today) return [];
      const rule: HabitRule = { measure: h.measure === "count" ? "count" : "check", goal: h.measure === "count" ? h.goal : 1, frequency: h.frequency as Frequency, weekdays: h.weekdays, times: h.times, since: h.since };
      if (!habitOn(rule, today)) return [];
      const amount = amountOf.get(`${h.id}:${m.id}:${today}`) ?? 0;
      // Week and month habits: how many days so far, once today is done they're done for now.
      const periodic = rule.frequency === "week" || rule.frequency === "month";
      const period = periodic ? habitPeriods(rule, today, today, (d) => amountOf.get(`${h.id}:${m.id}:${d}`) ?? 0, today)[0] : null;
      if (period && period.status === "done" && !dayMet(rule, amount)) return [];
      return [{ key: `${h.id}:${m.id}`, habit: h, member: m, rule, amount, period }];
    }),
  );
  if (rows.length === 0) return null;

  const pages: React.ReactNode[] = [];
  for (let i = 0; i < rows.length; i += ROWS) {
    pages.push(
      <ul key={i} className="flex flex-col">
        {rows.slice(i, i + ROWS).map(({ key, habit, member, rule, amount, period }) => {
          const done = dayMet(rule, amount);
          const hidden = (
            <>
              <input type="hidden" name="habit" value={habit.id} />
              <input type="hidden" name="member" value={member.id} />
              <input type="hidden" name="date" value={today} />
              <input type="hidden" name="returnTo" value={returnTo} />
            </>
          );
          return (
            <li key={key} className="flex min-h-16 items-center gap-2.5 border-b border-panel last:border-0">
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: strong(member.colour) }} aria-hidden />
              <Emoji emoji={eventEmoji(habit.icon, habit.name, "✅")} className="size-8" />
              <span className={`min-w-0 flex-1 truncate text-xl font-bold ${done ? "text-ink-muted" : "text-ink"}`}>{habit.name}</span>
              {period && rule.times > 1 ? (
                <span className="shrink-0 text-base font-bold text-ink-muted tabular-nums">
                  {period.met}/{rule.times}
                </span>
              ) : null}
              {rule.measure === "count" ? (
                <>
                  {amount > 0 ? (
                    <form action={tapHabit}>
                      {hidden}
                      <input type="hidden" name="undo" value="1" />
                      <button aria-label={`Take ${habit.step} off ${habit.name}`} className="flex size-11 items-center justify-center rounded-full text-ink-muted">
                        <Minus size="1.125rem" weight="bold" aria-hidden />
                      </button>
                    </form>
                  ) : null}
                  <span className={`shrink-0 text-lg font-extrabold tabular-nums ${done ? "text-met" : "text-ink-soft"}`}>
                    {amount}/{rule.goal}
                  </span>
                  <form action={tapHabit}>
                    {hidden}
                    <button
                      aria-label={`Add ${habit.step}${habit.unit ? ` ${habit.unit}` : ""} to ${habit.name}`}
                      className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-white"
                      style={{ background: strong(member.colour) }}
                    >
                      <Plus size="1.5rem" weight="bold" aria-hidden />
                    </button>
                  </form>
                </>
              ) : (
                <form action={tapHabit}>
                  {hidden}
                  <button aria-label={done ? `Untick ${habit.name}` : `Tick off ${habit.name}`} aria-pressed={done} className="flex size-[var(--touch-target)] items-center justify-center">
                    <span
                      className="flex size-9 items-center justify-center rounded-full border-[2.5px]"
                      style={done ? { background: strong(member.colour), borderColor: strong(member.colour), color: "white" } : { borderColor: "var(--color-check-border)", color: "transparent" }}
                    >
                      <Check size="1.25rem" weight="bold" aria-hidden />
                    </span>
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>,
    );
  }
  return <PanelPages pages={pages} />;
}
