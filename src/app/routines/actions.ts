"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { routineProgress } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/day-types";
import { addDays, isLocalDate, isLocalTime } from "@/lib/time";

/*
 * Like the other screens: each action re-checks the signed-in household,
 * the database's security rules check again, and changes are logged.
 */

/** Where to go back to: the routines screen or the Today screen. */
function returnPath(formData: FormData): string {
  const value = String(formData.get("returnTo") ?? "");
  // Only our own pages, never another website.
  return /^\/(routines(\/manage|\/habits)?)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/routines";
}

function back(formData: FormData, kind: "error" | "message", text: string): never {
  const path = returnPath(formData);
  const [base, query = ""] = path.split("?");
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
  revalidatePath("/routines");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Who has which routine
// ---------------------------------------------------------------------------

export async function setAssignmentActive(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const active = text(formData, "active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("routine_assignments").update({ active }).eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", active ? "Routine back on." : "Routine paused.");
}

export async function removeAssignment(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("routine_assignments").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Removed.");
}

// ---------------------------------------------------------------------------
// Ticking steps off
// ---------------------------------------------------------------------------

/** Ticks a step, or unticks it if it was already ticked. */
export async function toggleStep(formData: FormData) {
  const household = await requireHousehold();
  const memberId = text(formData, "memberId");
  const stepId = text(formData, "stepId");
  const templateId = text(formData, "templateId");
  const date = text(formData, "date");
  if (!isLocalDate(date)) back(formData, "error", "That date doesn't look right.");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("routine_checks")
    .select("id")
    .eq("member_id", memberId)
    .eq("step_id", stepId)
    .eq("check_date", date)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("routine_checks").delete().eq("id", existing.id);
    if (error) back(formData, "error", error.message);
  } else {
    const { error } = await supabase
      .from("routine_checks")
      .insert({ household_id: household.id, member_id: memberId, step_id: stepId, check_date: date });
    if (error) back(formData, "error", error.message);

    // Note when someone starts or finishes a routine (the doc's activity hooks).
    const [{ data: steps }, { data: checks }, { data: template }] = await Promise.all([
      supabase.from("routine_steps").select("id, position, target_time, essential").eq("template_id", templateId),
      supabase.from("routine_checks").select("step_id").eq("member_id", memberId).eq("check_date", date),
      supabase.from("routine_templates").select("name").eq("id", templateId).maybeSingle(),
    ]);
    const routineSteps = steps ?? [];
    const ids = new Set(routineSteps.map((s) => s.id));
    const done = new Set((checks ?? []).map((c) => c.step_id).filter((id) => ids.has(id)));
    const details = { member_id: memberId, date, name: template?.name ?? "" };
    if (done.size === 1) await log(household.id, "routine_started", "routine", templateId, details);
    if (routineProgress(routineSteps, done).complete) await log(household.id, "routine_done", "routine", templateId, details);
  }

  refresh();
  redirect(returnPath(formData));
}

// ---------------------------------------------------------------------------
// Day types, week plans and single days
// ---------------------------------------------------------------------------

function readTime(formData: FormData, key: string, label: string): string {
  const value = text(formData, key);
  if (!isLocalTime(value)) back(formData, "error", `${label} should look like 7:30 a.m.`);
  return value;
}

