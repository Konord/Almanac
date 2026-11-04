"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { isRoutineKind, routineProgress } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, isLocalTime } from "@/lib/time";
import { isVisibility } from "../calendar/options";

/*
 * Like the other screens: each action re-checks the signed-in household,
 * the database's security rules check again, and changes are logged.
 */

/** Where to go back to: the routines screen or the Today screen. */
function returnPath(formData: FormData): string {
  const value = String(formData.get("returnTo") ?? "");
  // Only our own pages, never another website.
  return /^\/(routines(\/manage)?)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/routines";
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
// Routines (templates)
// ---------------------------------------------------------------------------

function readRoutine(formData: FormData) {
  const name = text(formData, "name");
  const kind = text(formData, "kind");
  const audience = text(formData, "audience");
  const visibility = text(formData, "visibility") || "everyone";
  if (!name) back(formData, "error", "A routine needs a name.");
  if (!isRoutineKind(kind)) back(formData, "error", "Choose when the routine happens.");
  if (!["kid", "adult", "everyone"].includes(audience)) back(formData, "error", "Choose who the routine is for.");
  if (!isVisibility(visibility)) back(formData, "error", "Choose who can see this routine.");
  return { name, kind, audience, visibility };
}

export async function addRoutine(formData: FormData) {
  const household = await requireHousehold();
  const routine = readRoutine(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routine_templates")
    .insert({ ...routine, household_id: household.id, sort_order: 100 })
    .select("id")
    .single();
  if (error) back(formData, "error", error.message);
  await log(household.id, "routine_added", "routine", data.id, { name: routine.name });
  refresh();
  back(formData, "message", `Added ${routine.name}. Now add its steps.`);
}

export async function updateRoutine(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const routine = readRoutine(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("routine_templates").update(routine).eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "routine_updated", "routine", id, { name: routine.name });
  refresh();
  back(formData, "message", `Saved ${routine.name}.`);
}

export async function removeRoutine(formData: FormData) {
  const household = await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();
  const { error } = await supabase.from("routine_templates").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await log(household.id, "routine_removed", "routine", id, { name });
  refresh();
  back(formData, "message", `Removed ${name}.`);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function readStep(formData: FormData) {
  const stepText = text(formData, "text");
  const icon = text(formData, "icon") || null;
  const targetTime = text(formData, "targetTime") || null;
  if (!stepText) back(formData, "error", "A step needs some words.");
  if (icon && [...icon].length > 4) back(formData, "error", "The picture should be one emoji, like 🪥.");
  if (targetTime && !isLocalTime(targetTime)) back(formData, "error", "The target time should look like 07:45.");
  return { text: stepText, icon, target_time: targetTime, essential: formData.get("essential") === "on" };
}

export async function addStep(formData: FormData) {
  const household = await requireHousehold();
  const templateId = text(formData, "templateId");
  const step = readStep(formData);
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("routine_steps")
    .select("position")
    .eq("template_id", templateId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("routine_steps")
    .insert({ ...step, template_id: templateId, household_id: household.id, position: (last?.position ?? 0) + 1 });
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Added "${step.text}".`);
}

export async function updateStep(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const step = readStep(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("routine_steps").update(step).eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", `Saved "${step.text}".`);
}

export async function removeStep(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("routine_steps").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  refresh();
  back(formData, "message", "Removed the step.");
}

/** Swaps a step with the one above or below it. */
export async function moveStep(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const direction = text(formData, "direction") === "up" ? "up" : "down";
  const supabase = await createClient();
  const { data: step } = await supabase.from("routine_steps").select("id, template_id, position").eq("id", id).maybeSingle();
  if (!step) back(formData, "error", "That step no longer exists.");
  const { data: neighbour } = await supabase
    .from("routine_steps")
    .select("id, position")
    .eq("template_id", step.template_id)
    [direction === "up" ? "lt" : "gt"]("position", step.position)
    .order("position", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle();
  if (neighbour) {
    const a = await supabase.from("routine_steps").update({ position: neighbour.position }).eq("id", step.id);
    const b = await supabase.from("routine_steps").update({ position: step.position }).eq("id", neighbour.id);
    if (a.error || b.error) back(formData, "error", (a.error ?? b.error)!.message);
  }
  refresh();
  redirect(returnPath(formData));
}

// ---------------------------------------------------------------------------
// Who does what, when
// ---------------------------------------------------------------------------

export async function addAssignment(formData: FormData) {
  const household = await requireHousehold();
  const templateId = text(formData, "templateId");
  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const when = text(formData, "when");
  const weekdays = formData
    .getAll("weekdays")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const onDate = text(formData, "onDate");

  if (!templateId) back(formData, "error", "Choose a routine.");
  if (memberIds.length === 0) back(formData, "error", "Choose who does it.");
  if (when === "date" && !isLocalDate(onDate)) back(formData, "error", "Choose the date.");
  if (when !== "date" && weekdays.length === 0) back(formData, "error", "Choose at least one day of the week.");

  const supabase = await createClient();
  const rows = memberIds.map((memberId) => ({
    household_id: household.id,
    template_id: templateId,
    member_id: memberId,
    weekdays: when === "date" ? null : [...new Set(weekdays)].sort(),
    on_date: when === "date" ? onDate : null,
  }));
  const { error } = await supabase.from("routine_assignments").insert(rows);
  if (error) back(formData, "error", error.message);
  await log(household.id, "routine_assigned", "routine", templateId, { when: when === "date" ? onDate : weekdays.join(",") });
  refresh();
  back(formData, "message", when === "date" ? "Swapped in for that day." : "Routine given out.");
}

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
