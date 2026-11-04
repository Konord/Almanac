/**
 * Time zone helpers. The database stores every moment in UTC; people think
 * in local wall-clock time ("9am in Toronto"). These convert between the
 * two using only the browser/Node built-in Intl API.
 *
 * Kept free of other imports so the tests can run with plain `node --test`.
 */

/** "2026-11-05" (local calendar date) */
export type LocalDate = string;
/** "14:30" (local wall-clock time) */
export type LocalTime = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function isLocalDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isLocalTime(value: string): boolean {
  const m = TIME_RE.exec(value);
  return Boolean(m && Number(m[1]) < 24 && Number(m[2]) < 60);
}

/** The wall-clock parts of a UTC instant, as seen in a time zone. */
function partsInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far ahead of UTC a time zone is at a given instant, in minutes. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Turns a local date and time in a time zone into the real moment (UTC).
 * Handles daylight saving: a time skipped by "spring forward" moves to
 * the next valid time, and an ambiguous "fall back" time picks the first.
 */
export function zonedToUtc(date: LocalDate, time: LocalTime, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);

  // Try the offsets in force a little before and after; one will fit.
  const candidates = [
    offsetMinutes(new Date(wallAsUtc - 12 * 3600_000), timeZone),
    offsetMinutes(new Date(wallAsUtc + 12 * 3600_000), timeZone),
  ];
  const fits = candidates
    .map((offset) => new Date(wallAsUtc - offset * 60000))
    .filter((instant) => {
      const p = partsInZone(instant, timeZone);
      return p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi;
    })
    .sort((a, b) => a.getTime() - b.getTime());

  if (fits.length > 0) return fits[0];
  // Skipped by spring-forward: use the offset from before the jump.
  return new Date(wallAsUtc - Math.min(...candidates) * 60000);
}

/** The local calendar date of an instant in a time zone. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const p = partsInZone(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The local wall-clock time of an instant in a time zone. */
export function localTimeOf(instant: Date, timeZone: string): LocalTime {
  const p = partsInZone(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Adds whole days to a local date. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, mo, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
