import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DAY_PROFILE, formatMinutes, profileDay, profileLabel, type BusyBlock } from "./day-profile.ts";

const TZ = "America/Toronto";
const S = DEFAULT_DAY_PROFILE; // 7am–9pm day, evening from 5pm, busy at 4 h, busy evening at 90 min

/** A timed block in Toronto time, written with its UTC offset (EST is -05:00). */
const at = (date: string, start: string, end: string, offset = "-05:00"): BusyBlock => ({
  starts_at: `${date}T${start}:00${offset}`,
  ends_at: `${date}T${end}:00${offset}`,
  all_day: false,
});

test("a day with nothing on is free, with the whole day window free", () => {
  const p = profileDay("2026-11-07", [], S, TZ);
  assert.equal(p.kind, "free");
  assert.equal(p.busyMinutes, 0);
  assert.equal(p.freeMinutes, 14 * 60);
});

test("a short appointment leaves the day free", () => {
  const p = profileDay("2026-11-07", [at("2026-11-07", "10:00", "11:00")], S, TZ);
  assert.equal(p.kind, "free");
  assert.equal(p.busyMinutes, 60);
  assert.equal(p.freeMinutes, 13 * 60);
});

test("four or more hours of events makes a busy day", () => {
  const p = profileDay("2026-11-04", [at("2026-11-04", "09:00", "12:00"), at("2026-11-04", "13:00", "14:00")], S, TZ);
  assert.equal(p.kind, "busy");
  assert.equal(p.busyMinutes, 240);
});

test("a long evening makes a busy evening even when the day is otherwise light", () => {
  const p = profileDay("2026-11-03", [at("2026-11-03", "17:30", "19:30")], S, TZ);
  assert.equal(p.kind, "busy_evening");
  assert.equal(p.eveningMinutes, 120);
});

test("overlapping events only count once", () => {
  const p = profileDay(
    "2026-11-04",
    [at("2026-11-04", "18:00", "19:00"), at("2026-11-04", "18:30", "19:30"), at("2026-11-04", "19:00", "19:15")],
    S,
    TZ,
  );
  assert.equal(p.busyMinutes, 90);
  assert.equal(p.kind, "busy_evening");
});

test("only time inside the day window counts", () => {
  // A night shift from 8pm to 2am only takes one hour of the 7am–9pm day.
  const night = { starts_at: "2026-11-04T20:00:00-05:00", ends_at: "2026-11-05T02:00:00-05:00", all_day: false };
  const p = profileDay("2026-11-04", [night], S, TZ);
  assert.equal(p.busyMinutes, 60);
  // ...and none of the next day's.
  assert.equal(profileDay("2026-11-05", [night], S, TZ).busyMinutes, 0);
});

test("all-day events don't make a day busy", () => {
  const birthday = { starts_at: "2026-11-07T05:00:00Z", ends_at: "2026-11-08T05:00:00Z", all_day: true };
  assert.equal(profileDay("2026-11-07", [birthday], S, TZ).kind, "free");
});

test("thresholds come from settings", () => {
  const strict = { ...S, busyDayMinutes: 60 };
  assert.equal(profileDay("2026-11-07", [at("2026-11-07", "10:00", "11:00")], strict, TZ).kind, "busy");
});

test("the day window stays in local time across the clock change", () => {
  // 1 Nov 2026 is the day the clocks go back in Toronto; 7am–9pm is still 14 hours.
  const p = profileDay("2026-11-01", [], S, TZ);
  assert.equal(p.freeMinutes, 14 * 60);
  // An event at 6pm local time (EST, after the change) counts as evening.
  assert.equal(profileDay("2026-11-01", [at("2026-11-01", "18:00", "20:00")], S, TZ).kind, "busy_evening");
});

test("labels and durations read naturally", () => {
  assert.equal(profileLabel("free", "Saturday"), "Free Saturday");
  assert.equal(profileLabel("busy", "Tuesday"), "Busy Tuesday");
  assert.equal(profileLabel("busy_evening", "Tuesday"), "Busy evening");
  assert.equal(formatMinutes(0), "no time");
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(90), "1 h 30 min");
  assert.equal(formatMinutes(240), "4 h");
});
