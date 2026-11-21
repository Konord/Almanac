import type { HouseholdSettings } from "@/lib/household";
import { fillTimes } from "@/lib/quick-times";
import { buildRule, isValidRule, type RepeatEnd, type RepeatFrequency } from "@/lib/recurrence";
import { addDays, isLocalDate, zonedToUtc } from "@/lib/time";
import { dayOfWeek } from "@/lib/calendar-layout";
import { isVisibility } from "./options";

/*
 * Reading an event card's fields (shared by the calendar's actions and the
 * phone's). Each problem goes to `fail`, which never returns: the calendar
 * sends you back with the message, the phone shows it beside Save.
 */

export type Fail = (message: string) => never;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function readEvent(formData: FormData, settings: HouseholdSettings, fail: Fail) {
  const timeZone = settings.timeZone;
  const title = text(formData, "title");
  const startDate = text(formData, "startDate");
  const visibility = text(formData, "visibility") || "everyone";
  const notes = text(formData, "notes");
  const icon = text(formData, "icon");
  const location = readLocation(formData);

  if (!title) fail("An event needs a title.");
  const endDateInput = text(formData, "endDate") || startDate;
  if (!isLocalDate(startDate) || !isLocalDate(endDateInput)) fail("Check the dates.");
  if (endDateInput < startDate) fail("The end date is before the start date.");
  // Blank times mean all day; a start time alone gets the usual length.
  const times = fillTimes({
    allDay: formData.get("allDay") === "on",
    startDate,
    endDate: endDateInput,
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    // The card sends the end; with no end, the length it sends (or the usual length).
    defaultMinutes: readMinutes(formData) ?? settings.defaultEventMinutes,
  });
  if (!times) fail("Add a start time, or make it all day.");
  if (icon && [...icon].length > 8) fail("The picture should be one emoji, like 🦷.");
  if (!isVisibility(visibility)) fail("Choose who can see this event.");

  const allDay = times.allDay;
  const endDate = times.allDay ? endDateInput : times.endDate;
  // All-day events run from midnight on the start date to midnight after the end date.
  const startsAt = times.allDay ? zonedToUtc(startDate, "00:00", timeZone) : zonedToUtc(startDate, times.startTime, timeZone);
  const endsAt = times.allDay
    ? zonedToUtc(addDays(endDate, 1), "00:00", timeZone)
    : zonedToUtc(endDate, times.endTime, timeZone);
  if (endsAt < startsAt) fail("The event ends before it starts.");

  const recurrenceRule = readRepeat(formData, startDate, fail);

  return {
    title,
    recurrence_rule: recurrenceRule,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    all_day: allDay,
    timezone: timeZone,
    visibility,
    notes: notes || null,
    icon: icon || null,
    day_kind: readDayKind(formData),
    location,
  };
}

/** Where it is: a plain line of text (no map, no lookup), or null. */
export function readLocation(formData: FormData): string | null {
  return text(formData, "location").slice(0, 200) || null;
}

/** "Makes it a … day" on the card: a kind of day's name, or null for no change. */
export function readDayKind(formData: FormData): string | null {
  const name = text(formData, "dayKind");
  return name ? name.slice(0, 40) : null;
}

/** A length in minutes from the quick-add card, if it sent a sensible one. 0 is a point (no length). */
export function readMinutes(formData: FormData): number | null {
  const raw = text(formData, "minutes");
  if (raw === "") return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && (minutes === 0 || (minutes >= 5 && minutes <= 24 * 60)) ? minutes : null;
}

const FREQUENCIES: RepeatFrequency[] = ["none", "daily", "weekly", "monthly", "yearly"];
const ENDS: RepeatEnd[] = ["never", "on", "after"];

/** Turns the "Repeats" fields into an RRULE string, or null. */
function readRepeat(formData: FormData, startDate: string, fail: Fail): string | null {
  const frequency = text(formData, "repeatFrequency") as RepeatFrequency;
  if (!FREQUENCIES.includes(frequency) || frequency === "none") return null;
  const interval = Number(text(formData, "repeatInterval") || "1");
  const end = text(formData, "repeatEnd") as RepeatEnd;
  const until = text(formData, "repeatUntil");
  const count = Number(text(formData, "repeatCount"));
  const weekdays = formData.getAll("repeatWeekdays").map(Number).filter((d) => d >= 0 && d <= 6);

  if (!Number.isInteger(interval) || interval < 1 || interval > 52) fail("Repeat every 1 to 52.");
  if (!ENDS.includes(end)) fail("Choose when the repeat ends.");
  if (end === "on" && (!isLocalDate(until) || until < startDate)) fail("Pick an end date on or after the first date.");
  if (end === "after" && (!Number.isInteger(count) || count < 1 || count > 500)) fail("Repeat between 1 and 500 times.");

  const rule = buildRule({
    frequency,
    interval,
    weekdays: frequency === "weekly" && weekdays.length === 0 ? [dayOfWeek(startDate)] : weekdays,
    end,
    until: end === "on" ? until : null,
    count: end === "after" ? count : null,
  });
  if (rule && !isValidRule(rule)) fail("That repeat pattern didn't work. Try a simpler one.");
  return rule;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The people ticked on the card's stickers. */
export function readIds(formData: FormData, key: "memberIds"): string[] {
  return [...new Set(formData.getAll(key).map(String).filter((id) => UUID.test(id)))];
}
