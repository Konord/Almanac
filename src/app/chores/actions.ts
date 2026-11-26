"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_SETTINGS, requireHousehold, type Household } from "@/lib/household";
import { allBoxes, panelBoxes } from "@/lib/panel-boxes";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { skipChoreNow } from "./skip";
import { readChore, readIcon, readTodo, type Fail } from "./read-task";

/*
 * Like the other screens: each action re-checks the signed-in household,
 * the database's security rules check again, and changes are logged.
 */

/** Where to go back to: the chores, chore setup, lists or Today screen. */
function returnPath(formData: FormData): string {
  const value = String(formData.get("returnTo") ?? "");
  // Only our own pages, never another website.
  return /^\/(chores(\/add)?|lists|calendar)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/chores";
}

function back(formData: FormData, kind: "error" | "message", text: string): never {
  const [base, query = ""] = returnPath(formData).split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("message");
  params.set(kind, text);
  redirect(`${base}?${params.toString()}`);
}

/** Sends a reading problem back to the screen the form came from. */
function problem(formData: FormData): Fail {
  return (message) => back(formData, "error", message);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function log(householdId: string, action: string, targetType: string, targetId: string, details: Record<string, string>) {
  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    household_id: householdId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

function refresh() {
  revalidatePath("/chores");
  revalidatePath("/lists");
  revalidatePath("/");
}


// ---------------------------------------------------------------------------
// Doing and skipping chores
// ---------------------------------------------------------------------------

/** Marks a chore done today. */
export async function markChoreDone(formData: FormData) {
  const household = await requireHousehold();
  const templateId = text(formData, "templateId");
  const name = text(formData, "name");
  const by = text(formData, "memberId") || null;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const closed = { status: "done", completed_on: today, completed_at: new Date().toISOString(), completed_by: by };
  // If the chore is on today's list, that task is this round.
  const { data: todo } = await supabase
    .from("task_instances")
    .update(closed)
    .eq("template_id", templateId)
    .eq("status", "open")
    .not("list_id", "is", null)
    .select("id")
    .maybeSingle();
  let roundId = todo?.id;
  if (!roundId) {
    const { data, error } = await supabase
      .from("task_instances")
      .insert({ household_id: household.id, template_id: templateId, ...closed, due_date: today, assignee_id: by })
      .select("id")
      .single();
    if (error) back(formData, "error", error.message);
    roundId = data.id;
  }
  // Done early: any "wait until" from a skip is over.
  await supabase.from("task_templates").update({ not_before: null }).eq("id", templateId);
  await log(household.id, "task_done", "task", roundId, { name });
  refresh();
  back(formData, "message", `Done: ${name}.`);
}

/** Skips a chore for today (see skipChoreNow). */
export async function skipChore(formData: FormData) {
  const household = await requireHousehold();
  const templateId = text(formData, "templateId");
  const name = text(formData, "name");
  await skipChoreNow(templateId, localDateOf(new Date(), household.settings.timeZone));
  await log(household.id, "task_skipped", "task_template", templateId, { name });
  refresh();
  back(formData, "message", `Skipped ${name} for today.`);
}

/** Takes back a done or skipped round (for a mis-tap). */
export async function undoRound(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("task_instances").delete().eq("id", id).not("template_id", "is", null);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Taken back.");
}

// ---------------------------------------------------------------------------
// To-dos and lists
// ---------------------------------------------------------------------------

/** Whether a list is the household's Chores list. */
async function isChoresList(listId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("task_lists").select("is_chores").eq("id", listId).maybeSingle();
  return Boolean(data?.is_chores);
}

export async function addTodo(formData: FormData) {
  const household = await requireHousehold();
  const listId = text(formData, "listId");
  if (!listId) back(formData, "error", "Choose a list.");
  const todo = (await isChoresList(listId)) ? readChore(formData, problem(formData)) : readTodo(formData, problem(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("task_instances").insert({ ...todo, list_id: listId, household_id: household.id });
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Added "${todo.title}".`);
}

export async function updateTodo(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { data: before } = await supabase.from("task_instances").select("list_id").eq("id", id).maybeSingle();
  if (!before?.list_id) back(formData, "error", "That to-do no longer exists.");
  const chore = await isChoresList(before.list_id);
  const todo = chore ? readChore(formData, problem(formData)) : readTodo(formData, problem(formData));
  // Tasks move between lists, but never on or off the Chores list (delete and remake instead).
  const listId = text(formData, "listId");
  const move = listId && listId !== before.list_id && !chore && !(await isChoresList(listId));
  const { error } = await supabase
    .from("task_instances")
    .update({ ...todo, ...(move ? { list_id: listId } : {}) })
    .eq("id", id)
    .not("list_id", "is", null);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Saved "${todo.title}".`);
}

/** Ticks a to-do off, or back on if it was already done. */
export async function toggleTodo(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { data: todo } = await supabase.from("task_instances").select("id, title, status, assignee_id").eq("id", id).maybeSingle();
  if (!todo) back(formData, "error", "That to-do no longer exists.");
  const done = todo.status !== "done";
  const { error } = await supabase
    .from("task_instances")
    .update(
      done
        ? {
            status: "done",
            completed_on: localDateOf(new Date(), household.settings.timeZone),
            completed_at: new Date().toISOString(),
            completed_by: todo.assignee_id,
          }
        : { status: "open", completed_on: null, completed_at: null, completed_by: null },
    )
    .eq("id", id);
  if (error) back(formData, "error", error.message);
  if (done) await log(household.id, "task_done", "task", id, { name: todo.title ?? "" });
  refresh();
  redirect(returnPath(formData));
}

/** "Do today": a list task with no date goes on today's daily list. */
export async function doToday(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_instances")
    .update({ due_date: localDateOf(new Date(), household.settings.timeZone), date_kind: "start", at_time: null, lead_days: null })
    .eq("id", id)
    .eq("status", "open")
    .is("due_date", null);
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(returnPath(formData));
}

export async function removeTodo(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  // A heads-up's to-do is set aside instead, so it isn't made again.
  const today = localDateOf(new Date(), household.settings.timeZone);
  const { error: skipError } = await supabase
    .from("task_instances")
    .update({ status: "skipped", completed_on: today, completed_at: new Date().toISOString() })
    .eq("id", id)
    .not("heads_up_id", "is", null);
  if (skipError) back(formData, "error", skipError.message);
  // A chore's task: removing it skips the chore for today.
  const { data: chore } = await supabase.from("task_instances").select("template_id, status").eq("id", id).maybeSingle();
  if (chore?.template_id && chore.status === "open") await skipChoreNow(chore.template_id, today);
  const { error: doneChoreError } = await supabase.from("task_instances").update({ list_id: null }).eq("id", id).not("template_id", "is", null);
  if (doneChoreError) back(formData, "error", doneChoreError.message);
  const { error } = await supabase
    .from("task_instances")
    .delete()
    .eq("id", id)
    .not("list_id", "is", null)
    .is("heads_up_id", null)
    .is("template_id", null);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Removed the to-do.");
}

/** Clears the done to-dos off a list. */
export async function clearDone(formData: FormData) {
  const household = await requireHousehold();
  const listId = text(formData, "listId");
  const supabase = await createClient();
  // Heads-up to-dos stay until their day has passed, so they aren't made again.
  const today = localDateOf(new Date(), household.settings.timeZone);
  // Done chore to-dos are the chores' history (when each was last done), so
  // they leave the list but are kept.
  const { error: choreError } = await supabase
    .from("task_instances")
    .update({ list_id: null })
    .eq("list_id", listId)
    .neq("status", "open")
    .not("template_id", "is", null);
  if (choreError) back(formData, "error", choreError.message);
  const { error } = await supabase
    .from("task_instances")
    .delete()
    .eq("list_id", listId)
    .eq("status", "done")
    .is("template_id", null)
    .or(`heads_up_id.is.null,heads_up_for.lt.${today}`);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Cleared the done ones.");
}

/**
 * Puts a list in the Today panel's rotation (the boxes the Daily List flips
 * through) or takes it out (Connor, 2026-11-16: chosen on the list itself).
 * The Chores list's box is the chore bucket. Same as Settings › Today panel.
 */
async function setInRotation(household: Household, listId: string, on: boolean) {
  const supabase = await createClient();
  const { data: lists } = await supabase.from("task_lists").select("id, name, is_chores").order("sort_order").order("name");
  const all = lists ?? [];
  const boxId = all.find((l) => l.id === listId)?.is_chores ? "bucket" : listId;
  const before = panelBoxes(household.settings.panelBoxes, all, false).map((b) => b.id);
  if (before.includes(boxId) === on) return;
  const wanted = new Set(on ? [...before, boxId] : before.filter((id) => id !== boxId));
  // Keep the usual order (allBoxes); there's always at least the Daily List.
  const next = allBoxes(all)
    .map((b) => b.id)
    .filter((id) => wanted.has(id));
  const settings = { ...DEFAULT_SETTINGS, ...household.settings, panelBoxes: next.length ? next : ["today"] };
  const { error } = await supabase.from("households").update({ settings }).eq("id", household.id);
  if (error) throw error;
}

/** "Adults only" on a list: off the kitchen screen, on the phones (Connor, 2026-11-26). */
function listVisibility(formData: FormData): { visibility: "adults" | "everyone" } {
  return { visibility: formData.get("adultsOnly") === "on" ? "adults" : "everyone" };
}

/** Puts an adults-only list back on the kitchen screen. */
export async function showListOnScreen(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("task_lists").update({ visibility: "everyone" }).eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(`/lists?list=${id}`);
}

export async function addList(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  if (!name || name.length > 40) back(formData, "error", "A list needs a short name.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_lists")
    .insert({ household_id: household.id, name, icon: readIcon(formData, problem(formData)), sort_order: 100, ...listVisibility(formData) })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await setInRotation(household, data.id, formData.get("inRotation") === "on");
  refresh();
  const adults = listVisibility(formData).visibility === "adults";
  redirect(adults ? `/lists?message=${encodeURIComponent(`Made the ${name} list. It's adults-only, so it shows on the phones.`)}` : `/lists?list=${data.id}&message=${encodeURIComponent(`Made the ${name} list.`)}`);
}

export async function updateList(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name || name.length > 40) back(formData, "error", "A list needs a short name.");
  const supabase = await createClient();
  // The Chores and Groceries lists can't be adults-only (they're the whole house's).
  const { data: kind } = await supabase.from("task_lists").select("is_chores, is_groceries").eq("id", id).maybeSingle();
  const houseList = Boolean(kind?.is_chores || kind?.is_groceries);
  const { error } = await supabase
    .from("task_lists")
    .update({ name, icon: readIcon(formData, problem(formData)), ...(houseList ? {} : listVisibility(formData)) })
    .eq("id", id);
  if (error) back(formData, "error", error.message);
  await setInRotation(household, id, formData.get("inRotation") === "on");
  refresh();
  if (!houseList && listVisibility(formData).visibility === "adults") redirect(`/lists?message=${encodeURIComponent(`Saved. ${name} is adults-only now, so it shows on the phones.`)}`);
  back(formData, "message", `Saved the ${name} list.`);
}

export async function removeList(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (await isChoresList(id)) back(formData, "error", "The Chores list stays. Rename it if you like.");
  const supabase = await createClient();
  // Keep the chores' history: done chore to-dos leave the list instead of
  // going with it. Open ones are made again on another list.
  const { error: choreError } = await supabase
    .from("task_instances")
    .update({ list_id: null })
    .eq("list_id", id)
    .neq("status", "open")
    .not("template_id", "is", null);
  if (choreError) back(formData, "error", choreError.message);
  const { error } = await supabase.from("task_lists").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(`/lists?message=${encodeURIComponent(`Removed the ${name} list.`)}`);
}
