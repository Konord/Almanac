"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isPersonColour } from "@/lib/colours";
import { requireHousehold, type HouseholdSettings } from "@/lib/household";
import { fillTimes } from "@/lib/quick-times";
import { createClient } from "@/lib/supabase/server";
import { buildRule, isValidRule, type RepeatEnd, type RepeatFrequency } from "@/lib/recurrence";
import { addDays, isLocalDate, isLocalTime, zonedToUtc } from "@/lib/time";
import { dayOfWeek } from "@/lib/calendar-layout";
import { isVisibility } from "./options";
import { VIEW_COOKIE } from "./data";

/*
 * Like the household actions: each one re-checks the signed-in household,
 * the database security rules check again, and changes go in the activity log.
 */

/** Returns to the calendar view the form came from, with a message. */
function back(formData: FormData, kind: "error" | "message", text: string): never {
  const from = new URLSearchParams(String(formData.get("returnTo") ?? ""));
  const params = new URLSearchParams();
  for (const key of ["view", "date", "panel"]) {
    const value = from.get(key);
    if (value && /^[a-z0-9-]+$/.test(value)) params.set(key, value);
  }
  params.set(kind, text);
  // The Today screen sends returnPath "/"; everything else is the calendar.
  const path = formData.get("returnPath") === "/" ? "/" : "/calendar";
  redirect(`${path}?${params.toString()}`);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalId(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
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
// Layers
// ---------------------------------------------------------------------------

function readLayer(formData: FormData) {
  const name = text(formData, "name");
  const colour = text(formData, "colour");
  const visibility = text(formData, "visibility");
  if (!name) back(formData, "error", "A layer needs a name.");
  if (!isPersonColour(colour)) back(formData, "error", "Choose a colour.");
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see this layer.");
  return {
    name,
    colour,
    visibility,
    owner_member_id: optionalId(formData, "ownerMemberId"),
    counts_toward_busyness: formData.get("countsTowardBusyness") === "on",
  };
}

export async function addLayer(formData: FormData) {
  const household = await requireHousehold();
  const layer = readLayer(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("layers")
    .insert({ ...layer, household_id: household.id, sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await log(household.id, "layer_added", "layer", data.id, layer.name);
  revalidatePath("/calendar");
  back(formData, "message", `Added the ${layer.name} layer.`);
}

export async function updateLayer(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const layer = readLayer(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("layers").update(layer).eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "layer_updated", "layer", id, layer.name);
  revalidatePath("/calendar");
  back(formData, "message", `Saved the ${layer.name} layer.`);
}

export async function removeLayer(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("layers").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "layer_removed", "layer", id, name);
  revalidatePath("/calendar");
  back(formData, "message", `Removed the ${name} layer and its events.`);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function readEvent(formData: FormData, settings: HouseholdSettings) {
  const timeZone = settings.timeZone;
  const title = text(formData, "title");
  const layerId = text(formData, "layerId");
  const startDate = text(formData, "startDate");
  const energyCost = Number(text(formData, "energyCost") || "1");
  const visibility = text(formData, "visibility") || "everyone";
  const notes = text(formData, "notes");
  const icon = text(formData, "icon");

  if (!title) back(formData, "error", "An event needs a title.");
  if (!layerId) back(formData, "error", "Choose a layer.");
  const endDateInput = text(formData, "endDate") || startDate;
  if (!isLocalDate(startDate) || !isLocalDate(endDateInput)) back(formData, "error", "Check the dates.");
  if (endDateInput < startDate) back(formData, "error", "The end date is before the start date.");
  // Blank times mean all day; a start time alone gets the usual length.
  const times = fillTimes({
    allDay: formData.get("allDay") === "on",
    startDate,
    endDate: endDateInput,
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    // The quick-add card sends a length; the full form uses the usual length.
    defaultMinutes: readMinutes(formData) ?? settings.defaultEventMinutes,
  });
  if (!times) back(formData, "error", "Add a start time (the end time is optional), or leave both blank for all day.");
  if (icon && [...icon].length > 4) back(formData, "error", "The picture should be one emoji, like 🦷.");
  if (![0, 1, 2, 3].includes(energyCost)) back(formData, "error", "Choose an energy cost.");
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see this event.");

  const allDay = times.allDay;
  const endDate = times.allDay ? endDateInput : times.endDate;
  // All-day events run from midnight on the start date to midnight after the end date.
  const startsAt = times.allDay ? zonedToUtc(startDate, "00:00", timeZone) : zonedToUtc(startDate, times.startTime, timeZone);
  const endsAt = times.allDay
    ? zonedToUtc(addDays(endDate, 1), "00:00", timeZone)
    : zonedToUtc(endDate, times.endTime, timeZone);
  if (endsAt < startsAt) back(formData, "error", "The event ends before it starts.");

  const recurrenceRule = readRepeat(formData, startDate);

  return {
    title,
    layer_id: layerId,
    recurrence_rule: recurrenceRule,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    all_day: allDay,
    timezone: timeZone,
    member_id: optionalId(formData, "memberId"),
    energy_cost: energyCost,
    visibility,
    notes: notes || null,
    icon: icon || null,
  };
}

/** A length in minutes from the quick-add card, if it sent a sensible one. */
function readMinutes(formData: FormData): number | null {
  const minutes = Number(text(formData, "minutes"));
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 24 * 60 ? minutes : null;
}

const FREQUENCIES: RepeatFrequency[] = ["none", "daily", "weekly", "monthly", "yearly"];
const ENDS: RepeatEnd[] = ["never", "on", "after"];

/** Turns the "Repeats" fields into an RRULE string, or null. */
function readRepeat(formData: FormData, startDate: string): string | null {
  const frequency = text(formData, "repeatFrequency") as RepeatFrequency;
  if (!FREQUENCIES.includes(frequency) || frequency === "none") return null;
  const interval = Number(text(formData, "repeatInterval") || "1");
  const end = text(formData, "repeatEnd") as RepeatEnd;
  const until = text(formData, "repeatUntil");
  const count = Number(text(formData, "repeatCount"));
  const weekdays = formData.getAll("repeatWeekdays").map(Number).filter((d) => d >= 0 && d <= 6);

  if (!Number.isInteger(interval) || interval < 1 || interval > 52) back(formData, "error", "Repeat every 1 to 52.");
  if (!ENDS.includes(end)) back(formData, "error", "Choose when the repeat ends.");
  if (end === "on" && (!isLocalDate(until) || until < startDate)) back(formData, "error", "Pick an end date on or after the first date.");
  if (end === "after" && (!Number.isInteger(count) || count < 1 || count > 500)) back(formData, "error", "Repeat between 1 and 500 times.");

  const rule = buildRule({
    frequency,
    interval,
    weekdays: frequency === "weekly" && weekdays.length === 0 ? [dayOfWeek(startDate)] : weekdays,
    end,
    until: end === "on" ? until : null,
    count: end === "after" ? count : null,
  });
  if (rule && !isValidRule(rule)) back(formData, "error", "That repeat pattern didn't work. Try a simpler one.");
  return rule;
}

export async function addEvent(formData: FormData) {
  const household = await requireHousehold();
  const event = readEvent(formData, household.settings);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...event, household_id: household.id })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_added", "event", data.id, event.title);
  revalidatePath("/calendar");
  back(formData, "message", `Added ${event.title}.`);
}

export async function updateEvent(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const event = readEvent(formData, household.settings);
  const supabase = await createClient();
  const { error } = await supabase.from("events").update(event).eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_updated", "event", id, event.title);
  revalidatePath("/calendar");
  back(formData, "message", `Saved ${event.title}.`);
}

export async function removeEvent(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "event_removed", "event", id, title);
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
  back(formData, "message", `${title} on ${date} is back to normal.`);
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------

function readView(formData: FormData) {
  const name = text(formData, "name");
  const layerIds = formData.getAll("layerIds").map(String).filter(Boolean);
  if (!name) back(formData, "error", "A view needs a name.");
  if (layerIds.length === 0) back(formData, "error", "Pick at least one layer for the view.");
  return { name, layer_ids: layerIds };
}

export async function addView(formData: FormData) {
  const household = await requireHousehold();
  const view = readView(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("views")
    .insert({ ...view, household_id: household.id })
    .select("id")
    .single();
  if (error) back(formData, "error", error.code === "23505" ? `There's already a view called ${view.name}.` : error.message);
  await log(household.id, "view_added", "view", data.id, view.name);
  revalidatePath("/calendar");
  back(formData, "message", `Added the ${view.name} view.`);
}

export async function updateView(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const view = readView(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("views").update(view).eq("id", id);
  if (error) back(formData, "error", error.code === "23505" ? `There's already a view called ${view.name}.` : error.message);
  await log(household.id, "view_updated", "view", id, view.name);
  revalidatePath("/calendar");
  back(formData, "message", `Saved the ${view.name} view.`);
}

export async function removeView(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("views").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "view_removed", "view", id, name);
  revalidatePath("/calendar");
  back(formData, "message", `Removed the ${name} view.`);
}

/**
 * Picks which view this screen shows. The choice is kept in a cookie, so
 * each device (the wall screen, a phone) remembers its own.
 */
export async function chooseView(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "viewId");
  const store = await cookies();
  if (id) {
    store.set(VIEW_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax", httpOnly: true });
  } else {
    store.delete(VIEW_COOKIE);
  }
  revalidatePath("/", "layout");
  const from = new URLSearchParams(String(formData.get("returnTo") ?? ""));
  const params = new URLSearchParams();
  for (const key of ["view", "date"]) {
    const value = from.get(key);
    if (value && /^[a-z0-9-]+$/.test(value)) params.set(key, value);
  }
  const path = formData.get("returnPath") === "/" ? "/" : "/calendar";
  const query = params.toString();
  redirect(query ? `${path}?${query}` : path);
}
