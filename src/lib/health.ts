/*
 * Health tracking (2026-11-12): medicine doses, readings like temperature,
 * and notes like symptoms, for each person.
 *
 * A medicine's choices (Tylenol, Advil) each have the family's own numbers:
 * how long to wait between doses and the most in a day. Almanac only
 * compares a new dose with them. It never suggests a dose, and a dose that
 * is too soon or over the most for the day still logs (the button turns
 * orange and says "Log it anyway").
 *
 * Kept free of other imports so the tests can run with plain `node --test`.
 */

export type DoseRule = { wait_minutes: number | null; max_per_day: number | null };

export type DoseStatus = {
  /** The latest dose of this choice, if any. */
  last: Date | null;
  /** When the next dose is allowed, or null if one is allowed now. */
  next: Date | null;
  /** Doses since the start of today. */
  today: number;
  /** A dose now would be sooner than the wait. */
  tooSoon: boolean;
  /** Today already has the most doses for a day. */
  atMost: boolean;
};

/**
 * Where a choice stands for one person. `doses` are that person's doses of
 * that choice (any order), `dayStart` is midnight today where the family lives.
 */
export function doseStatus(rule: DoseRule, doses: Date[], now: Date, dayStart: Date): DoseStatus {
  const past = doses.filter((d) => d <= now).sort((a, b) => b.getTime() - a.getTime());
  const last = past[0] ?? null;
  const today = past.filter((d) => d >= dayStart).length;
  const nextAt = last && rule.wait_minutes ? new Date(last.getTime() + rule.wait_minutes * 60_000) : null;
  const tooSoon = Boolean(nextAt && nextAt > now);
  const atMost = rule.max_per_day !== null && today >= rule.max_per_day;
  return { last, next: tooSoon ? nextAt : null, today, tooSoon, atMost };
}

/** Wait between doses, as the Habit Manager shows it: "4 h", "1 h 30", "45 min". */
export function waitText(minutes: number | null): string {
  if (!minutes) return "–";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** How long ago, short: "5 min", "1 h 50 m", "2 days". */
export function agoText(then: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} m` : `${h} h`;
  }
  return `${Math.floor(minutes / (24 * 60))} days`;
}

/** A reading as typed: "38.4". Numbers keep at most one decimal. */
export function readingText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return (Math.round(value * 10) / 10).toString();
}
