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
  return /^\/(chores(\/add|\/blocks)?|lists|calendar)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/chores";
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
  const closed = {
    status,
    completed_on: today,
    completed_at: new Date().toISOString(),
    completed_by: status === "done" ? by : null,
  };
  // If the chore has made a to-do, that to-do is this round.
  const { data: todo } = await supabase
    .from("task_instances")
    .update(closed)
    .eq("template_id", templateId)
    .eq("status", "open")
    .not("list_id", "is", null)
    .select("id")
    .maybeSingle();
  if (todo) {
    await log(household.id, status === "done" ? "task_done" : "task_skipped", "task", todo.id, { name });
    refresh();
    back(formData, "message", status === "done" ? `Done: ${name}.` : `Skipped ${name} this time.`);
  }
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
const SNAPS = ["none", "weekday", "first_of_month", "last_of_month", "first_of_season", "last_of_season"];
const SEASON_NAMES = ["spring", "summer", "fall", "winter"];
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

function readChore(formData: FormData) {
  const name = text(formData, "name");
  const size = text(formData, "size");
  const estText = text(formData, "estMinutes");
  const est = estText ? Number(estText) : null;
  const every = Number(text(formData, "repeatEvery") || "1");
  const unit = text(formData, "repeatUnit");
  const weekdayText = text(formData, "preferredWeekday");
  // "Only in": any time, some seasons, some months, or once a year between two dates.
  const onlyIn = text(formData, "onlyIn") || "any";
  const seasonal = onlyIn === "dates";
  const repeatFrom = text(formData, "repeatFrom") === "date" ? "date" : "done";
  const startDate = text(formData, "startDate");
  const snap = text(formData, "snap") || "none";
  const onlySeasons = formData.getAll("onlySeasons").map(String).filter((s) => SEASON_NAMES.includes(s));
  const onlyMonths = formData.getAll("onlyMonths").map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
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
  if (!SNAPS.includes(snap)) back(formData, "error", "Choose where it lands.");
  if (!seasonal && snap !== "none" && weekday === null) back(formData, "error", "Pick which day of the week it lands on.");
  if (!seasonal && repeatFrom === "date" && !isLocalDate(startDate)) back(formData, "error", "Pick the date it counts from.");
  if (onlyIn === "seasons" && onlySeasons.length === 0) back(formData, "error", "Pick at least one season.");
  if (onlyIn === "months" && onlyMonths.length === 0) back(formData, "error", "Pick at least one month.");
  const snapped = !seasonal && snap !== "none";

  return {
    name,
    icon: readIcon(formData),
    size,
    est_minutes: est,
    repeat_every: seasonal ? 1 : every,
    repeat_unit: seasonal ? "year" : unit,
    preferred_weekday: snapped ? weekday : null,
    snap: snapped ? snap : "none",
    repeat_from: seasonal ? "done" : repeatFrom,
    start_date: !seasonal && repeatFrom === "date" ? startDate : null,
    only_seasons: onlyIn === "seasons" ? onlySeasons : null,
    only_months: onlyIn === "months" ? onlyMonths : null,
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
  // Mistakes go back to the form; once it's added, on to where it shows.
  const doneTo = text(formData, "doneTo");
  if (doneTo) formData.set("returnTo", doneTo);
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
  // A chore's to-do counts as skipping the chore this round. It leaves the
  // list but stays in the chore's history, so it isn't made again at once.
  const { error: choreError } = await supabase
    .from("task_instances")
    .update({ status: "skipped", completed_on: today, completed_at: new Date().toISOString(), list_id: null })
    .eq("id", id)
    .eq("status", "open")
    .not("template_id", "is", null);
  if (choreError) back(formData, "error", choreError.message);
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

// ---------------------------------------------------------------------------
// Chore blocks
// ---------------------------------------------------------------------------

function readBlock(formData: FormData) {
  const name = text(formData, "name");
  const kind = text(formData, "kind") === "closed" ? "closed" : "open";
  const weekdays = [...new Set(formData.getAll("weekdays").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const startTime = text(formData, "startTime");
  const minutes = Number(text(formData, "minutes"));
  const choreId = text(formData, "choreId") || null;
  const presets = [...new Set(formData.getAll("presets").map(String).filter(Boolean))].slice(0, 6);
  if (!name) back(formData, "error", "Give the chore time a name, like Big clean.");
  if (weekdays.length === 0) back(formData, "error", "Pick at least one day.");
  if (!isLocalTime(startTime)) back(formData, "error", "Pick a start time.");
  if (!(Number.isInteger(minutes) && minutes >= 10 && minutes <= 480)) back(formData, "error", "How long: 10 minutes to 8 hours.");
  if (kind === "closed" && !choreId) back(formData, "error", "Pick the chore this time is for.");
  return {
    block: {
      name: name.slice(0, 40),
      icon: readIcon(formData),
      kind,
      chore_id: kind === "closed" ? choreId : null,
      weekdays,
      start_time: startTime,
      minutes,
      member_ids: formData.getAll("memberIds").map(String).filter(Boolean),
      loose: formData.get("loose") === "on",
    },
    presets: kind === "open" ? presets : [],
  };
}

async function savePresets(householdId: string, blockId: string, presets: string[]) {
  const supabase = await createClient();
  await supabase.from("chore_block_presets").delete().eq("block_id", blockId);
  if (presets.length === 0) return;
  const { error } = await supabase
    .from("chore_block_presets")
    .insert(presets.map((choreId, i) => ({ household_id: householdId, block_id: blockId, chore_id: choreId, sort_order: i })));
  if (error) throw error;
}

export async function addBlock(formData: FormData) {
  const household = await requireHousehold();
  const { block, presets } = readBlock(formData);
  const supabase = await createClient();
  const { data, error } = await supabase.from("chore_blocks").insert({ ...block, household_id: household.id }).select("id").single();
  if (error) back(formData, "error", error.message);
  await savePresets(household.id, data.id, presets);
  refresh();
  revalidatePath("/chores/blocks");
  back(formData, "message", `Added ${block.name}.`);
}

export async function updateBlock(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const { block, presets } = readBlock(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("chore_blocks").update(block).eq("id", id);
  if (error) back(formData, "error", error.message);
  await savePresets(household.id, id, presets);
  refresh();
  revalidatePath("/chores/blocks");
  back(formData, "message", `Saved ${block.name}.`);
}

export async function removeBlock(formData: FormData) {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("chore_blocks").delete().eq("id", text(formData, "id"));
  if (error) back(formData, "error", error.message);
  refresh();
  revalidatePath("/chores/blocks");
  back(formData, "message", "Removed that chore time.");
}

/**
 * The example week from the design doc: Laundry on Monday (closed: just laundry),
 * Odd jobs on Wednesday evening and a Big clean on Saturday morning (open).
 */
export async function addExampleBlocks(formData: FormData) {
  const household = await requireHousehold();
  const supabase = await createClient();
  const { data: found } = await supabase.from("task_templates").select("id").ilike("name", "laundry").limit(1).maybeSingle();
  let laundryId = found?.id;
  if (!laundryId) {
    const { data, error } = await supabase
      .from("task_templates")
      .insert({
        household_id: household.id,
        name: "Laundry",
        icon: "🧺",
        size: "big",
        est_minutes: 90,
        repeat_every: 1,
        repeat_unit: "week",
        preferred_weekday: 1,
        snap: "weekday",
        sort_order: 8,
      })
      .select("id")
      .single();
    if (error) back(formData, "error", error.message);
    laundryId = data.id;
  }
  const { data: parents } = await supabase.from("members").select("id").eq("role", "parent");
  const people = (parents ?? []).map((m) => m.id);
  const { data: vacuum } = await supabase.from("task_templates").select("id").eq("name", "Vacuum and mop the floors").maybeSingle();
  const { data: blocks, error } = await supabase
    .from("chore_blocks")
    .insert([
      { household_id: household.id, name: "Laundry", icon: "🧺", kind: "closed", chore_id: laundryId, weekdays: [1], start_time: "18:30", minutes: 90, member_ids: people, sort_order: 1 },
      { household_id: household.id, name: "Odd jobs", icon: "🧰", kind: "open", weekdays: [3], start_time: "19:00", minutes: 45, member_ids: people, sort_order: 2 },
      { household_id: household.id, name: "Big clean", icon: "🧽", kind: "open", weekdays: [6], start_time: "10:00", minutes: 120, member_ids: people, sort_order: 3 },
    ])
    .select("id, name");
  if (error) back(formData, "error", error.message);
  const bigClean = blocks.find((b) => b.name === "Big clean");
  if (bigClean && vacuum) await savePresets(household.id, bigClean.id, [vacuum.id]);
  refresh();
  revalidatePath("/chores/blocks");
  back(formData, "message", "Added Laundry, Odd jobs and Big clean. Change any of them to suit.");
}

/** Swaps a chore out of a block: it waits until after that day, and another due chore takes its place. */
export async function swapOut(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const date = text(formData, "date");
  if (!isLocalDate(date)) back(formData, "error", "Which day?");
  const supabase = await createClient();
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const { error } = await supabase.from("task_instances").update({ not_before: next }).eq("id", id).not("template_id", "is", null);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Swapped. Another chore takes its place.");
}
