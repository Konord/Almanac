import { cookies } from "next/headers";
import type { Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { expandEvents, type ExceptionLike } from "@/lib/recurrence";
import { profileDay, type DayProfile } from "@/lib/day-profile";
import { addDays, zonedToUtc, type LocalDate } from "@/lib/time";
import type { CalendarEvent, CalendarItem, EventTemplate, Layer, Member, SavedView, Tag } from "./types";

/*
 * Loading calendar data, shared by the Calendar and Today screens.
 */

export const EVENT_COLUMNS =
  "id, title, layer_id, starts_at, ends_at, all_day, visibility, notes, timezone, recurrence_rule, icon, event_members(member_id), event_tags(tag_id)";

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
  layers: Layer[];
  members: Member[];
  views: SavedView[];
  tags: Tag[];
  templates: EventTemplate[];
  /** Every occurrence in the range, from all layers. */
  items: CalendarItem[];
  exceptions: ExceptionLike[];
};

/** Everything on the calendar between two instants, with repeats worked out. */
export async function loadCalendar(rangeStart: Date, rangeEnd: Date): Promise<CalendarData> {
  const supabase = await createClient();
  const [layersResult, membersResult, viewsResult, eventsResult, seriesResult, tagsResult, templatesResult] = await Promise.all([
    supabase
      .from("layers")
      .select("id, name, colour, owner_member_id, counts_toward_busyness, visibility")
      .order("sort_order")
      .order("name"),
    supabase.from("members").select("id, name, colour, icon").order("role", { ascending: false }).order("name"),
    supabase.from("views").select("id, name, layer_ids").order("sort_order").order("name"),
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
    supabase.from("tags").select("id, name, icon").order("sort_order").order("name"),
    supabase
      .from("event_templates")
      .select("id, title, icon, start_time, minutes, all_day, member_ids, tag_ids, notes")
      .order("sort_order")
      .order("title"),
  ]);
  if (layersResult.error) throw layersResult.error;
  if (membersResult.error) throw membersResult.error;
  if (viewsResult.error) throw viewsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (seriesResult.error) throw seriesResult.error;
  if (tagsResult.error) throw tagsResult.error;
  if (templatesResult.error) throw templatesResult.error;

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
    layers: layersResult.data,
    members: membersResult.data,
    views: viewsResult.data,
    tags: tagsResult.data,
    templates,
    items,
    exceptions,
  };
}

/** The start and end instants of a run of local days. */
export function rangeOf(days: LocalDate[], timeZone: string): { rangeStart: Date; rangeEnd: Date } {
  return {
    rangeStart: zonedToUtc(days[0], "00:00", timeZone),
    rangeEnd: zonedToUtc(addDays(days.at(-1) ?? days[0], 1), "00:00", timeZone),
  };
}

/**
 * Each day's profile. Uses every layer that counts toward busy, whatever
 * view the screen is showing, so "Busy evening" means the same everywhere.
 */
export function profilesFor(
  days: LocalDate[],
  items: CalendarItem[],
  layers: Layer[],
  household: Household,
): Map<LocalDate, DayProfile> {
  const { timeZone, dayProfile } = household.settings;
  const counting = new Set(layers.filter((l) => l.counts_toward_busyness).map((l) => l.id));
  const busy = items.filter((item) => counting.has(item.layer_id));
  return new Map(days.map((day) => [day, profileDay(day, busy, dayProfile, timeZone)]));
}

/** The saved view this screen shows, or null for every layer. */
export async function deviceView(views: SavedView[]): Promise<SavedView | null> {
  const id = (await cookies()).get(VIEW_COOKIE)?.value;
  return views.find((v) => v.id === id) ?? null;
}

/** Only the items on the view's layers (or all of them, with no view). */
export function itemsInView(items: CalendarItem[], view: SavedView | null): CalendarItem[] {
  if (!view) return items;
  const shown = new Set(view.layer_ids);
  return items.filter((item) => shown.has(item.layer_id));
}
