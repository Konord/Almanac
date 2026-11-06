"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/*
 * Making, switching and deleting households. The database functions
 * (see the multiple_households migration) check that the household
 * belongs to whoever is signed in, so the form can't be used to reach
 * someone else's.
 */

function back(kind: "error" | "message", text: string): never {
  redirect(`/households?${kind}=${encodeURIComponent(text)}`);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Makes a new household, switches to it, and opens its settings to add people. */
export async function newHousehold(formData: FormData) {
  const name = text(formData, "name");
  if (!name) back("error", "Give the new household a name.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { household_name: name });
  if (error) back("error", error.message);

  revalidatePath("/", "layout");
  redirect(`/household?message=${encodeURIComponent(`Made ${name}. Add its people below.`)}`);
}

/** Makes another household the current one, then goes to Today. */
export async function switchHousehold(formData: FormData) {
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("switch_household", { target: id });
  if (error) back("error", error.message);

  revalidatePath("/", "layout");
  redirect("/");
}

/** Deletes a household and everything in it, once its name is typed to confirm. */
export async function deleteHousehold(formData: FormData) {
  const id = text(formData, "id");
  const confirmName = text(formData, "confirmName");
  if (!id) back("error", "Choose which household to delete.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_household", { target: id, confirm_name: confirmName });
  if (error) back("error", error.message);

  revalidatePath("/", "layout");
  // With no households left, first-time setup takes over.
  const { data: left } = await supabase.rpc("my_households");
  if (!left || left.length === 0) redirect("/setup");
  back("message", "Household deleted.");
}
