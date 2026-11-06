"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, isLocalTime, localDateOf } from "@/lib/time";
import { isFeatureLink } from "@/lib/todos";
import { isVisibility } from "../calendar/options";

/*
 * Like the other screens: each action re-checks the signed-in household,
 * the database's security rules check again, and changes are logged.
 */

/** Where to go back to: the chores, chore setup, lists or Today screen. */
function returnPath(formData: FormData): string {
  const value = String(formData.get("returnTo") ?? "");
  // Only our own pages, never another website.
  return /^\/(chores(\/manage)?|lists)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/chores";
}

function back(formData: FormData, kind: "error" | "message", text: string): never {
  const [base, query = ""] = returnPath(formData).split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("message");
  params.set(kind, text);
  redirect(`${base}?${params.toString()}`);
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

function readIcon(formData: FormData): string | null {
  const icon = text(formData, "icon");
  if (icon && [...icon].length > 4) back(formData, "error", "The picture should be one emoji, like 🧹.");
  return icon || null;
}

// ---------------------------------------------------------------------------
// Doing and skipping chores
// ---------------------------------------------------------------------------

/** Marks a chore done (or skipped) today. Skipping just starts its clock again. */
async function closeChore(formData: FormData, status: "done" | "skipped") {
  const household = await requireHousehold();
  const templateId = text(formData, "templateId");
  const name = text(formData, "name");
  const by = text(formData, "memberId") || null;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_instances")
    .insert({
      household_id: household.id,
      template_id: templateId,
      status,
      completed_on: today,
      completed_at: new Date().toISOString(),
      completed_by: status === "done" ? by : null,
      assignee_id: by,
    })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await log(household.id, status === "done" ? "task_done" : "task_skipped", "task", data.id, { name });
  refresh();
  back(formData, "message", status === "done" ? `Done: ${name}.` : `Skipped ${name} this time.`);
}

export async function markChoreDone(formData: FormData) {
  await closeChore(formData, "done");
}

export async function skipChore(formData: FormData) {
  await closeChore(formData, "skipped");
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
// Setting chores up
// ---------------------------------------------------------------------------

const UNITS = ["day", "week", "month", "year"];
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

function readChore(formData: FormData) {
  const name = text(formData, "name");
  const size = text(formData, "size");
  const estText = text(formData, "estMinutes");
  const est = estText ? Number(estText) : null;
  const every = Number(text(formData, "repeatEvery") || "1");
  const unit = text(formData, "repeatUnit");
  const weekdayText = text(formData, "preferredWeekday");
  const seasonal = formData.get("seasonal") === "on";
  // The season comes in as a month and a day for each end, e.g. 10 and 15.
  const monthDay = (prefix: string) => {
    const m = Number(text(formData, `${prefix}Month`));
    const d = Number(text(formData, `${prefix}Day`));
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const seasonStart = monthDay("seasonStart");
  const seasonEnd = monthDay("seasonEnd");
  const location = text(formData, "location") || "indoor";
  const importance = text(formData, "importance") || "normal";
  const visibility = text(formData, "visibility") || "everyone";
  const notes = text(formData, "notes");

  if (!name) back(formData, "error", "A chore needs a name.");
  if (!["small", "medium", "big"].includes(size)) back(formData, "error", "Choose a size.");
  if (est !== null && !(Number.isInteger(est) && est >= 1 && est <= 1440)) back(formData, "error", "Minutes should be a whole number, like 20.");
  if (!seasonal && !(Number.isInteger(every) && every >= 1 && every <= 365)) back(formData, "error", "Repeat every 1 to 365.");
  if (!seasonal && !UNITS.includes(unit)) back(formData, "error", "Choose how often.");
  if (seasonal && (!MONTH_DAY.test(seasonStart) || !MONTH_DAY.test(seasonEnd))) {
    back(formData, "error", "Pick the start and end of the season.");
  }
  if (!["indoor", "outdoor"].includes(location)) back(formData, "error", "Choose indoor or outdoor.");
  if (!["low", "normal", "high"].includes(importance)) back(formData, "error", "Choose how important it is.");
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see this chore.");
  const weekday = weekdayText === "" ? null : Number(weekdayText);
  if (weekday !== null && !(weekday >= 0 && weekday <= 6)) back(formData, "error", "Choose a day of the week.");

  return {
    name,
    icon: readIcon(formData),
    size,
    est_minutes: est,
    repeat_every: seasonal ? 1 : every,
    repeat_unit: seasonal ? "year" : unit,
    preferred_weekday: seasonal ? null : weekday,
    season_start: seasonal ? seasonStart : null,
    season_end: seasonal ? seasonEnd : null,
    location,
    importance,
    default_assignee_id: text(formData, "assigneeId") || null,
    visibility,
    notes: notes || null,
  };
}

export async function addChore(formData: FormData) {
  const household = await requireHousehold();
  const chore = readChore(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_templates")
    .insert({ ...chore, household_id: household.id, sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await log(household.id, "chore_added", "task_template", data.id, { name: chore.name });
  refresh();
  back(formData, "message", `Added ${chore.name}.`);
}

export async function updateChore(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const chore = readChore(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").update(chore).eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "chore_updated", "task_template", id, { name: chore.name });
  refresh();
  back(formData, "message", `Saved ${chore.name}.`);
}

export async function setChoreActive(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const active = text(formData, "active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").update({ active }).eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", active ? "Chore back on." : "Chore paused.");
}

export async function removeChore(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "chore_removed", "task_template", id, { name });
  refresh();
  back(formData, "message", `Removed ${name}.`);
}

// ---------------------------------------------------------------------------
// To-dos and lists
// ---------------------------------------------------------------------------

function readTodo(formData: FormData) {
  const title = text(formData, "title");
  const dueDate = text(formData, "dueDate");
  if (!title) back(formData, "error", "Write what needs doing.");
  if (title.length > 120) back(formData, "error", "Keep it under 120 letters.");
  if (dueDate && !isLocalDate(dueDate)) back(formData, "error", "That date doesn't look right.");
  const dateKind = text(formData, "dateKind") === "start" ? "start" : "due";
  const atTime = text(formData, "atTime");
  if (atTime && !isLocalTime(atTime)) back(formData, "error", "The time should look like 9:30 a.m.");
  const leadText = text(formData, "leadDays");
  const leadDays = leadText === "" ? null : Number(leadText);
  if (leadDays !== null && !(Number.isInteger(leadDays) && leadDays >= 0 && leadDays <= 60)) back(formData, "error", "Show it between 0 and 60 days before.");
  const link = text(formData, "link");
  if (link && !isFeatureLink(link)) back(formData, "error", "Choose a part of the app for it to open.");
  return {
    title,
    icon: readIcon(formData),
    due_date: dueDate || null,
    date_kind: dateKind,
    // Only a to-do that starts on a day can have a time.
    at_time: dueDate && dateKind === "start" && atTime ? atTime : null,
    lead_days: dateKind === "due" ? leadDays : null,
    link: link || null,
    assignee_id: text(formData, "assigneeId") || null,
    notes: text(formData, "notes") || null,
  };
}

export async function addTodo(formData: FormData) {
  const household = await requireHousehold();
  const listId = text(formData, "listId");
  if (!listId) back(formData, "error", "Choose a list.");
  const todo = readTodo(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("task_instances").insert({ ...todo, list_id: listId, household_id: household.id });
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Added "${todo.title}".`);
}

export async function updateTodo(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const todo = readTodo(formData);
  const listId = text(formData, "listId");
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_instances")
    .update({ ...todo, ...(listId ? { list_id: listId } : {}) })
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

export async function removeTodo(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("task_instances").delete().eq("id", id).not("list_id", "is", null);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Removed the to-do.");
}

/** Clears the done to-dos off a list. */
export async function clearDone(formData: FormData) {
  await requireHousehold();
  const listId = text(formData, "listId");
  const supabase = await createClient();
  const { error } = await supabase.from("task_instances").delete().eq("list_id", listId).eq("status", "done");
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Cleared the done ones.");
}

export async function addList(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "name");
  if (!name || name.length > 40) back(formData, "error", "A list needs a short name.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_lists")
    .insert({ household_id: household.id, name, icon: readIcon(formData), sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(`/lists?list=${data.id}&message=${encodeURIComponent(`Made the ${name} list.`)}`);
}

export async function updateList(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name || name.length > 40) back(formData, "error", "A list needs a short name.");
  const supabase = await createClient();
  const { error } = await supabase.from("task_lists").update({ name, icon: readIcon(formData) }).eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Saved the ${name} list.`);
}

export async function removeList(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("task_lists").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(`/lists?message=${encodeURIComponent(`Removed the ${name} list.`)}`);
}
