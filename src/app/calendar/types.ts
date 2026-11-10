/** A kind of day anyone has (each person has their own, matched by name). */
export type DayKind = { name: string; icon: string | null };

export type Member = { id: string; name: string; colour: string; icon: string | null };

/** A ready-made event, like Court. */
export type EventTemplate = {
  id: string;
  title: string;
  icon: string | null;
  start_time: string | null;
  minutes: number;
  all_day: boolean;
  member_ids: string[];
  notes: string | null;
  /** Events made from it make their dates this kind of day. */
  day_kind: string | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  /** Who it's for; empty means everyone. */
  member_ids: string[];
  visibility: string;
  notes: string | null;
  timezone: string;
  recurrence_rule: string | null;
  /** One emoji, or null to guess one from the title. */
  icon: string | null;
  /** Makes its dates this kind of day ("Office day") for the people on it. */
  day_kind: string | null;
};

/** One occurrence on the calendar: a one-off event, or one date of a series. */
export type CalendarItem = CalendarEvent & {
  /** The event row it comes from (same as id for one-off events). */
  series_id: string;
  /** For a repeating event, the occurrence's original date. */
  occurrence_date: string | null;
  moved: boolean;
};
