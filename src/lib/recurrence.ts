/**
 * Recurring events. A series is stored once, with its first occurrence's
 * times and an RRULE pattern ("every Tuesday"). To show a week or month we
 * "expand" it into the individual occurrences in that range, then apply
 * any one-off exceptions (skipped or moved occurrences).
 *
 * Time zones: the rrule library doesn't understand them, so the series is
 * expanded in "wall-clock" time (9:30 stays 9:30 every week) and each
 * occurrence is then converted to a real moment in the event's time zone.
 * That keeps events at the same local time across daylight saving changes.
 */
import * as rruleModule from "rrule";
import { addDays, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "./time.ts";

// The rrule package ships both module styles; Next.js and plain Node pick
// different ones, so accept RRule from either place.
const { RRule } =
  "RRule" in rruleModule && rruleModule.RRule
    ? rruleModule
    : (rruleModule as unknown as { default: typeof rruleModule }).default;

export type SeriesLike = {
  id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_rule: string | null;
};

export type ExceptionLike = {
  event_id: string;
  original_date: string;
  skipped: boolean;
  new_starts_at: string | null;
  new_ends_at: string | null;
};

export type Occurrence<T extends SeriesLike> = T & {
  /** The series (event row) this occurrence belongs to. */
  series_id: string;
  /** The occurrence's original local date; null for one-off events. */
  occurrence_date: LocalDate | null;
  /** Whether this single occurrence was moved. */
  moved: boolean;
};

/** Wall-clock time as if it were UTC, which is how rrule likes to work. */
function floating(date: LocalDate, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi));
}

function isoDate(floatingInstant: Date): LocalDate {
  return floatingInstant.toISOString().slice(0, 10);
}

function isoTime(floatingInstant: Date): string {
  return floatingInstant.toISOString().slice(11, 16);
}

/**
 * Every occurrence of the given events that overlaps [rangeStart, rangeEnd).
 * One-off events pass straight through when they overlap the range.
 */
export function expandEvents<T extends SeriesLike>(
  events: T[],
  exceptions: ExceptionLike[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence<T>[] {
  const overlaps = (start: Date, end: Date) => start < rangeEnd && (end > rangeStart || (start >= rangeStart && end.getTime() === start.getTime()));
  const exceptionFor = new Map(exceptions.map((x) => [`${x.event_id}|${x.original_date}`, x]));
  const out: Occurrence<T>[] = [];

  for (const event of events) {
    const start = new Date(event.starts_at);
    const end = new Date(event.ends_at);

    if (!event.recurrence_rule) {
      if (overlaps(start, end)) out.push({ ...event, series_id: event.id, occurrence_date: null, moved: false });
      continue;
    }

    const tz = event.timezone;
    const firstDate = localDateOf(start, tz);
    const durationMs = end.getTime() - start.getTime();
    const allDayLengthDays = Math.max(1, Math.round(durationMs / 86_400_000));

    let rule: InstanceType<typeof RRule>;
    try {
      rule = new RRule({
        ...RRule.parseString(event.recurrence_rule),
        dtstart: floating(firstDate, event.all_day ? "00:00" : localTimeOf(start, tz)),
      });
    } catch {
      continue; // an unreadable rule shows nothing rather than breaking the page
    }

    // Look a little either side of the range so long or moved events aren't missed.
    const windowStart = floating(addDays(localDateOf(rangeStart, tz), -Math.ceil(durationMs / 86_400_000) - 2), "00:00");
    const windowEnd = floating(addDays(localDateOf(rangeEnd, tz), 2), "00:00");

    for (const occ of rule.between(windowStart, windowEnd, true)) {
      const date = isoDate(occ);
      const exception = exceptionFor.get(`${event.id}|${date}`);
      if (exception?.skipped) continue;

      let occStart: Date;
      let occEnd: Date;
      let moved = false;
      if (exception?.new_starts_at && exception.new_ends_at) {
        occStart = new Date(exception.new_starts_at);
        occEnd = new Date(exception.new_ends_at);
        moved = true;
      } else if (event.all_day) {
        occStart = zonedToUtc(date, "00:00", tz);
        occEnd = zonedToUtc(addDays(date, allDayLengthDays), "00:00", tz);
      } else {
        occStart = zonedToUtc(date, isoTime(occ), tz);
        occEnd = new Date(occStart.getTime() + durationMs);
      }

      if (!overlaps(occStart, occEnd)) continue;
      out.push({
        ...event,
        id: `${event.id}@${date}`,
        starts_at: occStart.toISOString(),
        ends_at: occEnd.toISOString(),
        series_id: event.id,
        occurrence_date: date,
        moved,
      });
    }
  }

  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// ---------------------------------------------------------------------------
// Building and describing rules for the form
// ---------------------------------------------------------------------------

export type RepeatFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type RepeatEnd = "never" | "on" | "after";

export type RepeatOptions = {
  frequency: RepeatFrequency;
  interval: number;
  /** Weekdays for weekly repeats: 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  end: RepeatEnd;
  /** Last date it may happen on, when end is "on". */
  until: LocalDate | null;
  /** How many times in total, when end is "after". */
  count: number | null;
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQ_CODES: Record<Exclude<RepeatFrequency, "none">, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
};

/** Turns the form's choices into an RRULE string (or null for "doesn't repeat"). */
export function buildRule(options: RepeatOptions): string | null {
  if (options.frequency === "none") return null;
  const parts = [`FREQ=${FREQ_CODES[options.frequency]}`];
  if (options.interval > 1) parts.push(`INTERVAL=${options.interval}`);
  if (options.frequency === "weekly" && options.weekdays.length > 0) {
    parts.push(`BYDAY=${[...new Set(options.weekdays)].sort().map((d) => DAY_CODES[d]).join(",")}`);
  }
  if (options.end === "on" && options.until) parts.push(`UNTIL=${options.until.replaceAll("-", "")}T235959Z`);
  if (options.end === "after" && options.count) parts.push(`COUNT=${options.count}`);
  return parts.join(";");
}

/** Reads an RRULE string back into form choices. */
export function parseRule(rule: string | null): RepeatOptions {
  const none: RepeatOptions = { frequency: "none", interval: 1, weekdays: [], end: "never", until: null, count: null };
  if (!rule) return none;
  const fields = Object.fromEntries(
    rule.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key, value ?? ""];
    }),
  );
  const frequency = (Object.entries(FREQ_CODES).find(([, code]) => code === fields.FREQ)?.[0] ?? "none") as RepeatFrequency;
  const untilMatch = /^(\d{4})(\d{2})(\d{2})/.exec(fields.UNTIL ?? "");
  return {
    frequency,
    interval: Math.max(1, Number(fields.INTERVAL ?? 1) || 1),
    weekdays: (fields.BYDAY ?? "")
      .split(",")
      .map((code) => DAY_CODES.indexOf(code))
      .filter((i) => i >= 0),
    end: fields.COUNT ? "after" : untilMatch ? "on" : "never",
    until: untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null,
    count: fields.COUNT ? Number(fields.COUNT) : null,
  };
}

/** A short plain-English description, e.g. "Every week on Tuesday". */
export function describeRule(rule: string | null): string {
  if (!rule) return "Doesn't repeat";
  try {
    const text = RRule.fromString(rule).toText();
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return "Repeats";
  }
}

/** Whether a stored rule string is one we can read. */
export function isValidRule(rule: string): boolean {
  try {
    RRule.fromString(rule);
    return /^FREQ=/.test(rule);
  } catch {
    return false;
  }
}
