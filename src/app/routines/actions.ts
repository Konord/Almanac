"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { routineProgress } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate } from "@/lib/time";

/*
 * Like the other screens: each action re-checks the signed-in household,
 * the database's security rules check again, and changes are logged.
 */

/** Where to go back to: the routines screen or the Today screen. */
function returnPath(formData: FormData): string {
  const value = String(formData.get("returnTo") ?? "");
  // Only our own pages, never another website.
  return /^\/(routines(\/manage|\/habits)?|calendar)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/routines";
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
