import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, isLocalDate, isLocalTime, localDateOf, localTimeOf, zonedToUtc } from "./time.ts";

const TORONTO = "America/Toronto";

test("converts Toronto winter time (UTC-5)", () => {
  assert.equal(zonedToUtc("2026-11-05", "14:00", TORONTO).toISOString(), "2026-11-05T19:00:00.000Z");
});

test("converts Toronto summer time (UTC-4)", () => {
  assert.equal(zonedToUtc("2026-07-01", "09:30", TORONTO).toISOString(), "2026-07-01T13:30:00.000Z");
});

test("a time skipped by spring-forward moves to after the jump", () => {
  // 2026-03-08 02:30 doesn't exist in Toronto; clocks jump 02:00 -> 03:00.
  const instant = zonedToUtc("2026-03-08", "02:30", TORONTO);
  assert.equal(localTimeOf(instant, TORONTO), "03:30");
});

test("an ambiguous fall-back time picks the first occurrence", () => {
  // 2026-11-01 01:30 happens twice in Toronto; the first is still UTC-4.
  assert.equal(zonedToUtc("2026-11-01", "01:30", TORONTO).toISOString(), "2026-11-01T05:30:00.000Z");
});

test("late evening stays on the same local date", () => {
  const instant = zonedToUtc("2026-12-31", "23:30", TORONTO);
  assert.equal(localDateOf(instant, TORONTO), "2026-12-31");
  assert.equal(localTimeOf(instant, TORONTO), "23:30");
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("validates dates and times", () => {
  assert.ok(isLocalDate("2026-11-05"));
  assert.ok(!isLocalDate("2026-02-30"));
  assert.ok(isLocalTime("23:59"));
  assert.ok(!isLocalTime("24:00"));
});
