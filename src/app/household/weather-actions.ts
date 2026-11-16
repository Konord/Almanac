"use server";

import { requireHousehold } from "@/lib/household";
import type { PlaceMatch } from "@/lib/weather";
import { findPlaces } from "@/lib/weather-server";

/*
 * Settings › Weather › Find: looks a town up by name with Open-Meteo's
 * free place search. Picking one only changes the draft; Save keeps it.
 */
export async function searchPlaces(name: string): Promise<{ places: PlaceMatch[] } | { error: string }> {
  await requireHousehold();
  if (name.trim().length < 2) return { places: [] };
  try {
    return { places: await findPlaces(name) };
  } catch (e) {
    console.error("Weather place search:", e);
    return { error: "The place search didn't answer. Try again in a minute." };
  }
}
