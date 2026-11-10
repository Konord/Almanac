import { test } from "node:test";
import assert from "node:assert/strict";
import { clockTime, hourText, minutesText, shortClockTime, tidyAmPm, wallTime } from "./time-text.ts";

test("am/pm is always written as lower-case am or pm", () => {
  assert.equal(tidyAmPm("9:30 a.m."), "9:30 am");
  assert.equal(tidyAmPm("9:30 p.m."), "9:30 pm");
  assert.equal(tidyAmPm("9:30 AM"), "9:30 am");
  assert.equal(tidyAmPm("21:30"), "21:30");
});

test("stored times read like a person would say them", () => {
  assert.equal(wallTime("09:30", "en-CA"), "9:30 am");
  assert.equal(wallTime("18:00", "en-CA"), "6 pm");
  assert.equal(wallTime("00:00", "en-CA"), "12 am");
  assert.equal(wallTime("12:15:00", "en-US"), "12:15 pm");
  assert.equal(minutesText(570, "en-CA"), "9:30 am");
  assert.equal(hourText(8, "en-CA"), "8 am");
  assert.equal(hourText(22, "en-CA"), "10 pm");
});

test("moments are shown in the household's time zone", () => {
  const instant = new Date("2026-11-10T20:47:00Z");
  assert.equal(clockTime(instant, "en-CA", "America/Toronto"), "3:47 pm");
  assert.equal(shortClockTime(new Date("2026-11-10T21:00:00Z"), "en-CA", "America/Toronto"), "4 pm");
});
