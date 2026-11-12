import { createClient } from "@/lib/supabase/server";
import { doseStatus, type DoseStatus } from "@/lib/health";

/*
 * Health trackers and their entries (2026-11-12), for the Health page and
 * the Today panel's Health box.
 */

export type HealthMember = { id: string; name: string; colour: string; icon: string | null };
export type HealthChoice = {
  id: string;
  tracker_id: string;
  name: string;
  icon: string | null;
  wait_minutes: number | null;
  max_per_day: number | null;
  /** By person id. */
  amounts: Record<string, string>;
};
export type HealthTracker = {
  id: string;
  name: string;
  icon: string | null;
  kind: "medicine" | "number" | "note";
  unit: string | null;
  alert_above: number | null;
  member_ids: string[];
  choices: HealthChoice[];
};
export type HealthLog = {
  id: string;
  tracker_id: string;
  member_id: string;
  choice_id: string | null;
  choice_name: string | null;
  logged_at: string;
  amount: string | null;
  value: number | null;
  note: string | null;
};

const LOG_COLUMNS = "id, tracker_id, member_id, choice_id, choice_name, logged_at, amount, value, note";

/** The trackers (with their choices and people) and everyone who has one. */
export async function loadTrackers(): Promise<{ trackers: HealthTracker[]; members: HealthMember[] }> {
  const supabase = await createClient();
  const [trackers, links, choices, amounts, members] = await Promise.all([
    supabase.from("health_trackers").select("id, name, icon, kind, unit, alert_above").order("sort_order").order("name"),
    supabase.from("health_tracker_members").select("tracker_id, member_id"),
    supabase.from("health_choices").select("id, tracker_id, name, icon, wait_minutes, max_per_day").order("sort_order").order("name"),
    supabase.from("health_choice_amounts").select("choice_id, member_id, amount"),
    supabase.from("members").select("id, name, colour, icon").order("sort_order").order("name"),
  ]);
  for (const r of [trackers, links, choices, amounts, members]) if (r.error) throw r.error;
  const list: HealthTracker[] = (trackers.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    kind: t.kind === "medicine" ? "medicine" : t.kind === "number" ? "number" : "note",
    unit: t.unit,
    alert_above: t.alert_above,
    member_ids: (links.data ?? []).filter((l) => l.tracker_id === t.id).map((l) => l.member_id),
    choices: (choices.data ?? [])
      .filter((c) => c.tracker_id === t.id)
      .map((c) => ({ ...c, amounts: Object.fromEntries((amounts.data ?? []).filter((a) => a.choice_id === c.id).map((a) => [a.member_id, a.amount])) })),
  }));
  const tracked = new Set(list.flatMap((t) => t.member_ids));
  return { trackers: list, members: (members.data ?? []).filter((m) => tracked.has(m.id)) };
}

/** Entries from `from` (inclusive) to `to` (exclusive), newest first; for one person or everyone. */
export async function loadHealthLogs(from: Date, to: Date, memberId?: string): Promise<HealthLog[]> {
  const supabase = await createClient();
  let query = supabase.from("health_logs").select(LOG_COLUMNS).gte("logged_at", from.toISOString()).lt("logged_at", to.toISOString());
  if (memberId) query = query.eq("member_id", memberId);
  const { data, error } = await query.order("logged_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** One person's latest dose of each choice, however long ago (for "last" when there was none lately). */
export async function loadLastDoses(choiceIds: string[]): Promise<HealthLog[]> {
  if (choiceIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("health_logs").select(LOG_COLUMNS).in("choice_id", choiceIds).order("logged_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

/** Where each choice stands for a person, from their doses. */
export function choiceStatus(choice: HealthChoice, memberId: string, logs: HealthLog[], now: Date, dayStart: Date): DoseStatus {
  const doses = logs.filter((l) => l.member_id === memberId && l.choice_id === choice.id).map((l) => new Date(l.logged_at));
  return doseStatus(choice, doses, now, dayStart);
}
