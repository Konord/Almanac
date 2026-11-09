"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { isChoreTag } from "@/lib/chore-days";
import { isLocalDate, isLocalTime, localDateOf } from "@/lib/time";
import { isFeatureLink } from "@/lib/todos";
import { isVisibility } from "../calendar/options";
import { skipChoreNow } from "./skip";

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
// Setting chores up
// ---------------------------------------------------------------------------

const UNITS = ["day", "week", "month", "year"];
const SNAPS = ["none", "weekday", "first_of_month", "last_of_month", "first_of_season", "last_of_season"];
const SEASON_NAMES = ["spring", "summer", "fall", "winter"];
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

function readChore(formData: FormData) {
  const name = text(formData, "name");
  const kind = text(formData, "kind") === "preset" ? "preset" : "generated";
  const tags = [...new Set(formData.getAll("tags").map(String))].filter(isChoreTag);
  const atTime = text(formData, "atTime");
  const choreDayIds = [...new Set(formData.getAll("choreDayIds").map(String).filter(Boolean))];
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
  const visibility = text(formData, "visibility") || "everyone";
  const notes = text(formData, "notes");

  if (!name) back(formData, "error", "A chore needs a name.");
  if (kind === "preset" && choreDayIds.length === 0) back(formData, "error", "An every-chore-day chore needs a chore day.");
  if (atTime && !isLocalTime(atTime)) back(formData, "error", "The time should look like 7:00 p.m.");
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see this chore.");
  const common = {
    name,
    icon: readIcon(formData),
    kind,
    tags,
    at_time: atTime || null,
    default_assignee_id: text(formData, "assigneeId") || null,
    visibility,
    notes: notes || null,
  };
  // Every-chore-day chores follow their chore day, so they have no date rule.
  if (kind === "preset") return { choreDayIds, chore: { ...common, ...NO_RULE } };
  if (!seasonal && !(Number.isInteger(every) && every >= 1 && every <= 365)) back(formData, "error", "Repeat every 1 to 365.");
  if (!seasonal && !UNITS.includes(unit)) back(formData, "error", "Choose how often.");
  if (seasonal && (!MONTH_DAY.test(seasonStart) || !MONTH_DAY.test(seasonEnd))) {
    back(formData, "error", "Pick the start and end of the season.");
  }
  const weekday = weekdayText === "" ? null : Number(weekdayText);
  if (weekday !== null && !(weekday >= 0 && weekday <= 6)) back(formData, "error", "Choose a day of the week.");
  if (!SNAPS.includes(snap)) back(formData, "error", "Choose where it lands.");
  if (!seasonal && snap !== "none" && weekday === null) back(formData, "error", "Pick which day of the week it lands on.");
  if (!seasonal && repeatFrom === "date" && !isLocalDate(startDate)) back(formData, "error", "Pick the date it counts from.");
  if (onlyIn === "seasons" && onlySeasons.length === 0) back(formData, "error", "Pick at least one season.");
  if (onlyIn === "months" && onlyMonths.length === 0) back(formData, "error", "Pick at least one month.");
  const snapped = !seasonal && snap !== "none";

  return {
    choreDayIds,
    chore: {
      ...common,
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
    },
  };
}

const NO_RULE = {
  repeat_every: 1,
  repeat_unit: "week",
  preferred_weekday: null,
  snap: "none",
  repeat_from: "done",
  start_date: null,
  only_seasons: null,
  only_months: null,
  season_start: null,
  season_end: null,
};

/** Saves which chore days a chore may go on. */
async function saveChoreDays(householdId: string, templateId: string, choreDayIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("task_template_chore_days").delete().eq("template_id", templateId);
  if (error) throw error;
  if (choreDayIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("task_template_chore_days")
    .insert(choreDayIds.map((id) => ({ household_id: householdId, template_id: templateId, chore_day_id: id })));
  if (insertError) throw insertError;
}

export async function addChore(formData: FormData) {
  const household = await requireHousehold();
  const { chore, choreDayIds } = readChore(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_templates")
    .insert({ ...chore, household_id: household.id, sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await saveChoreDays(household.id, data.id, choreDayIds);
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
  const { chore, choreDayIds } = readChore(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").update(chore).eq("id", id);
  if (error) back(formData, "error", error.message);
  await saveChoreDays(household.id, id, choreDayIds);
  // The chore changed: today's task for it is made again to match.
  await supabase.from("task_instances").delete().eq("template_id", id).eq("status", "open");
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
    // A one-off chore: no date of its own, it waits for this chore day.
    chore_day_id: dueDate ? null : text(formData, "choreDayId") || null,
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
// Chore days
// ---------------------------------------------------------------------------

function readChoreDay(formData: FormData, isFree: boolean) {
  const name = text(formData, "name");
  const weekdays = [...new Set(formData.getAll("weekdays").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const maxTasks = Number(text(formData, "maxTasks"));
  const maxBig = Number(text(formData, "maxBig"));
  if (!name || name.length > 40) back(formData, "error", "Give the chore day a short name, like Laundry.");
  if (!isFree && weekdays.length === 0) back(formData, "error", "Pick at least one day of the week.");
  if (!(Number.isInteger(maxTasks) && maxTasks >= 0 && maxTasks <= 20)) back(formData, "error", "Room for 0 to 20 chores.");
  if (!(Number.isInteger(maxBig) && maxBig >= 0 && maxBig <= 20)) back(formData, "error", "Room for 0 to 20 Big chores.");
  return {
    name,
    icon: readIcon(formData),
    max_tasks: maxTasks,
    max_big: maxBig,
    // The Free day fills days with nothing else: no weekdays, never restrictive.
    ...(isFree ? {} : { weekdays, span: formData.get("span") === "on", restrictive: formData.get("restrictive") === "on" }),
  };
}

/** Adds a chore day, or saves one (`id` set). */
export async function saveChoreDay(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const isFree = id ? Boolean((await supabase.from("chore_days").select("is_free").eq("id", id).maybeSingle()).data?.is_free) : false;
  const day = readChoreDay(formData, isFree);
  let dayId = id;
  if (id) {
    const { error } = await supabase.from("chore_days").update(day).eq("id", id);
    if (error) back(formData, "error", error.message);
  } else {
    const { data, error } = await supabase.from("chore_days").insert({ ...day, household_id: household.id, sort_order: 100 }).select("id").single();
    if (error) back(formData, "error", error.message);
    dayId = data.id;
  }
  await log(household.id, id ? "chore_day_updated" : "chore_day_added", "chore_day", dayId, { name: day.name });
  refresh();
  formData.set("returnTo", "/chores");
  back(formData, "message", id ? `Saved ${day.name}.` : `Added ${day.name}.`);
}

export async function removeChoreDay(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("chore_days").delete().eq("id", id).eq("is_free", false);
  if (error) back(formData, "error", error.message);
  await log(household.id, "chore_day_removed", "chore_day", id, { name });
  refresh();
  formData.set("returnTo", "/chores");
  back(formData, "message", `Removed ${name}. Its chores can go on other days now.`);
}
