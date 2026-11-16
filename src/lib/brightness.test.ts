import { test } from "node:test";
import assert from "node:assert/strict";
import { brightnessNow, brightnessProblem, DEFAULT_BRIGHTNESS, parseBrightness } from "./brightness.ts";

const s = DEFAULT_BRIGHTNESS; // day 05:45 at 80%, evening 19:30 at 45%
const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

test("day from 5:45 am, evening from 7:30 pm, and the evening runs on through the night", () => {
  assert.deepEqual(brightnessNow(s, "2026-11-16", at("12:00"), "2026-11-15"), { part: "day", percent: 80, warmth: "none", stretch: "2026-11-16 day" });
  assert.deepEqual(brightnessNow(s, "2026-11-16", at("19:30"), "2026-11-15"), { part: "evening", percent: 45, warmth: "weak", stretch: "2026-11-16 evening" });
  assert.deepEqual(brightnessNow(s, "2026-11-16", at("05:44"), "2026-11-15"), { part: "evening", percent: 45, warmth: "weak", stretch: "2026-11-15 evening" });
  assert.deepEqual(brightnessNow(s, "2026-11-16", at("05:45"), "2026-11-15"), { part: "day", percent: 80, warmth: "none", stretch: "2026-11-16 day" });
});

test("a day that starts after the evening (night owls) still works", () => {
  const owl = { ...s, day: { start: "10:00", percent: 70 }, evening: { start: "02:00", percent: 30, warmth: "none" as const } };
  assert.equal(brightnessNow(owl, "2026-11-16", at("23:00"), "2026-11-15").part, "day");
  assert.equal(brightnessNow(owl, "2026-11-16", at("03:00"), "2026-11-15").part, "evening");
  assert.equal(brightnessNow(owl, "2026-11-16", at("01:00"), "2026-11-15").stretch, "2026-11-15 day");
});

test("settings read with gaps filled, and bad ones refused", () => {
  assert.deepEqual(parseBrightness(null), s);
  assert.equal(parseBrightness({ day: { start: "7:00", percent: 2 } }).day.start, "05:45");
  assert.equal(parseBrightness({ day: { percent: 2 } }).day.percent, 80);
  assert.equal(parseBrightness({ scheduled: false }).scheduled, false);
  assert.equal(parseBrightness({ evening: { warmth: "hot" } }).evening.warmth, "weak");
  assert.equal(parseBrightness({ evening: { warmth: "strong" } }).evening.warmth, "strong");
  assert.equal(brightnessProblem({ ...s, evening: { ...s.evening, start: "05:45" } }), "The day and the evening can't start at the same time.");
  assert.equal(brightnessProblem(s), null);
});
