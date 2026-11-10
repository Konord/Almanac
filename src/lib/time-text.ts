/**
 * How times are written on screen, in one place, so every screen says
 * "9:30 am" the same way (Connor, 2026-11-10). Before this, screens wrote
 * "9:30 a.m.", "9:30 am" and "9:30a" depending on who built them.
 *
 * The household's locale still decides 12- or 24-hour time; this only tidies
 * the am/pm part. The month grid keeps its tiny "9a" style on purpose
 * (see shortTime in calendar/views.tsx), because its cells are so narrow.
 *
 * Kept free of other imports so the tests can run with plain `node --test`.
 */

/** "9:30 a.m." / "9:30 AM" / "9:30 am" → "9:30 am". 24-hour text is left alone. */
export function tidyAmPm(text: string): string {
  return text.replace(/[\s  ]*([ap])\.?\s?m\.?/i, (_, letter: string) => ` ${letter.toLowerCase()}m`);
}

/** Drops ":00" so on-the-hour times read "9 am" instead of "9:00 am". */
function dropZeroMinutes(text: string): string {
  return text.replace(/:00(?=\D|$)/, "");
}

/** A moment as wall-clock time in a time zone, like "3:47 pm". */
export function clockTime(instant: Date, locale: string, timeZone: string): string {
  return tidyAmPm(new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(instant));
}

/** A moment as a short time, like "9 am" or "5:30 pm" (on-the-hour minutes dropped). */
export function shortClockTime(instant: Date, locale: string, timeZone: string): string {
  return dropZeroMinutes(clockTime(instant, locale, timeZone));
}

/** A stored "HH:MM" time, like "09:30" → "9:30 am" and "18:00" → "6 pm". */
export function wallTime(time: string, locale: string): string {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const text = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h % 24, m)));
  return dropZeroMinutes(tidyAmPm(text));
}

/** Minutes after midnight as a time, like 570 → "9:30 am". */
export function minutesText(minutes: number, locale: string): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return wallTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, locale);
}

/** An hour as a label down the side of a timeline, like 8 → "8 am". */
export function hourText(hour: number, locale: string): string {
  return wallTime(`${String(hour % 24).padStart(2, "0")}:00`, locale);
}
