"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_SETTINGS, isTimeZone, requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { isLocalTime } from "@/lib/time";
import { isPersonColour } from "@/lib/colours";

/*
 * Every action re-checks who is signed in (requireHousehold) instead of
 * trusting the form. The database's security rules check again on top.
 * Each change is also written to the activity log.
 */

function back(kind: "error" | "message", text: string): never {
  redirect(`/household?${kind}=${encodeURIComponent(text)}`);
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readMember(formData: FormData) {
  const name = text(formData, "name");
  const role = text(formData, "role");
  const colour = text(formData, "colour");
  const birthYearText = text(formData, "birthYear");
  const birthYear = birthYearText ? Number(birthYearText) : null;
  const icon = text(formData, "icon");

  if (!name) back("error", "Every member needs a name.");
  if (role !== "parent" && role !== "child") back("error", "Choose parent or child.");
  if (!isPersonColour(colour)) back("error", "Choose a colour.");
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2100)) {
    back("error", "Birth year should look like 2018.");
  }
  if (icon && [...icon].length > 8) back("error", "The picture should be one emoji.");
  return { name, role, colour, birth_year: birthYear, icon: icon || null };
}

async function log(action: string, targetType: string, targetId: string, details: Record<string, string> = {}) {
  const household = await requireHousehold();
  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    household_id: household.id,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

export async function addMember(formData: FormData) {
  const household = await requireHousehold();
  const member = readMember(formData);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("members")
    .insert({ ...member, household_id: household.id })
    .select("id")
    .single();
  if (error) back("error", error.message);

  await log("member_added", "member", data.id, { name: member.name });
  revalidatePath("/household");
  back("message", `Added ${member.name}.`);
}

export async function updateMember(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const member = readMember(formData);
  const supabase = await createClient();

  const { error } = await supabase.from("members").update(member).eq("id", id);
  if (error) back("error", error.message);

  await log("member_updated", "member", id, { name: member.name });
  revalidatePath("/household");
  back("message", `Saved ${member.name}.`);
}

export async function removeMember(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const supabase = await createClient();

  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) back("error", error.message);

  await log("member_removed", "member", id, { name });
  revalidatePath("/household");
  back("message", `Removed ${name}.`);
}

export async function setPin(formData: FormData) {
  await requireHousehold();
  const id = text(formData, "id");
  const pin = text(formData, "pin");
  const confirm = text(formData, "confirmPin");

  if (!/^\d{4,8}$/.test(pin)) back("error", "A PIN must be 4 to 8 digits.");
  if (pin !== confirm) back("error", "The two PINs don't match.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_pin", { member_id: id, pin });
  if (error) back("error", error.message);

  await log("member_pin_set", "member", id);
  revalidatePath("/household");
  back("message", "PIN saved.");
}

export async function saveSettings(formData: FormData) {
  const household = await requireHousehold();
  const name = text(formData, "householdName");
  const timeZone = text(formData, "timeZone");
  const currency = text(formData, "currency").toUpperCase();
  const weekStartsOn = text(formData, "weekStartsOn") === "1" ? 1 : 0;
  const monthStyle = text(formData, "monthStyle") === "calendar" ? "calendar" : "rolling";
  const units = text(formData, "units") === "imperial" ? "imperial" : "metric";
  const temperatureUnit = text(formData, "temperatureUnit") === "fahrenheit" ? "fahrenheit" : "celsius";
  const measures = text(formData, "measures") === "us" ? "us" : "canadian";

  if (!name) back("error", "The household needs a name.");
  if (!isTimeZone(timeZone)) back("error", `"${timeZone}" isn't a time zone I recognise.`);
  if (!/^[A-Z]{3}$/.test(currency)) back("error", "Currency should be a 3-letter code like CAD.");

  const reviewWeekday = Number(text(formData, "reviewWeekday"));
  const reviewTime = text(formData, "reviewTime");
  if (!(Number.isInteger(reviewWeekday) && reviewWeekday >= 0 && reviewWeekday <= 6) || !isLocalTime(reviewTime)) {
    back("error", "Pick a day and a time for the weekly review.");
  }

  const dayStarts = text(formData, "dayStarts");
  const eveningStarts = text(formData, "eveningStarts");
  const dayEnds = text(formData, "dayEnds");
  if (![dayStarts, eveningStarts, dayEnds].every(isLocalTime)) back("error", "Day times should look like 07:00.");
  if (!(dayStarts < eveningStarts && eveningStarts < dayEnds)) {
    back("error", "The day has to start before the evening, and the evening before the day ends.");
  }
  const busyDayHours = Number(text(formData, "busyDayHours"));
  const busyEveningHours = Number(text(formData, "busyEveningHours"));
  if (!(busyDayHours > 0 && busyDayHours <= 24) || !(busyEveningHours > 0 && busyEveningHours <= 24)) {
    back("error", "Busy hours should be a number between 0 and 24, like 4 or 1.5.");
  }
  const dayProfile = {
    dayStarts,
    eveningStarts,
    dayEnds,
    busyDayMinutes: Math.round(busyDayHours * 60),
    busyEveningMinutes: Math.round(busyEveningHours * 60),
  };

  const settings = {
    ...DEFAULT_SETTINGS,
    ...household.settings,
    timeZone,
    currency,
    weekStartsOn,
    monthStyle,
    units,
    temperatureUnit,
    measures,
    handwriting: formData.get("handwriting") === "on",
    dayProfile,
    weeklyReview: { weekday: reviewWeekday, time: reviewTime },
    // The Today panel's boxes (only when the form sent its checkboxes).
    panelBoxes:
      formData.get("panelBoxesSent") === "1"
        ? formData
            .getAll("panelBoxes")
            .map(String)
            .filter((v) => /^(today|upnext|routines|bucket|[0-9a-f-]{36})$/.test(v))
        : household.settings.panelBoxes,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update({ name, settings })
    .eq("id", household.id);
  if (error) back("error", error.message);

  await log("settings_updated", "household", household.id);
  revalidatePath("/", "layout");
  back("message", "Settings saved.");
}
