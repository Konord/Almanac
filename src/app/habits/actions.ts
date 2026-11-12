"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, isLocalTime, localDateOf, zonedToUtc } from "@/lib/time";

/*
 * Logging habits and health entries, from the Today panel and the Health
 * page. Almanac never blocks a dose: the screen warns when one is too
 * soon, and the dose is saved either way.
 */

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/habits/health");
  revalidatePath("/calendar");
  revalidatePath("/");
}

/** Only our own screens, never another website. */
function safeReturn(value: FormDataEntryValue | null, fallback: string): string {
  const v = String(value ?? "");
  return /^\/(calendar|habits(\/health)?)?(\?[\w=&%.:-]*)?$/.test(v) ? v : fallback;
}

export type HealthEntry = {
  trackerId: string;
  memberId: string;
  choiceId?: string | null;
  amount?: string | null;
  value?: number | null;
  note?: string | null;
  /** How long ago it happened, or a time today ("HH:MM", yesterday if that's still to come). */
  minutesAgo?: number;
  at?: string;
};

/** Logs a dose, a reading or a note. */
export async function logHealth(entry: HealthEntry): Promise<Result> {
  const household = await requireHousehold();
  const { timeZone } = household.settings;
  const supabase = await createClient();
  const { data: tracker, error } = await supabase
    .from("health_trackers")
    .select("id, kind, health_tracker_members (member_id), health_choices (id, name)")
    .eq("id", entry.trackerId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!tracker) return { ok: false, error: "That tracker is gone." };
  if (!tracker.health_tracker_members.some((m) => m.member_id === entry.memberId)) return { ok: false, error: "That tracker isn't for them." };

  const now = new Date();
  let when = now;
  if (entry.at && isLocalTime(entry.at)) {
    const today = localDateOf(now, timeZone);
    when = zonedToUtc(today, entry.at, timeZone);
    if (when > now) when = zonedToUtc(addDays(today, -1), entry.at, timeZone);
  } else if (entry.minutesAgo && entry.minutesAgo > 0) {
    when = new Date(now.getTime() - Math.min(entry.minutesAgo, 24 * 60) * 60_000);
  }

  const row: Record<string, unknown> = { household_id: household.id, tracker_id: tracker.id, member_id: entry.memberId, logged_at: when.toISOString() };
  if (tracker.kind === "medicine") {
    const choice = tracker.health_choices.find((c) => c.id === entry.choiceId);
    if (!choice) return { ok: false, error: "Pick which one." };
    row.choice_id = choice.id;
    row.choice_name = choice.name;
    row.amount = entry.amount?.trim().slice(0, 20) || null;
  } else if (tracker.kind === "number") {
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) return { ok: false, error: "Type a number." };
    row.value = Math.round(entry.value * 100) / 100;
  } else {
    const note = entry.note?.trim();
    if (!note) return { ok: false, error: "Write a few words." };
    row.note = note.slice(0, 200);
  }
  const { error: saveError } = await supabase.from("health_logs").insert(row as never);
  if (saveError) return { ok: false, error: saveError.message };
  refresh();
  return { ok: true };
}

/** Fixes an entry's time or what was written (from the Health page). */
export async function updateHealthLog(formData: FormData) {
  const household = await requireHousehold();
  const back = safeReturn(formData.get("returnTo"), "/habits/health");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data: log } = await supabase.from("health_logs").select("id, logged_at, choice_id, value, note").eq("id", id).maybeSingle();
  if (!log) redirect(back);
  const { timeZone } = household.settings;
  const time = String(formData.get("time") ?? "");
  const change: Record<string, unknown> = {};
  if (isLocalTime(time)) {
    const date = localDateOf(new Date(log.logged_at), timeZone);
    change.logged_at = zonedToUtc(date, time, timeZone).toISOString();
  }
  if (log.choice_id !== null) change.amount = String(formData.get("amount") ?? "").trim().slice(0, 20) || null;
  if (log.value !== null) {
    const value = Number(formData.get("value"));
    if (Number.isFinite(value)) change.value = Math.round(value * 100) / 100;
  }
  if (log.note !== null) {
    const note = String(formData.get("note") ?? "").trim().slice(0, 200);
    if (note) change.note = note;
  }
  await supabase.from("health_logs").update(change as never).eq("id", id);
  refresh();
  redirect(back);
}

/** Removes an entry (from the Health page). */
export async function deleteHealthLog(formData: FormData) {
  await requireHousehold();
  const back = safeReturn(formData.get("returnTo"), "/habits/health");
  const supabase = await createClient();
  await supabase.from("health_logs").delete().eq("id", String(formData.get("id") ?? ""));
  refresh();
  redirect(back);
}

/**
 * Ticks a check habit on or off for a day, or adds one tap's worth to a
 * count habit (from the Today panel's Habits box).
 */
export async function tapHabit(formData: FormData) {
  const household = await requireHousehold();
  const back = safeReturn(formData.get("returnTo"), "/calendar");
  const habitId = String(formData.get("habit") ?? "");
  const memberId = String(formData.get("member") ?? "");
  const date = String(formData.get("date") ?? "");
  const undo = formData.get("undo") === "1";
  if (!isLocalDate(date)) redirect(back);
  const supabase = await createClient();
  const { data: habit } = await supabase.from("habits").select("id, measure, step").eq("id", habitId).maybeSingle();
  if (!habit) redirect(back);
  const { data: now } = await supabase.from("habit_logs").select("id, amount").eq("habit_id", habitId).eq("member_id", memberId).eq("log_date", date).maybeSingle();
  const before = now?.amount ?? 0;
  const amount = habit.measure === "count" ? Math.max(0, before + (undo ? -habit.step : habit.step)) : before > 0 ? 0 : 1;
  if (amount === 0) {
    if (now) await supabase.from("habit_logs").delete().eq("id", now.id);
  } else {
    await supabase
      .from("habit_logs")
      .upsert({ household_id: household.id, habit_id: habitId, member_id: memberId, log_date: date, amount }, { onConflict: "habit_id,member_id,log_date" });
  }
  refresh();
  redirect(back);
}
