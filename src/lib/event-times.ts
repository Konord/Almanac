import { addDays, type LocalDate } from "./time.ts";

/*
 * The start, length and end of an event on the add/edit card, kept in step.
 * Change one and the others follow (Connor, 2026-11-09):
 * - change the start: the length stays, the end moves
 * - change the length: the end moves, unless you last set the end, in
 *   which case the end stays and the start moves (so "ends at 5, lasts
 *   2 hours" gives a 3 o'clock start)
 * - change the end: the start stays and the length changes
 *
 * Everything is wall-clock time on local dates (minutes since midnight),
 * the way you read it on the card. The server turns it into real moments.
 */

const DAY = 24 * 60;
/** Longest an event can run: four weeks. */
export const MAX_EVENT_MINUTES = 28 * DAY;

export type When = {
  /** The day it starts. */
  date: LocalDate;
  /** Minutes since midnight. */
  start: number;
  /** How long, in minutes. 0 is a point (a time with no length). */
  length: number;
  /** Which end you set last, so changing the length keeps it still. */
  anchor: "start" | "end";
};

export type WallTime = { date: LocalDate; minute: number };

/** A wall-clock time some minutes later (or earlier). */
export function addMinutes(at: WallTime, minutes: number): WallTime {
  const total = at.minute + minutes;
  const days = Math.floor(total / DAY);
  return { date: addDays(at.date, days), minute: total - days * DAY };
}

/** Whole days from one date to another. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Minutes from one wall-clock time to another. */
export function minutesBetween(from: WallTime, to: WallTime): number {
  return daysBetween(from.date, to.date) * DAY + to.minute - from.minute;
}

/** When it ends. */
export function endOf(when: When): WallTime {
  return addMinutes({ date: when.date, minute: when.start }, when.length);
}

const clampLength = (minutes: number) => Math.min(Math.max(minutes, 0), MAX_EVENT_MINUTES);

/** A new start; the length stays, so the end moves with it. */
export function setStart(when: When, date: LocalDate, minute: number): When {
  return { ...when, date, start: minute, anchor: "start" };
}

/** A new length: the end moves, or the start does if you last set the end. */
export function setLength(when: When, length: number): When {
  const next = clampLength(length);
  if (when.anchor === "end") {
    const start = addMinutes(endOf(when), -next);
    return { ...when, date: start.date, start: start.minute, length: next };
  }
  return { ...when, length: next };
}

/**
 * A new end. The start stays and the length becomes whatever fits. An end
 * time before the start on the same day means it runs past midnight; an
 * end day before the start day moves the whole event back, keeping its length.
 */
export function setEnd(when: When, end: WallTime): When {
  const from = { date: when.date, minute: when.start };
  let length = minutesBetween(from, end);
  if (length < 0 && end.date === when.date) length += DAY;
  if (length < 0) {
    const start = addMinutes(end, -when.length);
    return { ...when, date: start.date, start: start.minute, anchor: "end" };
  }
  return { ...when, length: clampLength(length), anchor: "end" };
}
