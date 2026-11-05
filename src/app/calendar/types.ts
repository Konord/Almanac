export type Layer = {
  id: string;
  name: string;
  colour: string;
  owner_member_id: string | null;
  counts_toward_busyness: boolean;
  visibility: string;
};

export type Member = { id: string; name: string; colour: string };

export type CalendarEvent = {
  id: string;
  title: string;
  layer_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  member_id: string | null;
  energy_cost: number;
  visibility: string;
  notes: string | null;
  timezone: string;
  recurrence_rule: string | null;
  /** One emoji, or null to guess one from the title. */
  icon: string | null;
};

/** One occurrence on the calendar: a one-off event, or one date of a series. */
export type CalendarItem = CalendarEvent & {
  /** The event row it comes from (same as id for one-off events). */
  series_id: string;
  /** For a repeating event, the occurrence's original date. */
  occurrence_date: string | null;
  moved: boolean;
};

/** A saved set of layers, e.g. "Court + appointments". */
export type SavedView = { id: string; name: string; layer_ids: string[] };
