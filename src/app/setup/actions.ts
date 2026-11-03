"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createHousehold(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/setup?error=${encodeURIComponent("Give your household a name.")}`);

  const supabase = await createClient();
  // create_household is a database function (see the migration). It makes
  // the household and its whiteboard theme in one go.
  const { error } = await supabase.rpc("create_household", { household_name: name });
  if (error) redirect(`/setup?error=${encodeURIComponent(error.message)}`);

  redirect("/household");
}
