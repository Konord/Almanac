import type { Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { choreHeadsUpDate, headsUpTime, MAKE_AHEAD_DAYS } from "@/lib/heads-ups";
import { weekStartOf } from "@/lib/meals";
import { expandEvents } from "@/lib/recurrence";
import { addDays, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { EVENT_COLUMNS, toEvent } from "../calendar/data";
import { loadChores } from "../chores/data";
import { findOrCreateItem } from "../meals/shared";

/*
 * Turns heads-ups into to-dos and grocery lines. It runs when Today or the
 * Lists screen opens (at most once a minute per household) and right after
 * a heads-up is saved. Each heads-up makes one thing per date, a week ahead
 * at most. If the event moves, the old to-do (if still open) goes and a new
 * one is made.
 */

type HeadsUpRow = {
  id: string;
  event_id: string | null;
  chore_id: string | null;
  label: string;
  minutes_before: number;
  makes: "todo" | "grocery";
  assignee_id: string | null;
  last_grocery_for: string | null;
};

/** One thing a heads-up should have made. */
type Wanted = {
  headsUp: HeadsUpRow;
  forDate: LocalDate;
  date: LocalDate;
  time: string | null;
  icon: string | null;
  memberId: string | null;
  about: string;
};

const lastRun = new Map<string, number>();

export async function syncEventAndChoreHeadsUps(household: Household, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - (lastRun.get(household.id) ?? 0) < 60_000) return;
  lastRun.set(household.id, now);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("heads_ups")
    .select("id, event_id, chore_id, label, minutes_before, makes, assignee_id, last_grocery_for");
  if (error) throw error;
  const headsUps = (data ?? []) as HeadsUpRow[];

  const { timeZone } = household.settings;
  const today = localDateOf(new Date(now), timeZone);
  const lastDay = addDays(today, MAKE_AHEAD_DAYS);
  const wanted: Wanted[] = [];

  // Events: every upcoming date whose heads-up falls within the week.
  const forEvents = headsUps.filter((h) => h.event_id);
  if (forEvents.length > 0) {
    const longest = Math.max(...forEvents.map((h) => h.minutes_before));
    const rangeStart = new Date(now);
    const rangeEnd = new Date(zonedToUtc(addDays(lastDay, 1), "00:00", timeZone).getTime() + longest * 60_000);
    const ids = [...new Set(forEvents.map((h) => h.event_id as string))];
    const [events, exceptions] = await Promise.all([
      supabase.from("events").select(EVENT_COLUMNS).in("id", ids),
      supabase.from("event_exceptions").select("event_id, original_date, skipped, new_starts_at, new_ends_at").in("event_id", ids),
    ]);
    if (events.error) throw events.error;
    if (exceptions.error) throw exceptions.error;
    const items = expandEvents(events.data.map(toEvent), exceptions.data, rangeStart, rangeEnd);
    for (const item of items) {
      const start = new Date(item.starts_at);
      if (start.getTime() < now) continue;
      for (const h of forEvents.filter((x) => x.event_id === item.series_id)) {
        const when = headsUpTime(start, h.minutes_before, timeZone);
        if (when.date > lastDay) continue;
        wanted.push({
          headsUp: h,
          forDate: localDateOf(start, timeZone),
          date: when.date < today ? today : when.date,
          time: when.date < today ? null : when.time,
          icon: item.icon,
          memberId: h.assignee_id ?? (item.member_ids.length === 1 ? item.member_ids[0] : null),
          about: item.title,
        });
      }
    }
  }

  // Chores: the day the chore is next due, counted back.
  const forChores = headsUps.filter((h) => h.chore_id);
  if (forChores.length > 0) {
    const { chores } = await loadChores(today, timeZone);
    for (const chore of chores) {
      if (!chore.active || chore.kind === "preset" || chore.timing.dueOn < today) continue;
      for (const h of forChores.filter((x) => x.chore_id === chore.id)) {
        const date = choreHeadsUpDate(chore.timing.dueOn, h.minutes_before);
        if (date > lastDay) continue;
        wanted.push({
          headsUp: h,
          forDate: chore.timing.dueOn,
          date: date < today ? today : date,
          time: null,
          icon: chore.icon,
          memberId: h.assignee_id ?? chore.default_assignee_id,
          about: chore.name,
        });
      }
    }
  }

  await syncTodos(household, today, wanted.filter((w) => w.headsUp.makes === "todo"));
  await syncGroceries(household, today, wanted.filter((w) => w.headsUp.makes === "grocery"));
}

const key = (headsUpId: string, forDate: string) => `${headsUpId}|${forDate}`;

async function syncTodos(household: Household, today: LocalDate, wanted: Wanted[]) {
  const supabase = await createClient();
  // Open ones made before: drop any that no longer match (the event moved,
  // or the heads-up changed). Done ones stay done.
  const { data: made, error } = await supabase
    .from("task_instances")
    .select("id, heads_up_id, heads_up_for, due_date, at_time, title, status")
    .not("heads_up_id", "is", null)
    .gte("heads_up_for", today);
  if (error) throw error;
  const want = new Map(wanted.map((w) => [key(w.headsUp.id, w.forDate), w]));
  const stale = (made ?? []).filter((m) => {
    if (m.status !== "open") return false;
    const w = want.get(key(m.heads_up_id as string, m.heads_up_for as string));
    return !w || w.date !== m.due_date || (w.time ?? null) !== (m.at_time?.slice(0, 5) ?? null) || w.headsUp.label !== m.title;
  });
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from("task_instances").delete().in("id", stale.map((m) => m.id));
    if (deleteError) throw deleteError;
  }
  if (wanted.length === 0) return;

  const { data: list } = await supabase.from("task_lists").select("id").eq("is_chores", false).eq("is_groceries", false).order("sort_order").order("name").limit(1).maybeSingle();
  if (!list) return;
  const rows = wanted.map((w) => ({
    household_id: household.id,
    list_id: list.id,
    title: w.headsUp.label,
    icon: w.icon ?? "🔔",
    notes: `Heads-up for ${w.about}`.slice(0, 2000),
    assignee_id: w.memberId,
    due_date: w.date,
    date_kind: "start",
    at_time: w.time,
    heads_up_id: w.headsUp.id,
    heads_up_for: w.forDate,
  }));
  const { error: insertError } = await supabase
    .from("task_instances")
    .upsert(rows, { onConflict: "heads_up_id,heads_up_for", ignoreDuplicates: true });
  if (insertError) throw insertError;
}

