"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { leadMinutes } from "@/lib/heads-ups";
import { createClient } from "@/lib/supabase/server";
import { syncEventAndChoreHeadsUps } from "./sync";

/*
 * Adding and removing heads-ups on events and chores. Each change makes
 * (or clears) the to-dos and grocery lines straight away.
 */

function returnPath(formData: FormData): string {
  const value = String(formData.get("huReturnTo") ?? "");
  // Only our own pages, never another website.
  return /^\/(calendar|chores\/manage)(\?[\w=&%.:-]*)?$/.test(value) ? value : "/";
}

function back(formData: FormData, kind: "error" | "message", text: string): never {
  const [base, query = ""] = returnPath(formData).split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("message");
  params.set(kind, text);
  redirect(`${base}?${params.toString()}`);
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/", "layout");
}

export async function addHeadsUp(formData: FormData) {
  const household = await requireHousehold();
  const eventId = text(formData, "huEventId") || null;
  const choreId = text(formData, "huChoreId") || null;
  if (!eventId === !choreId) back(formData, "error", "A heads-up goes with one event or chore.");
  const label = text(formData, "huLabel").slice(0, 80);
  if (!label) back(formData, "error", "What should the heads-up say? Like “Pack the hockey bag”.");
  const minutes = leadMinutes(Number(text(formData, "huAmount") || "0"), text(formData, "huUnit"));
  if (minutes === null) back(formData, "error", "Pick how long before, up to 60 days.");
  const makes = text(formData, "huMakes") === "grocery" ? "grocery" : "todo";
  const supabase = await createClient();
  const { error } = await supabase.from("heads_ups").insert({
    household_id: household.id,
    event_id: eventId,
    chore_id: choreId,
    label,
    minutes_before: minutes,
    makes,
    assignee_id: text(formData, "huAssigneeId") || null,
  });
  if (error) back(formData, "error", error.message);
  await syncEventAndChoreHeadsUps(household, true);
  refresh();
  back(formData, "message", `Added the heads-up “${label}”.`);
}

/** Bound to one heads-up's id by the editor (formAction buttons can't carry a name). */
export async function removeHeadsUp(id: string, formData: FormData) {
  const household = await requireHousehold();
  const supabase = await createClient();
  // Open to-dos it made go with it; done ones are kept as history.
  await supabase.from("task_instances").update({ heads_up_id: null }).eq("heads_up_id", id).neq("status", "open");
  const { error } = await supabase.from("heads_ups").delete().eq("id", id);
  if (error) back(formData, "error", error.message);
  await syncEventAndChoreHeadsUps(household, true);
  refresh();
  back(formData, "message", "Removed the heads-up.");
}
