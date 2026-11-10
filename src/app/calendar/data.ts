import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { expandEvents, type ExceptionLike } from "@/lib/recurrence";
import { addDays, zonedToUtc, type LocalDate } from "@/lib/time";
import type { CalendarEvent, CalendarItem, DayKind, EventTemplate, Member, SavedView, Tag } from "./types";

/*
 * Loading calendar data, shared by the Calendar and Today screens.
 */

export const EVENT_COLUMNS =
  "id, title, starts_at, ends_at, all_day, visibility, notes, timezone, recurrence_rule, icon, day_kind, event_members(member_id), event_tags(tag_id)";

type EventRow = Omit<CalendarEvent, "member_ids" | "tag_ids"> & {
  event_members: { member_id: string }[];
  event_tags: { tag_id: string }[];
};

/** Turns a loaded row (with its people and tags alongside) into an event. */
export function toEvent({ event_members, event_tags, ...rest }: EventRow): CalendarEvent {
  return { ...rest, member_ids: event_members.map((m) => m.member_id), tag_ids: event_tags.map((t) => t.tag_id) };
}

/** The cookie that remembers which saved view this screen (browser) shows. */
export const VIEW_COOKIE = "almanac-view";

export type CalendarData = {
  members: Member[];
  views: SavedView[];
  tags: Tag[];
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
  const [membersResult, viewsResult, eventsResult, seriesResult, tagsResult, templatesResult, kindsResult] = await Promise.all([
    supabase.from("members").select("id, name, colour, icon").order("role", { ascending: false }).order("name"),
    supabase.from("views").select("id, name, tag_ids").order("sort_order").order("name"),
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
    supabase.from("tags").select("id, name, icon, role").order("sort_order").order("name"),
    supabase
      .from("event_templates")
      .select("id, title, icon, start_time, minutes, all_day, member_ids, tag_ids, notes, day_kind")
      .order("sort_order")
      .order("title"),
    supabase.from("day_types").select("name, icon").order("sort_order").order("name"),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (viewsResult.error) throw viewsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (seriesResult.error) throw seriesResult.error;
  if (tagsResult.error) throw tagsResult.error;
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
    views: viewsResult.data,
    tags: tagsResult.data,
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

/** The overlay this screen shows, or null for everything. */
export async function deviceView(views: SavedView[]): Promise<SavedView | null> {
  const id = (await cookies()).get(VIEW_COOKIE)?.value;
  return views.find((v) => v.id === id) ?? null;
}

/** Only the events with one of the overlay's tags (or all of them, with no overlay). */
export function itemsInView(items: CalendarItem[], view: SavedView | null): CalendarItem[] {
  if (!view) return items;
  const shown = new Set(view.tag_ids);
  return items.filter((item) => item.tag_ids.some((id) => shown.has(id)));
}
