import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { expandEvents, type ExceptionLike } from "@/lib/recurrence";
import { addDays, zonedToUtc, type LocalDate } from "@/lib/time";
import type { CalendarEvent, CalendarItem, DayKind, EventTemplate, Member } from "./types";

/*
 * Loading calendar data, shared by the Calendar and Today screens.
 */

export const EVENT_COLUMNS =
  "id, title, starts_at, ends_at, all_day, visibility, notes, timezone, recurrence_rule, icon, day_kind, event_members(member_id)";

type EventRow = Omit<CalendarEvent, "member_ids"> & {
  event_members: { member_id: string }[];
};

/** Turns a loaded row (with its people alongside) into an event. */
export function toEvent({ event_members, ...rest }: EventRow): CalendarEvent {
  return { ...rest, member_ids: event_members.map((m) => m.member_id) };
}

/** The cookie that remembers whose things this screen (browser) shows. */
export const PEOPLE_COOKIE = "almanac-people";

export type CalendarData = {
  members: Member[];
  templates: EventTemplate[];
  /** The kinds of day an event can make its dates, by name. */
  dayKinds: DayKind[];
  /** Every occurrence in the range. */
  items: CalendarItem[];
  exceptions: ExceptionLike[];
};

/** Everything on the calendar between two instants, with repeats worked out. */
export async function loadCalendar(rangeStart: Date, rangeEnd: Date): Promise<CalendarData> {
  const supabase = await createClient();
  const [membersResult, eventsResult, seriesResult, templatesResult, kindsResult] = await Promise.all([
    supabase.from("members").select("id, name, colour, icon").order("role", { ascending: false }).order("name"),
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .is("recurrence_rule", null)
      .lt("starts_at", rangeEnd.toISOString())
      .gte("ends_at", rangeStart.toISOString())
      .order("starts_at"),
    // Repeating events that have started by the end of the range; their
    // individual dates are worked out below.
    supabase.from("events").select(EVENT_COLUMNS).not("recurrence_rule", "is", null).lt("starts_at", rangeEnd.toISOString()),
    supabase
      .from("event_templates")
      .select("id, title, icon, start_time, minutes, all_day, member_ids, notes, day_kind")
      .order("sort_order")
      .order("title"),
    supabase.from("day_types").select("name, icon").order("sort_order").order("name"),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (seriesResult.error) throw seriesResult.error;
  if (templatesResult.error) throw templatesResult.error;
  if (kindsResult.error) throw kindsResult.error;

  const seriesIds = seriesResult.data.map((e) => e.id);
  let exceptions: ExceptionLike[] = [];
  if (seriesIds.length > 0) {
    const { data, error } = await supabase
      .from("event_exceptions")
      .select("event_id, original_date, skipped, new_starts_at, new_ends_at")
      .in("event_id", seriesIds);
    if (error) throw error;
    exceptions = data;
  }

  const events = [...eventsResult.data, ...seriesResult.data].map(toEvent);
  const items = expandEvents<CalendarEvent>(
    events,
    exceptions,
    rangeStart,
    rangeEnd,
  );
  // Template times come back as "09:00:00"; the card wants "09:00".
  const templates = templatesResult.data.map((t) => ({ ...t, start_time: t.start_time?.slice(0, 5) ?? null }));
  return {
    members: membersResult.data,
    templates,
    dayKinds: kindsOfDay(kindsResult.data),
    items,
    exceptions,
  };
}

/** Each kind of day once, by name (everyone's "Weekday" is one kind). */
function kindsOfDay(rows: DayKind[]): DayKind[] {
  const seen = new Map<string, DayKind>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: row.name.trim(), icon: row.icon });
  }
  return [...seen.values()];
}

/** The start and end instants of a run of local days. */
export function rangeOf(days: LocalDate[], timeZone: string): { rangeStart: Date; rangeEnd: Date } {
  return {
    rangeStart: zonedToUtc(days[0], "00:00", timeZone),
    rangeEnd: zonedToUtc(addDays(days.at(-1) ?? days[0], 1), "00:00", timeZone),
  };
}

/**
 * The people this screen shows (each screen remembers its own), or an
 * empty list for everyone. Someone removed from the household drops out.
 */
export async function devicePeople(members: Member[]): Promise<string[]> {
  const raw = (await cookies()).get(PEOPLE_COOKIE)?.value ?? "";
  const ids = raw.split(",").filter((id) => members.some((m) => m.id === id));
  return ids.length === members.length ? [] : ids;
}

/** Only the events for one of these people, or for everyone (all of them, with no one picked). */
export function itemsForPeople(items: CalendarItem[], people: string[]): CalendarItem[] {
  if (people.length === 0) return items;
  return items.filter((item) => item.member_ids.length === 0 || item.member_ids.some((id) => people.includes(id)));
}
