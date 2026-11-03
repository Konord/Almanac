import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

/**
 * Household settings live in the database (households.settings), not in
 * code, so they can change without a rebuild. This describes their shape.
 */
export type HouseholdSettings = {
  timeZone: string;
  locale: string;
  units: "metric" | "imperial";
  temperatureUnit: "celsius" | "fahrenheit";
  currency: string;
  /** 0 = Sunday, 1 = Monday */
  weekStartsOn: 0 | 1;
  activeTheme: string;
};

/** Used if a setting is ever missing. Matches the database default. */
export const DEFAULT_SETTINGS: HouseholdSettings = {
  timeZone: "America/Toronto",
  locale: "en-CA",
  units: "metric",
  temperatureUnit: "celsius",
  currency: "CAD",
  weekStartsOn: 0,
  activeTheme: "whiteboard",
};

/** Reads settings JSON from the database, filling any gaps with defaults. */
export function parseSettings(raw: Json): HouseholdSettings {
  const value = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const pick = <K extends keyof HouseholdSettings>(
    key: K,
    isValid: (v: unknown) => boolean,
  ): HouseholdSettings[K] =>
    isValid(value[key]) ? (value[key] as HouseholdSettings[K]) : DEFAULT_SETTINGS[key];

  return {
    timeZone: pick("timeZone", isTimeZone),
    locale: pick("locale", (v) => typeof v === "string" && v.length > 0),
    units: pick("units", (v) => v === "metric" || v === "imperial"),
    temperatureUnit: pick("temperatureUnit", (v) => v === "celsius" || v === "fahrenheit"),
    currency: pick("currency", (v) => typeof v === "string" && /^[A-Z]{3}$/.test(v)),
    weekStartsOn: pick("weekStartsOn", (v) => v === 0 || v === 1),
    activeTheme: pick("activeTheme", (v) => typeof v === "string" && v.length > 0),
  };
}

export function isTimeZone(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type Household = {
  id: string;
  name: string;
  settings: HouseholdSettings;
};

/**
 * The signed-in household, or null if nobody is signed in or this login
 * hasn't set one up yet.
 * Security rules mean the query can only ever return this login's own row.
 */
export async function getHousehold(): Promise<Household | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null; // signed out

  const { data, error } = await supabase
    .from("households")
    .select("id, name, settings")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, settings: parseSettings(data.settings) };
}

/** Like getHousehold(), but sends the visitor to first-time setup if needed. */
export async function requireHousehold(): Promise<Household> {
  const household = await getHousehold();
  if (!household) redirect("/setup");
  return household;
}
