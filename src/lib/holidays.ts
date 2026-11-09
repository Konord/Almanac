import { addDays, type LocalDate } from "./time.ts";

/*
 * Holidays and birthdays (Connor, 2026-11-09). They're special all-day days
 * that come back every year and look different on the calendar. They don't
 * change anyone's kind of day or chores; the Weekly Review handles that if
 * needed.
 *
 * A holiday has a yearly rule: a fixed date (Dec 25), "the 3rd Monday of
 * February", "the Monday on or before May 24" (Victoria Day), or some days
 * from Easter. Public holidays come from the list below; you add the ones
 * you want and can rename them, change the picture, or take them away.
 */

export type HolidayRule =
  | { kind: "fixed"; month: number; day: number }
  /** n is 1 to 4, or -1 for the last one in the month. weekday: 0 = Sunday. */
  | { kind: "nth"; month: number; weekday: number; n: number }
  /** The weekday on or before a date. */
  | { kind: "before"; month: number; day: number; weekday: number }
  /** Days from Easter Sunday (Good Friday is -2). */
  | { kind: "easter"; offset: number };

export type Holiday = { id: string; name: string; icon: string | null; rule: HolidayRule; public_key: string | null };
export type Birthday = { id: string; name: string; icon: string | null; month: number; day: number; birth_year: number | null };

/** One holiday or birthday on one date. */
export type SpecialDay = {
  /** Unique per date, for React keys. */
  key: string;
  kind: "holiday" | "birthday";
  id: string;
  date: LocalDate;
  name: string;
  icon: string;
  /** For a birthday with a birth year: the age they turn. */
  age: number | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (year: number, month: number, day: number): LocalDate => `${year}-${pad(month)}-${pad(day)}`;
const weekdayOf = (date: LocalDate) => new Date(`${date}T12:00:00Z`).getUTCDay();
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Easter Sunday (the Western date), by the anonymous Gregorian method. */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** The date a holiday falls on in a year (null if the rule can't happen, like Feb 30). */
export function holidayDate(rule: HolidayRule, year: number): LocalDate | null {
  switch (rule.kind) {
    case "fixed":
      return rule.day <= daysInMonth(year, rule.month) ? ymd(year, rule.month, rule.day) : null;
    case "nth": {
      if (rule.n === -1) {
        const last = ymd(year, rule.month, daysInMonth(year, rule.month));
        return addDays(last, -((weekdayOf(last) - rule.weekday + 7) % 7));
      }
      const first = ymd(year, rule.month, 1);
      const date = addDays(first, ((rule.weekday - weekdayOf(first) + 7) % 7) + 7 * (rule.n - 1));
      return date.slice(5, 7) === pad(rule.month) ? date : null;
    }
    case "before": {
      const on = ymd(year, rule.month, Math.min(rule.day, daysInMonth(year, rule.month)));
      return addDays(on, -((weekdayOf(on) - rule.weekday + 7) % 7));
    }
    case "easter":
      return addDays(easterSunday(year), rule.offset);
  }
}

/** A birthday's date in a year (Feb 29 birthdays are on Feb 28 in other years). */
export function birthdayDate(b: Pick<Birthday, "month" | "day">, year: number): LocalDate {
  return ymd(year, b.month, Math.min(b.day, daysInMonth(year, b.month)));
}

/** Every holiday and birthday from one date to another (both included). */
export function specialDays(holidays: Holiday[], birthdays: Birthday[], from: LocalDate, to: LocalDate): SpecialDay[] {
  const out: SpecialDay[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const h of holidays) {
      const date = holidayDate(h.rule, year);
      if (date && date >= from && date <= to) {
        out.push({ key: `h-${h.id}-${date}`, kind: "holiday", id: h.id, date, name: h.name, icon: h.icon || "🎉", age: null });
      }
    }
    for (const b of birthdays) {
      const date = birthdayDate(b, year);
      if (date >= from && date <= to) {
        out.push({
          key: `b-${b.id}-${date}`,
          kind: "birthday",
          id: b.id,
          date,
          name: b.name,
          icon: b.icon || "🎂",
          age: b.birth_year && b.birth_year <= year ? year - b.birth_year : null,
        });
      }
    }
  }
  // Holidays first on a shared date.
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "holiday" ? -1 : 1));
}

/** "Ava's birthday (8)" or "Christmas Day". */
export function specialLabel(s: SpecialDay): string {
  if (s.kind === "holiday") return s.name;
  return s.age !== null ? `${s.name} turns ${s.age}` : `${s.name}'s birthday`;
}

/** The next date on or after a day that a holiday or birthday happens. */
export function nextDate(item: { rule: HolidayRule } | Pick<Birthday, "month" | "day">, today: LocalDate): LocalDate | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const date = "rule" in item ? holidayDate(item.rule, y) : birthdayDate(item, y);
    if (date && date >= today) return date;
  }
  return null;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th"];
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "December 25", "3rd Monday of February", "2 days before Easter". */
export function describeHolidayRule(rule: HolidayRule): string {
  switch (rule.kind) {
    case "fixed":
      return `${MONTHS[rule.month]} ${rule.day}`;
    case "nth":
      return `${rule.n === -1 ? "Last" : ORDINALS[rule.n]} ${WEEKDAYS[rule.weekday]} of ${MONTHS[rule.month]}`;
    case "before":
      return `${WEEKDAYS[rule.weekday]} on or before ${MONTHS[rule.month]} ${rule.day}`;
    case "easter":
      if (rule.offset === 0) return "Easter Sunday";
      return `${Math.abs(rule.offset)} day${Math.abs(rule.offset) === 1 ? "" : "s"} ${rule.offset < 0 ? "before" : "after"} Easter`;
  }
}

