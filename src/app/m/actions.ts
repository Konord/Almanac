"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, localDateOf } from "@/lib/time";
import { readEvent, readIds } from "../calendar/read-event";
import { readChore, readTodo } from "../chores/read-task";

/*
 * The phone's actions. They do the same as the calendar's and the lists'
 * (and use the same field readers), but answer the screen instead of
 * sending it somewhere else: the phone keeps its place and shows "Saved",
 * or the problem beside Save.
 */

export type PhoneResult = { ok: true; id?: string } | { ok: false; error: string };

/** A problem reading the fields (thrown by `fail`, caught below). */
class Problem extends Error {}
const fail = (message: string): never => {
  throw new Problem(message);
};

async function attempt(run: () => Promise<PhoneResult>): Promise<PhoneResult> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Problem) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "That didn't save. Try again." };
  }
}

async function log(householdId: string, action: string, targetType: string, targetId: string, name: string) {
  const supabase = await createClient();
  await supabase.from("activity_log").insert({ household_id: householdId, action, target_type: targetType, target_id: targetId, details: { name } });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Makes exactly these people belong to an event (nobody: everyone). */
async function setMembers(householdId: string, eventId: string, ids: string[]) {
  const supabase = await createClient();
  const { error: clearError } = await supabase.from("event_members").delete().eq("event_id", eventId);
  if (clearError) fail(clearError.message);
  if (ids.length === 0) return;
  const { error } = await supabase.from("event_members").insert(ids.map((id) => ({ event_id: eventId, member_id: id, household_id: householdId })));
  if (error) fail(error.message);
}

/** Adds an event, or saves one (every date, for a repeating one) when the form has an id. */
export async function saveEvent(formData: FormData): Promise<PhoneResult> {
  return attempt(async () => {
    const household = await requireHousehold();
    const event = readEvent(formData, household.settings, fail);
    const supabase = await createClient();
    const id = String(formData.get("id") ?? "");
    let eventId = id;
    if (id) {
      const { error } = await supabase.from("events").update(event).eq("id", id);
      if (error) fail(error.message);
    } else {
      const { data, error } = await supabase
        .from("events")
        .insert({ ...event, household_id: household.id })
        .select("id")
        .single();
      if (error) fail(error.message);
      eventId = data!.id;
    }
    await setMembers(household.id, eventId, readIds(formData, "memberIds"));
    await log(household.id, id ? "event_updated" : "event_added", "event", eventId, event.title);
    revalidatePath("/", "layout");
    return { ok: true, id: eventId };
  });
}

export async function deleteEvent(id: string, title: string): Promise<PhoneResult> {
  return attempt(async () => {
    const household = await requireHousehold();
    const supabase = await createClient();
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) fail(error.message);
    await log(household.id, "event_removed", "event", id, title);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Skips one date of a repeating event (the rest stay). */
export async function skipEventDate(eventId: string, date: string, title: string): Promise<PhoneResult> {
  return attempt(async () => {
    const household = await requireHousehold();
    if (!isLocalDate(date)) fail("Couldn't tell which date to skip.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("event_exceptions")
      .upsert(
        { household_id: household.id, event_id: eventId, original_date: date, skipped: true, new_starts_at: null, new_ends_at: null },
        { onConflict: "event_id,original_date" },
      );
    if (error) fail(error.message);
    await log(household.id, "event_occurrence_skipped", "event", eventId, `${title} (${date})`);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// To-dos and one-off chores
// ---------------------------------------------------------------------------

function refreshLists() {
  revalidatePath("/chores");
  revalidatePath("/lists");
  revalidatePath("/m/lists");
  revalidatePath("/");
}

/** Adds a to-do to a list, or a one-off chore to the Chores list. */
export async function addTask(formData: FormData): Promise<PhoneResult> {
  return attempt(async () => {
    const household = await requireHousehold();
    const listId = String(formData.get("listId") ?? "");
    if (!listId) fail("Choose a list.");
    const supabase = await createClient();
    const { data: list } = await supabase.from("task_lists").select("is_chores, is_groceries").eq("id", listId).maybeSingle();
    if (!list || list.is_groceries) fail("Choose a list.");
    const task = list!.is_chores ? readChore(formData, fail) : readTodo(formData, fail);
    const { data, error } = await supabase
      .from("task_instances")
      .insert({ ...task, list_id: listId, household_id: household.id })
      .select("id")
      .single();
    if (error) fail(error.message);
    refreshLists();
    return { ok: true, id: data!.id };
  });
}

/** Ticks a to-do off, or back on. */
export async function tickTask(id: string, done: boolean): Promise<PhoneResult> {
  return attempt(async () => {
    const household = await requireHousehold();
    const supabase = await createClient();
    const { data: task } = await supabase.from("task_instances").select("title, assignee_id").eq("id", id).maybeSingle();
    if (!task) fail("That to-do is gone.");
    const { error } = await supabase
      .from("task_instances")
      .update(
        done
          ? {
              status: "done",
              completed_on: localDateOf(new Date(), household.settings.timeZone),
              completed_at: new Date().toISOString(),
              completed_by: task!.assignee_id,
            }
          : { status: "open", completed_on: null, completed_at: null, completed_by: null },
      )
      .eq("id", id);
    if (error) fail(error.message);
    if (done) await log(household.id, "task_done", "task", id, task!.title ?? "");
    refreshLists();
    return { ok: true };
  });
}
