"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMemberColour } from "@/lib/colours";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, isLocalTime, zonedToUtc } from "@/lib/time";
import { isVisibility } from "./options";

/*
 * Like the household actions: each one re-checks the signed-in household,
 * the database security rules check again, and changes go in the activity log.
 */

function back(kind: "error" | "message", text: string): never {
  redirect(`/calendar?${kind}=${encodeURIComponent(text)}`);
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
  if (!name) back("error", "A layer needs a name.");
  if (!isMemberColour(colour)) back("error", "Choose a colour.");
  if (!isVisibility(visibility)) back("error", "Choose who can see this layer.");
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
  if (error) back("error", error.message);
  await log(household.id, "layer_added", "layer", data.id, layer.name);
  revalidatePath("/calendar");
  back("message", `Added the ${layer.name} layer.`);
}

export async function updateLayer(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const layer = readLayer(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("layers").update(layer).eq("id", id);
  if (error) back("error", error.message);
  await log(household.id, "layer_updated", "layer", id, layer.name);
  revalidatePath("/calendar");
  back("message", `Saved the ${layer.name} layer.`);
}

export async function removeLayer(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("layers").delete().eq("id", id);
  if (error) back("error", error.message);
  await log(household.id, "layer_removed", "layer", id, name);
  revalidatePath("/calendar");
  back("message", `Removed the ${name} layer and its events.`);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function readEvent(formData: FormData, timeZone: string) {
  const title = text(formData, "title");
  const layerId = text(formData, "layerId");
  const startDate = text(formData, "startDate");
  const endDate = text(formData, "endDate") || startDate;
  const allDay = formData.get("allDay") === "on";
  const startTime = text(formData, "startTime");
  const endTime = text(formData, "endTime");
  const energyCost = Number(text(formData, "energyCost"));
  const visibility = text(formData, "visibility");
  const notes = text(formData, "notes");

  if (!title) back("error", "An event needs a title.");
  if (!layerId) back("error", "Choose a layer.");
  if (!isLocalDate(startDate) || !isLocalDate(endDate)) back("error", "Check the dates.");
  if (endDate < startDate) back("error", "The end date is before the start date.");
  if (!allDay && (!isLocalTime(startTime) || !isLocalTime(endTime))) {
    back("error", "Add a start and end time, or tick All day.");
  }
  if (![0, 1, 2, 3].includes(energyCost)) back("error", "Choose an energy cost.");
  if (!isVisibility(visibility)) back("error", "Choose who can see this event.");

  // All-day events run from midnight on the start date to midnight after the end date.
  const startsAt = allDay ? zonedToUtc(startDate, "00:00", timeZone) : zonedToUtc(startDate, startTime, timeZone);
  const endsAt = allDay
    ? zonedToUtc(addDays(endDate, 1), "00:00", timeZone)
    : zonedToUtc(endDate, endTime, timeZone);
  if (endsAt < startsAt) back("error", "The event ends before it starts.");

  return {
    title,
    layer_id: layerId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    all_day: allDay,
    timezone: timeZone,
    member_id: optionalId(formData, "memberId"),
    energy_cost: energyCost,
    visibility,
    notes: notes || null,
  };
}

export async function addEvent(formData: FormData) {
  const household = await requireHousehold();
  const event = readEvent(formData, household.settings.timeZone);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...event, household_id: household.id })
    .select("id")
    .single();
  if (error) back("error", error.message);
  await log(household.id, "event_added", "event", data.id, event.title);
  revalidatePath("/calendar");
  back("message", `Added ${event.title}.`);
}

export async function updateEvent(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const event = readEvent(formData, household.settings.timeZone);
  const supabase = await createClient();
  const { error } = await supabase.from("events").update(event).eq("id", id);
  if (error) back("error", error.message);
  await log(household.id, "event_updated", "event", id, event.title);
  revalidatePath("/calendar");
  back("message", `Saved ${event.title}.`);
}

export async function removeEvent(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) back("error", error.message);
  await log(household.id, "event_removed", "event", id, title);
  revalidatePath("/calendar");
  back("message", `Removed ${title}.`);
}
