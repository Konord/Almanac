import { cookies } from "next/headers";
import type { Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { expandEvents, type ExceptionLike } from "@/lib/recurrence";
import { profileDay, type DayProfile } from "@/lib/day-profile";
import { addDays, zonedToUtc, type LocalDate } from "@/lib/time";
import type { CalendarEvent, CalendarItem, Layer, Member, SavedView } from "./types";

/*
 * Loading calendar data, shared by the Calendar and Today screens.
 */

export const EVENT_COLUMNS =
  "id, title, layer_id, starts_at, ends_at, all_day, member_id, energy_cost, visibility, notes, timezone, recurrence_rule";

/** The cookie that remembers which saved view this screen (browser) shows. */
export const VIEW_COOKIE = "almanac-view";

export type CalendarData = {
  layers: Layer[];
  members: Member[];
  views: SavedView[];
  /** Every occurrence in the range, from all layers. */
  items: CalendarItem[];
  exceptions: ExceptionLike[];
};

/** Everything on the calendar between two instants, with repeats worked out. */
export async function loadCalendar(rangeStart: Date, rangeEnd: Date): Promise<CalendarData> {
  const supabase = await createClient();
  const [layersResult, membersResult, viewsResult, eventsResult, seriesResult] = await Promise.all([
    supabase
      .from("layers")
      .select("id, name, colour, owner_member_id, counts_toward_busyness, visibility")
      .order("sort_order")
      .order("name"),
    supabase.from("members").select("id, name").order("role", { ascending: false }).order("name"),
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
  ]);
  if (layersResult.error) throw layersResult.error;
  if (membersResult.error) throw membersResult.error;
  if (viewsResult.error) throw viewsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (seriesResult.error) throw seriesResult.error;

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

  const items = expandEvents<CalendarEvent>(
    [...eventsResult.data, ...seriesResult.data],
    exceptions,
    rangeStart,
    rangeEnd,
  );
  return { layers: layersResult.data, members: membersResult.data, views: viewsResult.data, items, exceptions };
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