async function syncGroceries(household: Household, today: LocalDate, wanted: Wanted[]) {
  const supabase = await createClient();
  const { data: made, error } = await supabase
    .from("shopping_list")
    .select("id, heads_up_id, heads_up_for, checked")
    .not("heads_up_id", "is", null)
    .gte("heads_up_for", today);
  if (error) throw error;
  const want = new Set(wanted.map((w) => key(w.headsUp.id, w.forDate)));
  const stale = (made ?? []).filter((m) => !m.checked && !want.has(key(m.heads_up_id as string, m.heads_up_for as string)));
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from("shopping_list").delete().in("id", stale.map((m) => m.id));
    if (deleteError) throw deleteError;
  }
  const have = new Set((made ?? []).map((m) => key(m.heads_up_id as string, m.heads_up_for as string)));
  for (const w of wanted) {
    if (have.has(key(w.headsUp.id, w.forDate))) continue;
    // Already put on the list once (and since taken off): leave it off.
    if (w.headsUp.last_grocery_for && w.forDate <= w.headsUp.last_grocery_for) continue;
    const itemId = await findOrCreateItem(supabase, household.id, w.headsUp.label);
    const { error: insertError } = await supabase.from("shopping_list").upsert(
      {
        household_id: household.id,
        item_id: itemId,
        source: "heads_up",
        detail: `For ${w.about}`.slice(0, 200),
        week_of: weekStartOf(w.date, household.settings.weekStartsOn),
        status: "approved",
        heads_up_id: w.headsUp.id,
        heads_up_for: w.forDate,
      },
      { onConflict: "heads_up_id,heads_up_for", ignoreDuplicates: true },
    );
    if (insertError) throw insertError;
    await supabase.from("heads_ups").update({ last_grocery_for: w.forDate }).eq("id", w.headsUp.id);
    w.headsUp.last_grocery_for = w.forDate;
  }
}