/** Adds a day type, or saves one: its name, times and which routines it has. */
export async function saveDayType(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const memberId = text(formData, "memberId");
  const name = text(formData, "name");
  const icon = text(formData, "icon") || null;
  if (!name) back(formData, "error", "A day type needs a name, like Weekend.");
  if (icon && [...icon].length > 4) back(formData, "error", "The picture should be one emoji.");
  const wake = readTime(formData, "wake", "Wake-up");
  const bed = readTime(formData, "bed", "Bedtime");
  const templateIds = formData.getAll("templateIds").map(String).filter(Boolean);

  const supabase = await createClient();
  let dayTypeId = id;
  if (id) {
    const { error } = await supabase.from("day_types").update({ name, icon, wake_time: wake, bed_time: bed }).eq("id", id);
    if (error) back(formData, "error", error.message);
  } else {
    const { data, error } = await supabase
      .from("day_types")
      .insert({ household_id: household.id, member_id: memberId, name, icon, wake_time: wake, bed_time: bed, sort_order: 100 })
      .select("id")
      .single();
    if (error) back(formData, "error", error.message);
    dayTypeId = data.id;
  }

  // Which routines this kind of day has.
  const { data: current } = await supabase.from("routine_assignments").select("id, template_id").eq("day_type_id", dayTypeId);
  const have = new Set((current ?? []).map((a) => a.template_id));
  const want = new Set(templateIds);
  const remove = (current ?? []).filter((a) => !want.has(a.template_id)).map((a) => a.id);
  const add = templateIds.filter((t) => !have.has(t));
  if (remove.length > 0) {
    const { error } = await supabase.from("routine_assignments").delete().in("id", remove);
    if (error) back(formData, "error", error.message);
  }
  if (add.length > 0) {
    const { data: dt } = await supabase.from("day_types").select("member_id").eq("id", dayTypeId).single();
    const { error } = await supabase
      .from("routine_assignments")
      .insert(add.map((t) => ({ household_id: household.id, template_id: t, member_id: dt!.member_id, day_type_id: dayTypeId })));
    if (error) back(formData, "error", error.message);
  }
  await log(household.id, id ? "day_type_updated" : "day_type_added", "day_type", dayTypeId, { name });
  refresh();
  back(formData, "message", `Saved ${name}.`);
}

/** Removes a day type. Weekdays that used it switch to another of the person's day types. */
export async function removeDayType(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { data: dt } = await supabase.from("day_types").select("id, member_id, name").eq("id", id).maybeSingle();
  if (!dt) back(formData, "error", "That day type no longer exists.");
  const { data: others } = await supabase.from("day_types").select("id").eq("member_id", dt.member_id).neq("id", id).order("sort_order").limit(1);
  const other = others?.[0];
  if (!other) back(formData, "error", "Everyone needs at least one day type.");
  const moved = await supabase.from("week_plan_days").update({ day_type_id: other.id }).eq("day_type_id", id);
  if (moved.error) back(formData, "error", moved.error.message);
  const { error } = await supabase.from("day_types").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "day_type_removed", "day_type", id, { name: dt.name });
  refresh();
  back(formData, "message", `Removed ${dt.name}.`);
}

/** Saves which day type each weekday uses in a week plan. */
export async function saveWeekPlan(formData: FormData) {
  const household = await requireHousehold();
  const planId = text(formData, "planId");
  const name = text(formData, "name");
  const rows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    household_id: household.id,
    week_plan_id: planId,
    weekday,
    day_type_id: text(formData, `day${weekday}`),
  }));
  if (rows.some((r) => !r.day_type_id)) back(formData, "error", "Pick a kind of day for every day of the week.");
  const supabase = await createClient();
  if (name) {
    const renamed = await supabase.from("week_plans").update({ name }).eq("id", planId);
    if (renamed.error) back(formData, "error", renamed.error.message);
  }
  const { error } = await supabase.from("week_plan_days").upsert(rows, { onConflict: "week_plan_id,weekday" });
  if (error) back(formData, "error", error.message);
  await log(household.id, "week_plan_saved", "week_plan", planId, {});
  refresh();
  back(formData, "message", "Saved the week.");
}

