import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { DEFAULT_DAY_PROFILE, type DayProfileSettings } from "@/lib/day-profile";
import { isLocalTime } from "@/lib/time";

/**
 * Household settings live in the database (households.settings), not in
 * code, so they can change without a rebuild. This describes their shape.
 */
export type HouseholdSettings = {
  timeZone: string;
  locale: string;
  units: "metric" | "imperial";
  temperatureUnit: "celsius" | "fahrenheit";
  /** Kitchen measures for converting and adding up: Canadian (1 cup = 250 ml) or US (1 cup = 237 ml). */
  measures: "canadian" | "us";
  currency: string;
  /** 0 = Sunday, 1 = Monday */
  weekStartsOn: 0 | 1;
  /** What "Month" shows: a rolling 5 weeks from this week, or the calendar month (5 rows). */
  monthStyle: "rolling" | "calendar";
  activeTheme: string;
  /** Show family-written things (to-dos, meals, notes) in handwriting. */
  handwriting: boolean;
  /** What counts as a free or busy day (see src/lib/day-profile.ts). */
  dayProfile: DayProfileSettings;
  /** How long a new event lasts when only a start time is given. */
  defaultEventMinutes: number;
  /** How far a routine may move to get around an event (unless it's loose). */
  routineFlexMinutes: number;
  /** When the weekly review is due: a weekday (0 = Sunday) and a time. */
  weeklyReview: { weekday: number; time: string };
};

/** Used if a setting is ever missing. Matches the database default. */
export const DEFAULT_SETTINGS: HouseholdSettings = {
  timeZone: "America/Toronto",
  locale: "en-CA",
  units: "metric",
  temperatureUnit: "celsius",
  measures: "canadian",
  currency: "CAD",
  weekStartsOn: 0,
  monthStyle: "rolling",
  activeTheme: "bright",
  handwriting: true,
  dayProfile: DEFAULT_DAY_PROFILE,
  defaultEventMinutes: 60,
  routineFlexMinutes: 60,
  weeklyReview: { weekday: 6, time: "09:00" },
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
    measures: pick("measures", (v) => v === "canadian" || v === "us"),
    currency: pick("currency", (v) => typeof v === "string" && /^[A-Z]{3}$/.test(v)),
    weekStartsOn: pick("weekStartsOn", (v) => v === 0 || v === 1),
    monthStyle: pick("monthStyle", (v) => v === "rolling" || v === "calendar"),
    activeTheme: pick("activeTheme", (v) => typeof v === "string" && v.length > 0),
    handwriting: pick("handwriting", (v) => typeof v === "boolean"),
    dayProfile: parseDayProfile(value.dayProfile),
    defaultEventMinutes: pick("defaultEventMinutes", (v) => typeof v === "number" && Number.isInteger(v) && v >= 5 && v <= 24 * 60),
    routineFlexMinutes: pick("routineFlexMinutes", (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6 * 60),
    weeklyReview: pick("weeklyReview", (v) => {
      if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
      const r = v as { weekday?: unknown; time?: unknown };
      return typeof r.weekday === "number" && Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 && typeof r.time === "string" && isLocalTime(r.time);
    }),
  };
}

/** Day-profile thresholds, filling any missing or odd values with defaults. */
export function parseDayProfile(raw: Json | undefined): DayProfileSettings {
  const value = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const time = (key: "dayStarts" | "dayEnds" | "eveningStarts") => {
    const v = value[key];
    return typeof v === "string" && isLocalTime(v) ? v : DEFAULT_DAY_PROFILE[key];
  };
  const minutes = (key: "busyDayMinutes" | "busyEveningMinutes") => {
    const v = value[key];
    return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 24 * 60 ? v : DEFAULT_DAY_PROFILE[key];
  };
  const result = {
    dayStarts: time("dayStarts"),
    dayEnds: time("dayEnds"),
    eveningStarts: time("eveningStarts"),
    busyDayMinutes: minutes("busyDayMinutes"),
    busyEveningMinutes: minutes("busyEveningMinutes"),
  };
  // The day has to end after it starts, with the evening in between.
  if (!(result.dayStarts < result.eveningStarts && result.eveningStarts < result.dayEnds)) {
    return { ...result, dayStarts: DEFAULT_DAY_PROFILE.dayStarts, eveningStarts: DEFAULT_DAY_PROFILE.eveningStarts, dayEnds: DEFAULT_DAY_PROFILE.dayEnds };
  }
  return result;
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
