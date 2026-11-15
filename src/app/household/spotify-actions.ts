"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

/*
 * Settings › Spotify › Disconnect. Happens straight away (after a second
 * tap to be sure) rather than waiting for Save, like connecting does,
 * since connecting can't wait for Save either: it goes off to Spotify.
 */
export async function disconnectSpotify(): Promise<void> {
  const household = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("spotify_connections").delete().eq("household_id", household.id);
  if (error) throw error;
  revalidatePath("/household");
}
