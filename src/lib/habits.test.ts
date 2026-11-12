import { test } from "node:test";
import assert from "node:assert/strict";
import { chartTop, combineDays, datesBetween, habitDay, habitPeriods, habitStats, monthDates, periodStats, ruleDay, shiftMonth, stepKey, weekStart, type HabitDay, type HabitRule } from "./habits.ts";

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

test("tracked steps match by name, whatever the spacing or capitals", () => {
  assert.equal(stepKey("Brush teeth"), stepKey("  brush   Teeth "));
  assert.notEqual(stepKey("Brush teeth"), stepKey("Brush teeth (night)"));
});

const rule = (extra: Partial<HabitRule> = {}): HabitRule => ({ measure: "check", goal: 1, frequency: "daily", weekdays: [], times: 1, since: "2026-11-01", ...extra });

test("a Habit Manager habit's day", () => {
  // 2026-11-09 is a Monday, 2026-11-08 a Sunday.
  const weekdays = rule({ frequency: "days", weekdays: [1, 2, 3, 4, 5] });
  assert.equal(ruleDay(weekdays, "2026-11-09", 0, "2026-11-12"), "missed");
  assert.equal(ruleDay(weekdays, "2026-11-08", 0, "2026-11-12"), "off");
  const water = rule({ measure: "count", goal: 8 });
  assert.equal(ruleDay(water, "2026-11-09", 6, "2026-11-12"), "missed");
  assert.equal(ruleDay(water, "2026-11-09", 8, "2026-11-12"), "done");
  assert.equal(ruleDay(water, "2026-11-12", 3, "2026-11-12"), "open");
});

test("weekly habits count met days in each Monday-to-Sunday week", () => {
  const swim = rule({ frequency: "week", times: 2 });
  const done = new Set(["2026-11-03", "2026-11-05", "2026-11-10"]);
  const periods = habitPeriods(swim, "2026-11-01", "2026-11-30", (d) => (done.has(d) ? 1 : 0), "2026-11-12");
  assert.deepEqual(
    periods.map((p) => [p.from, p.status, p.met]),
    [
      ["2026-10-26", "missed", 0],
      ["2026-11-02", "done", 2],
      ["2026-11-09", "open", 1],
      ["2026-11-16", "future", 0],
      ["2026-11-23", "future", 0],
      ["2026-11-30", "future", 0],
    ],
  );
  assert.equal(periodStats(periods).streak, 1);
  const monthly = habitPeriods(rule({ frequency: "month", since: "2026-10-15" }), "2026-09-01", "2026-11-30", (d) => (d === "2026-10-20" ? 1 : 0), "2026-11-12");
  assert.deepEqual(monthly.map((p) => [p.from, p.to, p.status]), [
    ["2026-09-01", "2026-09-30", "off"],
    ["2026-10-01", "2026-10-31", "done"],
    ["2026-11-01", "2026-11-30", "open"],
  ]);
});

test("months and chart tops", () => {
  assert.equal(monthDates("2026-02").length, 28);
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-11", 2), "2027-01");
  assert.equal(weekStart("2026-11-08"), "2026-11-02");
  assert.equal(chartTop(20, 26), 40);
  assert.equal(chartTop(8, 3), 20);
  assert.equal(chartTop(3, 0), 6);
});
