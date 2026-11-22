"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, isLocalTime, localDateOf, localTimeOf, zonedToUtc } from "@/lib/time";
import { readDayKind, readEvent, readIds, readLocation, readMinutes } from "./read-event";
import { PEOPLE_COOKIE } from "./data";

/*
 * Like the household actions: each one re-checks the signed-in household,
 * the database security rules check again, and changes go in the activity log.
 */

/** Returns to the calendar view the form came from, with a message. */
function back(formData: FormData, kind: "error" | "message", text: string): never {
  const from = new URLSearchParams(String(formData.get("returnTo") ?? ""));
  const params = new URLSearchParams();
  for (const key of ["view", "date", "panel", "tpl", "week"]) {
    const value = from.get(key);
    if (value && /^[a-z0-9-]+$/.test(value)) params.set(key, value);
  }
  params.set(kind, text);
  // The Today screen sends returnPath "/", the Planner "/review" and Settings › Templates "/templates"; everything else is the calendar.
  const sent = formData.get("returnPath");
  const path = sent === "/" || sent === "/review" || sent === "/templates" ? sent : "/calendar";
  redirect(`${path}?${params.toString()}`);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function log(householdId: string, action: string, targetType: string, targetId: string, name: string) {
  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    household_id: householdId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: { name },
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Makes exactly these people belong to an event (nobody: everyone). */
async function setMembers(householdId: string, eventId: string, ids: string[]): Promise<string | null> {
  const supabase = await createClient();
  const { error: clearError } = await supabase.from("event_members").delete().eq("event_id", eventId);
  if (clearError) return clearError.message;
  if (ids.length === 0) return null;
  const { error } = await supabase.from("event_members").insert(ids.map((id) => ({ event_id: eventId, member_id: id, household_id: householdId })));
  return error?.message ?? null;
}

/** Saves an event's people from the card. */
async function saveStickers(formData: FormData, householdId: string, eventId: string) {
  const error = await setMembers(householdId, eventId, readIds(formData, "memberIds"));
  if (error) back(formData, "error", error);
}

/** Saves what's on an event card as a template, to start new events from. */
async function insertTemplate(
  formData: FormData,
  household: Awaited<ReturnType<typeof requireHousehold>>,
  event: ReturnType<typeof readEvent>,
): Promise<string | null> {
  const supabase = await createClient();
  const startTime = text(formData, "startTime");
  const { data, error } = await supabase
    .from("event_templates")
    .insert({
      household_id: household.id,
      title: event.title,
      icon: event.icon,
      start_time: !event.all_day && isLocalTime(startTime) ? startTime : null,
      // Templates hold up to a day's length; 0 is a point.
      minutes: event.all_day
        ? household.settings.defaultEventMinutes
        : Math.min(Math.round((Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000), 24 * 60),
      all_day: event.all_day,
      member_ids: readIds(formData, "memberIds"),
      notes: event.notes,
      day_kind: event.day_kind,
      location: event.location,
      sort_order: 100,
    })
    .select("id")
    .single();
  if (error) return error.message;
  await log(household.id, "template_added", "event_template", data.id, event.title);
  return null;
}

export async function addEvent(formData: FormData) {
  const household = await requireHousehold();
  const event = readEvent(formData, household.settings, (m) => back(formData, "error", m));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...event, household_id: household.id })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await saveStickers(formData, household.id, data.id);
  await log(household.id, "event_added", "event", data.id, event.title);
  // "Add and save as a template" on the add card.
  const asTemplate = formData.get("saveTemplate") === "on";
  if (asTemplate) {
    const templateError = await insertTemplate(formData, household, event);
    if (templateError) back(formData, "error", `Added ${event.title}, but the template didn't save: ${templateError}`);
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  back(formData, "message", asTemplate ? `Added ${event.title} and saved it as a template.` : `Added ${event.title}.`);
}

export async function updateEvent(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const event = readEvent(formData, household.settings, (m) => back(formData, "error", m));
  const supabase = await createClient();
  const { error } = await supabase.from("events").update(event).eq("id", id);
  if (error) back(formData, "error", error.message);
  await saveStickers(formData, household.id, id);
  await log(household.id, "event_updated", "event", id, event.title);
  // It may change someone's kind of day, which shows everywhere.
  revalidatePath("/", "layout");
  back(formData, "message", `Saved ${event.title}.`);
}

/**
 * "Save as a template" on an existing event's card: the card as it is now
 * (changes included, but the event itself isn't changed) becomes a template.
 */
export async function saveEventAsTemplate(formData: FormData) {
  const household = await requireHousehold();
  const event = readEvent(formData, household.settings, (m) => back(formData, "error", m));
  const templateError = await insertTemplate(formData, household, event);
  if (templateError) back(formData, "error", `The template didn't save: ${templateError}`);
  revalidatePath("/calendar");
  back(formData, "message", `Saved ${event.title} as a template.`);
}

export async function removeEvent(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_removed", "event", id, title);
  revalidatePath("/", "layout");
  back(formData, "message", `Removed ${title}.`);
}

// ---------------------------------------------------------------------------
// Single occurrences of a repeating event
// ---------------------------------------------------------------------------

/** "Skip just this one": hides one date of a repeating event. */
export async function skipOccurrence(formData: FormData) {
  const household = await requireHousehold();
  const eventId = text(formData, "eventId");
  const date = text(formData, "occurrenceDate");
  const title = text(formData, "title");
  if (!isLocalDate(date)) back(formData, "error", "Couldn't tell which date to skip.");
  const supabase = await createClient();
  const { error } = await supabase.from("event_exceptions").upsert(
    { household_id: household.id, event_id: eventId, original_date: date, skipped: true, new_starts_at: null, new_ends_at: null },
    { onConflict: "event_id,original_date" },
  );
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_occurrence_skipped", "event", eventId, `${title} (${date})`);
  revalidatePath("/", "layout");
  back(formData, "message", `Skipped ${title} on ${date}.`);
}

/** "Move just this one": gives one date of a repeating event new times. */
export async function moveOccurrence(formData: FormData) {
  const household = await requireHousehold();
  const { timeZone } = household.settings;
  const eventId = text(formData, "eventId");
  const originalDate = text(formData, "occurrenceDate");
  const title = text(formData, "title");
  const date = text(formData, "newDate");
  const startTime = text(formData, "newStartTime");
  const endTime = text(formData, "newEndTime");
  const allDay = formData.get("allDay") === "true";

  if (!isLocalDate(originalDate) || !isLocalDate(date)) back(formData, "error", "Check the new date.");
  if (!allDay && (!isLocalTime(startTime) || !isLocalTime(endTime))) back(formData, "error", "Add a start and end time.");
  const startsAt = allDay ? zonedToUtc(date, "00:00", timeZone) : zonedToUtc(date, startTime, timeZone);
  const endsAt = allDay ? zonedToUtc(addDays(date, 1), "00:00", timeZone) : zonedToUtc(date, endTime, timeZone);
  if (endsAt < startsAt) back(formData, "error", "It ends before it starts.");

  const supabase = await createClient();
  const { error } = await supabase.from("event_exceptions").upsert(
    {
      household_id: household.id,
      event_id: eventId,
      original_date: originalDate,
      skipped: false,
      new_starts_at: startsAt.toISOString(),
      new_ends_at: endsAt.toISOString(),
    },
    { onConflict: "event_id,original_date" },
  );
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_occurrence_moved", "event", eventId, `${title} (${originalDate})`);
  revalidatePath("/", "layout");
  back(formData, "message", `Moved ${title} on ${originalDate}.`);
}

/** Undoes a skip or move, putting one date back to the usual pattern. */
export async function resetOccurrence(formData: FormData) {
  const household = await requireHousehold();
  const eventId = text(formData, "eventId");
  const date = text(formData, "occurrenceDate");
  const title = text(formData, "title");
  const supabase = await createClient();
  const { error } = await supabase.from("event_exceptions").delete().eq("event_id", eventId).eq("original_date", date);
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_occurrence_reset", "event", eventId, `${title} (${date})`);
  revalidatePath("/", "layout");
  back(formData, "message", `${title} on ${date} is back to normal.`);
}

// ---------------------------------------------------------------------------
// Whose things this screen shows
// ---------------------------------------------------------------------------

/**
 * Tapping a person on the "Showing" card: adds them to, or takes them off,
 * the people this screen shows ("everyone" shows everybody again). Kept in
 * a cookie, so each device (the wall screen, a phone) remembers its own.
 */
export async function choosePeople(formData: FormData) {
  await requireHousehold();
  const supabase = await createClient();
  const { data: members } = await supabase.from("members").select("id");
  const all = (members ?? []).map((m) => m.id);
  const store = await cookies();
  const now = (store.get(PEOPLE_COOKIE)?.value ?? "").split(",").filter((id) => all.includes(id));
  const tapped = text(formData, "memberId");
  let next: string[] = [];
  if (tapped !== "everyone" && all.includes(tapped)) {
    // From everyone, tapping someone shows just them.
    next = now.length === 0 ? [tapped] : now.includes(tapped) ? now.filter((id) => id !== tapped) : [...now, tapped];
  }
  if (next.length === 0 || next.length === all.length) store.delete(PEOPLE_COOKIE);
  else store.set(PEOPLE_COOKIE, next.join(","), { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
  const from = new URLSearchParams(String(formData.get("returnTo") ?? ""));
  const params = new URLSearchParams();
  for (const key of ["view", "date", "panel"]) {
    const value = from.get(key);
    if (value && /^[a-z0-9-]+$/.test(value)) params.set(key, value);
  }
  const path = formData.get("returnPath") === "/" ? "/" : "/calendar";
  const query = params.toString();
  redirect(query ? `${path}?${query}` : path);
}

// ---------------------------------------------------------------------------
// Dragging an event on a timeline
// ---------------------------------------------------------------------------

/**
 * Moves or stretches an event after it's dragged on the Week hour grid.
 * A one-off event just changes; for a repeating event only the dragged
 * date moves (like "Move just this one").
 * Called straight from the browser, so it returns an error instead of redirecting.
 */
export async function rescheduleEvent(input: {
  eventId: string;
  occurrenceDate: string | null;
  date: string;
  startTime: string;
  minutes: number;
}): Promise<{ error?: string }> {
  const household = await requireHousehold();
  const { timeZone } = household.settings;
  const { eventId, occurrenceDate, date, startTime, minutes } = input;
  if (!isLocalDate(date) || !isLocalTime(startTime)) return { error: "Couldn't tell where it was dropped." };
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 24 * 60) return { error: "That length doesn't work." };
  const startsAt = zonedToUtc(date, startTime, timeZone);
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

  const supabase = await createClient();
  const { data: event, error: findError } = await supabase.from("events").select("id, title, recurrence_rule").eq("id", eventId).maybeSingle();
  if (findError || !event) return { error: "Couldn't find that event." };

  if (event.recurrence_rule) {
    if (!occurrenceDate || !isLocalDate(occurrenceDate)) return { error: "Couldn't tell which date to move." };
    const { error } = await supabase.from("event_exceptions").upsert(
      {
        household_id: household.id,
        event_id: eventId,
        original_date: occurrenceDate,
        skipped: false,
        new_starts_at: startsAt.toISOString(),
        new_ends_at: endsAt.toISOString(),
      },
      { onConflict: "event_id,original_date" },
    );
    if (error) return { error: error.message };
    await log(household.id, "event_occurrence_moved", "event", eventId, `${event.title} (${occurrenceDate})`);
  } else {
    const { error } = await supabase
      .from("events")
      .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), all_day: false })
      .eq("id", eventId);
    if (error) return { error: error.message };
    await log(household.id, "event_updated", "event", eventId, event.title);
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  return {};
}

/** The same wall-clock time some days earlier or later. */
function shiftByDays(instant: string, days: number, timeZone: string): Date {
  const at = new Date(instant);
  return zonedToUtc(addDays(localDateOf(at, timeZone), days), localTimeOf(at, timeZone), timeZone);
}

/**
 * Stretching an event sideways on the week view: it starts some days
 * earlier and/or ends some days later (same times), so it runs over
 * several days. Pulling a side back in shortens it. For a repeating event
 * only the stretched date changes (like "Move just this one").
 */
export async function stretchEventDays(input: {
  eventId: string;
  occurrenceDate: string | null;
  daysBefore: number;
  daysAfter: number;
}): Promise<{ error?: string }> {
  const household = await requireHousehold();
  const { eventId, occurrenceDate, daysBefore, daysAfter } = input;
  if (![daysBefore, daysAfter].every((n) => Number.isInteger(n) && Math.abs(n) <= 31)) return { error: "That stretch doesn't work." };
  const supabase = await createClient();
  const { data: event, error: findError } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, all_day, timezone, recurrence_rule")
    .eq("id", eventId)
    .maybeSingle();
  if (findError || !event) return { error: "Couldn't find that event." };
  const tz = event.timezone;

  // Where it is now: the event itself, or this one date of a repeating event.
  let startsAt = event.starts_at;
  let endsAt = event.ends_at;
  if (event.recurrence_rule) {
    if (!occurrenceDate || !isLocalDate(occurrenceDate)) return { error: "Couldn't tell which date to stretch." };
    const { data: moved } = await supabase
      .from("event_exceptions")
      .select("new_starts_at, new_ends_at")
      .eq("event_id", eventId)
      .eq("original_date", occurrenceDate)
      .maybeSingle();
    if (moved?.new_starts_at && moved.new_ends_at) {
      startsAt = moved.new_starts_at;
      endsAt = moved.new_ends_at;
    } else {
      const shift = Math.round((Date.parse(`${occurrenceDate}T00:00:00Z`) - Date.parse(`${localDateOf(new Date(startsAt), tz)}T00:00:00Z`)) / 86_400_000);
      startsAt = shiftByDays(startsAt, shift, tz).toISOString();
      endsAt = shiftByDays(endsAt, shift, tz).toISOString();
    }
  }
  const newStart = shiftByDays(startsAt, -daysBefore, tz);
  const newEnd = shiftByDays(endsAt, daysAfter, tz);
  if (newEnd < newStart) return { error: "It would end before it starts." };

  if (event.recurrence_rule) {
    const { error } = await supabase.from("event_exceptions").upsert(
      {
        household_id: household.id,
        event_id: eventId,
        original_date: occurrenceDate!,
        skipped: false,
        new_starts_at: newStart.toISOString(),
        new_ends_at: newEnd.toISOString(),
      },
      { onConflict: "event_id,original_date" },
    );
    if (error) return { error: error.message };
    await log(household.id, "event_occurrence_moved", "event", eventId, `${event.title} (${occurrenceDate})`);
  } else {
    const { error } = await supabase.from("events").update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() }).eq("id", eventId);
    if (error) return { error: error.message };
    await log(household.id, "event_updated", "event", eventId, event.title);
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  return {};
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function removeTemplate(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("event_templates").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "template_removed", "event_template", id, name);
  revalidatePath("/calendar");
  back(formData, "message", `Removed the ${name} template.`);
}

/** Saves the template card: name, picture, usual start and length, people, kind of day and notes. */
export async function updateTemplate(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const icon = text(formData, "icon");
  const startTime = text(formData, "startTime");
  const allDay = formData.get("allDay") === "on";
  const notes = text(formData, "notes");
  const minutes = readMinutes(formData) ?? household.settings.defaultEventMinutes;
  if (!title) back(formData, "error", "A template needs a name.");
  if (icon && [...icon].length > 8) back(formData, "error", "The picture should be one emoji, like 🦷.");
  if (startTime && !isLocalTime(startTime)) back(formData, "error", "Check the start time.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_templates")
    .update({
      title,
      icon: icon || null,
      start_time: !allDay && startTime ? startTime : null,
      minutes,
      all_day: allDay,
      member_ids: readIds(formData, "memberIds"),
      notes: notes || null,
      day_kind: readDayKind(formData),
      location: readLocation(formData),
    })
    .eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "template_updated", "event_template", id, title);
  revalidatePath("/calendar");
  revalidatePath("/");
  back(formData, "message", `Saved the ${title} template.`);
}