/** Whether a rule read from the database or a form makes sense. */
export function isHolidayRule(value: unknown): value is HolidayRule {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  switch (r.kind) {
    case "fixed":
      return int(r.month, 1, 12) && int(r.day, 1, 31);
    case "nth":
      return int(r.month, 1, 12) && int(r.weekday, 0, 6) && (int(r.n, 1, 4) || r.n === -1);
    case "before":
      return int(r.month, 1, 12) && int(r.day, 1, 31) && int(r.weekday, 0, 6);
    case "easter":
      return int(r.offset, -60, 60);
    default:
      return false;
  }
}

/** A public holiday you can add, and where it's a day off. */
export type PublicHoliday = { key: string; name: string; icon: string; rule: HolidayRule; where: string };

/** Canadian public holidays, plus a few well-loved days that aren't days off. */
export const PUBLIC_HOLIDAYS: PublicHoliday[] = [
  { key: "new-year", name: "New Year's Day", icon: "🎉", rule: { kind: "fixed", month: 1, day: 1 }, where: "Canada" },
  { key: "family-day", name: "Family Day", icon: "🏠", rule: { kind: "nth", month: 2, weekday: 1, n: 3 }, where: "AB, BC, NB, ON, SK" },
  { key: "valentines", name: "Valentine's Day", icon: "💝", rule: { kind: "fixed", month: 2, day: 14 }, where: "Not a day off" },
  { key: "st-patricks", name: "St. Patrick's Day", icon: "☘️", rule: { kind: "fixed", month: 3, day: 17 }, where: "Not a day off" },
  { key: "good-friday", name: "Good Friday", icon: "🌷", rule: { kind: "easter", offset: -2 }, where: "Canada" },
  { key: "easter", name: "Easter Sunday", icon: "🐰", rule: { kind: "easter", offset: 0 }, where: "Not a day off" },
  { key: "easter-monday", name: "Easter Monday", icon: "🐣", rule: { kind: "easter", offset: 1 }, where: "Some schools and jobs" },
  { key: "mothers-day", name: "Mother's Day", icon: "💐", rule: { kind: "nth", month: 5, weekday: 0, n: 2 }, where: "Not a day off" },
  { key: "victoria-day", name: "Victoria Day", icon: "👑", rule: { kind: "before", month: 5, day: 24, weekday: 1 }, where: "Most of Canada" },
  { key: "fathers-day", name: "Father's Day", icon: "👔", rule: { kind: "nth", month: 6, weekday: 0, n: 3 }, where: "Not a day off" },
  { key: "st-jean", name: "Saint-Jean-Baptiste Day", icon: "🎆", rule: { kind: "fixed", month: 6, day: 24 }, where: "QC" },
  { key: "canada-day", name: "Canada Day", icon: "🍁", rule: { kind: "fixed", month: 7, day: 1 }, where: "Canada" },
  { key: "civic-holiday", name: "Civic Holiday", icon: "🌞", rule: { kind: "nth", month: 8, weekday: 1, n: 1 }, where: "Most of Canada" },
  { key: "labour-day", name: "Labour Day", icon: "🛠️", rule: { kind: "nth", month: 9, weekday: 1, n: 1 }, where: "Canada" },
  { key: "truth-reconciliation", name: "Truth and Reconciliation Day", icon: "🧡", rule: { kind: "fixed", month: 9, day: 30 }, where: "Federal, BC, MB, PE" },
  { key: "thanksgiving", name: "Thanksgiving", icon: "🦃", rule: { kind: "nth", month: 10, weekday: 1, n: 2 }, where: "Most of Canada" },
  { key: "halloween", name: "Halloween", icon: "🎃", rule: { kind: "fixed", month: 10, day: 31 }, where: "Not a day off" },
  { key: "remembrance-day", name: "Remembrance Day", icon: "🌺", rule: { kind: "fixed", month: 11, day: 11 }, where: "Most of Canada" },
  { key: "christmas-eve", name: "Christmas Eve", icon: "🌟", rule: { kind: "fixed", month: 12, day: 24 }, where: "Not a day off" },
  { key: "christmas", name: "Christmas Day", icon: "🎄", rule: { kind: "fixed", month: 12, day: 25 }, where: "Canada" },
  { key: "boxing-day", name: "Boxing Day", icon: "🎁", rule: { kind: "fixed", month: 12, day: 26 }, where: "ON, federal" },
  { key: "new-years-eve", name: "New Year's Eve", icon: "🥂", rule: { kind: "fixed", month: 12, day: 31 }, where: "Not a day off" },
];
