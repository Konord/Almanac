import { test } from "node:test";
import assert from "node:assert/strict";
import { combineDays, datesBetween, habitDay, habitStats, type HabitDay } from "./habits.ts";

const today = "2026-11-07";
const since = "2026-11-01";
const day = (date: string, extra: { scheduled?: boolean; done?: boolean; survival?: boolean } = {}) =>
  habitDay({ date, scheduled: true, done: false, survival: false, ...extra }, since, today);

test("a day's status", () => {
  assert.equal(day("2026-11-03", { done: true }), "done");
  assert.equal(day("2026-11-03"), "missed");
  assert.equal(day("2026-11-03", { scheduled: false }), "off");
  // Ticked on a day it wasn't planned still counts as done.
  assert.equal(day("2026-11-03", { scheduled: false, done: true }), "done");
  // Before tracking started, never missed.
  assert.equal(day("2026-10-31"), "off");
  assert.equal(day("2026-10-31", { done: true }), "off");
  // Today isn't missed yet.
  assert.equal(day(today), "open");
  assert.equal(day(today, { done: true }), "done");
  // Survival days don't count unless they got done anyway.
  assert.equal(day("2026-11-04", { survival: true }), "rest");
  assert.equal(day("2026-11-04", { survival: true, done: true }), "done");
});

test("streaks skip days off, rest days and today", () => {
  const days: HabitDay[] = ["done", "missed", "done", "off", "done", "rest", "done", "open"];
  assert.deepEqual(habitStats(days), { streak: 3, best: 3, done: 4, counted: 5 });
  assert.deepEqual(habitStats(["done", "done", "missed"]), { streak: 0, best: 2, done: 2, counted: 3 });
  assert.deepEqual(habitStats([]), { streak: 0, best: 0, done: 0, counted: 0 });
});

test("a routine's day needs every tracked step", () => {
  assert.equal(combineDays(["done", "done"]), "done");
  assert.equal(combineDays(["done", "missed"]), "missed");
  assert.equal(combineDays(["done", "open"]), "open");
  assert.equal(combineDays(["off", "off"]), "off");
  assert.equal(combineDays(["rest", "done"]), "rest");
  assert.equal(combineDays([]), "off");
});

test("dates between", () => {
  assert.deepEqual(datesBetween("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(datesBetween("2026-11-02", "2026-11-01"), []);
});