/** Adds another week plan (e.g. night shift week), starting as a copy of the one shown. */
export async function addWeekPlan(formData: FormData) {
  const household = await requireHousehold();
  const memberId = text(formData, "memberId");
  const copyFrom = text(formData, "copyFrom");
  const name = text(formData, "name");
  if (!name) back(formData, "error", "Give the week a name, like Night shift week.");
  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("week_plans")
    .insert({ household_id: household.id, member_id: memberId, name, sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  const { data: days } = await supabase.from("week_plan_days").select("weekday, day_type_id").eq("week_plan_id", copyFrom);
  if (days && days.length > 0) {
    const copied = await supabase
      .from("week_plan_days")
      .insert(days.map((d) => ({ ...d, household_id: household.id, week_plan_id: plan.id })));
    if (copied.error) back(formData, "error", copied.error.message);
  }
  refresh();
  const [base, query = ""] = returnPath(formData).split("?");
  const params = new URLSearchParams(query);
  params.set("plan", plan.id);
  params.set("message", `Added ${name}. Pick its days.`);
  redirect(`${base}?${params.toString()}`);
}

export async function removeWeekPlan(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { data: plan } = await supabase.from("week_plans").select("member_id, name").eq("id", id).maybeSingle();
  if (!plan) back(formData, "error", "That week no longer exists.");
  const { count } = await supabase.from("week_plans").select("id", { count: "exact", head: true }).eq("member_id", plan.member_id);
  if ((count ?? 0) <= 1) back(formData, "error", "Everyone needs at least one week.");
  const { error } = await supabase.from("week_plans").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  const [base, query = ""] = returnPath(formData).split("?");
  const params = new URLSearchParams(query);
  params.delete("plan");
  params.set("message", `Removed ${plan.name}.`);
  redirect(`${base}?${params.toString()}`);
}

/** Puts someone on one week plan, or lets their plans take turns week by week. */
export async function chooseWeekPlan(formData: FormData) {
  await requireHousehold();
  const memberId = text(formData, "memberId");
  const planId = text(formData, "planId");
  const rotate = text(formData, "rotate") === "true";
  const supabase = await createClient();
  let rotationStart: string | null = null;
  if (rotate) {
    // The plan shown now is this week's; the others follow in order.
    const today = text(formData, "today");
    if (!isLocalDate(today)) back(formData, "error", "That date doesn't look right.");
    const { data: plans } = await supabase.from("week_plans").select("id").eq("member_id", memberId).order("sort_order").order("name");
    const index = Math.max(0, (plans ?? []).findIndex((p) => p.id === planId));
    rotationStart = weekStart(addDays(today, -7 * index));
  }
  const { error } = await supabase
    .from("members")
    .update({ current_week_plan_id: planId, week_plans_rotate: rotate, rotation_start: rotationStart })
    .eq("id", memberId);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", rotate ? "The weeks will take turns." : "Switched weeks.");
}

/** Makes one date a different kind of day, or gives it its own wake-up and bedtime. */
export async function setDay(formData: FormData) {
  const household = await requireHousehold();
  const memberId = text(formData, "memberId");
  const date = text(formData, "date");
  if (!isLocalDate(date)) back(formData, "error", "That date doesn't look right.");
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("day_overrides")
    .select("id, day_type_id, wake_time, bed_time")
    .eq("member_id", memberId)
    .eq("date", date)
    .maybeSingle();
  const next = {
    day_type_id: existing?.day_type_id ?? null,
    wake_time: existing?.wake_time ?? null,
    bed_time: existing?.bed_time ?? null,
  };
  if (formData.has("dayTypeId")) {
    next.day_type_id = text(formData, "dayTypeId") || null;
    // A new kind of day brings its own times.
    next.wake_time = null;
    next.bed_time = null;
  }
  if (formData.has("wake")) next.wake_time = readTime(formData, "wake", "Wake-up");
  if (formData.has("bed")) next.bed_time = readTime(formData, "bed", "Bedtime");
  if (text(formData, "reset") === "true") Object.assign(next, { day_type_id: null, wake_time: null, bed_time: null });

  const empty = !next.day_type_id && !next.wake_time && !next.bed_time;
  const { error } = empty
    ? await supabase.from("day_overrides").delete().eq("member_id", memberId).eq("date", date)
    : await supabase
        .from("day_overrides")
        .upsert({ household_id: household.id, member_id: memberId, date, ...next }, { onConflict: "member_id,date" });
  if (error) back(formData, "error", error.message);
  refresh();
  redirect(returnPath(formData));
}

/** Ends a routine early (or opens it again). Unticked steps then count as missed, but can still be ticked. */
export async function endRoutine(formData: FormData) {
  const household = await requireHousehold();
  const memberId = text(formData, "memberId");
  const templateId = text(formData, "templateId");
  const date = text(formData, "date");
  const reopen = text(formData, "reopen") === "true";
  if (!isLocalDate(date)) back(formData, "error", "That date doesn't look right.");
  const supabase = await createClient();
  const { error } = reopen
    ? await supabase.from("routine_ends").delete().eq("member_id", memberId).eq("template_id", templateId).eq("end_date", date)
    : await supabase
        .from("routine_ends")
        .upsert({ household_id: household.id, member_id: memberId, template_id: templateId, end_date: date }, { onConflict: "member_id,template_id,end_date" });
  if (error) back(formData, "error", error.message);
  if (!reopen) await log(household.id, "routine_ended", "routine", templateId, { member_id: memberId, date });
  refresh();
  redirect(returnPath(formData));
}
