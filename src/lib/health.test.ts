import { test } from "node:test";
import assert from "node:assert/strict";
import { agoText, doseStatus, readingText, waitText } from "./health.ts";

const at = (hhmm: string) => new Date(`2026-11-12T${hhmm}:00Z`);
const dayStart = at("00:00");

test("a dose too soon only warns", () => {
  const s = doseStatus({ wait_minutes: 240, max_per_day: 5 }, [at("07:35"), at("11:40")], at("13:30"), dayStart);
  assert.equal(s.today, 2);
  assert.equal(s.tooSoon, true);
  assert.equal(s.atMost, false);
  assert.deepEqual(s.next, at("15:40"));
  assert.deepEqual(s.last, at("11:40"));
});

test("a dose is fine once the wait is over, and the day's most counts from midnight", () => {
  const s = doseStatus({ wait_minutes: 240, max_per_day: 2 }, [new Date("2026-11-11T22:00:00Z"), at("02:00"), at("07:00")], at("13:30"), dayStart);
  assert.equal(s.next, null);
  assert.equal(s.tooSoon, false);
  assert.equal(s.today, 2);
  assert.equal(s.atMost, true);
});

test("no rules and no doses", () => {
  const s = doseStatus({ wait_minutes: null, max_per_day: null }, [], at("13:30"), dayStart);
  assert.deepEqual(s, { last: null, next: null, today: 0, tooSoon: false, atMost: false });
});

test("words for waits, times ago and readings", () => {
  assert.equal(waitText(240), "4 h");
  assert.equal(waitText(90), "1 h 30");
  assert.equal(waitText(45), "45 min");
  assert.equal(agoText(at("11:40"), at("13:30")), "1 h 50 m");
  assert.equal(readingText(38.44), "38.4");
});
