import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, choreTiming, daysBetween, describeRepeat, seasonWindow, showsInMode, starterFirstDue, type ChoreRule } from "./chores.ts";

const rule = (extra: Partial<ChoreRule> = {}): ChoreRule => ({
  repeat_every: 1,
  repeat_unit: "week",
  preferred_weekday: null,
  season_start: null,
  season_end: null,
  ...extra,
});

// 2026-11-05 is a Thursday.
const TODAY = "2026-11-05";

test("a chore never done is due today", () => {
  const t = choreTiming(rule(), [], TODAY);
  assert.equal(t.state, "due");
  assert.equal(t.dueOn, TODAY);
  assert.equal(t.lastDone, null);
});

test("a chore never done with a favourite day waits for that day", () => {
  const t = choreTiming(rule({ preferred_weekday: 6 }), [], TODAY);
  assert.equal(t.dueOn, "2026-11-07");
  assert.equal(t.state, "soon");
});

test("a weekly chore comes back a week after it was done", () => {
  const t = choreTiming(rule(), [{ status: "done", completed_on: "2026-11-01" }], TODAY);
  assert.equal(t.dueOn, "2026-11-08");
  assert.equal(t.state, "soon");
  assert.equal(t.lastDone, "2026-11-01");
});

test("an overdue chore says by how much", () => {
  const t = choreTiming(rule(), [{ status: "done", completed_on: "2026-10-20" }], TODAY);
  assert.equal(t.state, "due");
  assert.equal(t.dueOn, "2026-10-27");
  assert.equal(t.daysOverdue, 9);
});

test("skipping restarts the clock without counting as done", () => {
  const t = choreTiming(
    rule(),
    [
      { status: "done", completed_on: "2026-10-20" },
      { status: "skipped", completed_on: TODAY },
    ],
    TODAY,
  );
  assert.equal(t.dueOn, "2026-11-12");
  assert.equal(t.state, "soon");
  assert.equal(t.lastDone, "2026-10-20");
});

test("a weekly Saturday chore done late on Monday goes back to Saturday", () => {
  const t = choreTiming(rule({ preferred_weekday: 6 }), [{ status: "done", completed_on: "2026-11-02" }], TODAY);
  assert.equal(t.dueOn, "2026-11-07");
});

test("a weekly Saturday chore done on Saturday comes back next Saturday", () => {
  const t = choreTiming(rule({ preferred_weekday: 6 }), [{ status: "done", completed_on: "2026-10-31" }], TODAY);
  assert.equal(t.dueOn, "2026-11-07");
});

test("monthly and every-few-months chores", () => {
  assert.equal(choreTiming(rule({ repeat_unit: "month" }), [{ status: "done", completed_on: "2026-10-05" }], TODAY).state, "due");
  const t = choreTiming(rule({ repeat_unit: "month", repeat_every: 3 }), [{ status: "done", completed_on: "2026-10-05" }], TODAY);
  assert.equal(t.dueOn, "2027-01-05");
  assert.equal(t.state, "later");
});

test("intervals add days, weeks, months and years", () => {
  assert.equal(addInterval("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(addInterval("2026-11-05", 2, "week"), "2026-11-19");
  assert.equal(addInterval("2024-02-29", 1, "year"), "2025-02-28");
  assert.equal(addInterval("2026-11-05", 3, "day"), "2026-11-08");
});

test("days between two dates", () => {
  assert.equal(daysBetween("2026-10-27", "2026-11-05"), 9);
  assert.equal(daysBetween("2026-11-05", "2026-11-05"), 0);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
});

const tires = rule({ repeat_unit: "year", season_start: "10-15", season_end: "11-30" });

test("a seasonal chore is due inside its window until it's done", () => {
  const t = choreTiming(tires, [], TODAY);
  assert.equal(t.state, "due");
  assert.deepEqual(t.window, { start: "2026-10-15", end: "2026-11-30" });
  assert.equal(t.daysOverdue, 21);
});

test("a seasonal chore done this season waits for next year", () => {
  const t = choreTiming(tires, [{ status: "done", completed_on: "2026-10-20" }], TODAY);
  assert.equal(t.state, "later");
  assert.equal(t.dueOn, "2027-10-15");
});

test("last year's round doesn't count for this season", () => {
  const t = choreTiming(tires, [{ status: "done", completed_on: "2025-10-20" }], TODAY);
  assert.equal(t.state, "due");
});

test("a seasonal chore before its window is soon or later", () => {
  assert.equal(choreTiming(tires, [], "2026-10-05").state, "soon");
  assert.equal(choreTiming(tires, [], "2026-06-01").state, "later");
  assert.equal(choreTiming(tires, [], "2026-06-01").dueOn, "2026-10-15");
});

test("after its window closes, a missed seasonal chore waits for next year", () => {
  const t = choreTiming(tires, [], "2026-12-10");
  assert.equal(t.state, "later");
  assert.equal(t.dueOn, "2027-10-15");
});

test("season windows can wrap past New Year", () => {
  assert.deepEqual(seasonWindow("12-01", "02-28", "2027-01-10"), { start: "2026-12-01", end: "2027-02-28" });
  assert.deepEqual(seasonWindow("12-01", "02-28", "2026-11-05"), { start: "2026-12-01", end: "2027-02-28" });
  assert.deepEqual(seasonWindow("12-01", "02-29", "2027-01-10"), { start: "2026-12-01", end: "2027-02-28" });
});

test("how often, in words", () => {
  assert.equal(describeRepeat(rule()), "Every week");
  assert.equal(describeRepeat(rule({ repeat_every: 3, repeat_unit: "month" })), "Every 3 months");
  assert.equal(describeRepeat(tires, "Oct 15 – Nov 30"), "Once a year, Oct 15 – Nov 30");
});

test("starter chores come due spread over their first interval", () => {
  const added = "2026-11-01";
  const weekly = Array.from({ length: 40 }, (_, i) => starterFirstDue(`chore-${i}`, added, { repeat_every: 1, repeat_unit: "week" }));
  assert.ok(weekly.every((d) => d >= added && d <= "2026-11-07"));
  assert.ok(new Set(weekly).size >= 4, "not all on one day");
  const yearly = starterFirstDue("x", added, { repeat_every: 1, repeat_unit: "year" });
  assert.ok(yearly <= "2026-11-28", "never more than four weeks away");
  assert.equal(starterFirstDue("same", added, { repeat_every: 1, repeat_unit: "month" }), starterFirstDue("same", added, { repeat_every: 1, repeat_unit: "month" }));
});

test("a never-done chore with a first day waits for it", () => {
  const t = choreTiming(rule({ first_due: "2026-11-09" }), [], TODAY);
  assert.equal(t.dueOn, "2026-11-09");
  assert.notEqual(t.state, "due");
});

test("energy modes hide the chores that can wait", () => {
  assert.equal(showsInMode("normal", "normal"), true);
  assert.equal(showsInMode("normal", "low"), false);
  assert.equal(showsInMode("low", "low"), true);
  assert.equal(showsInMode("low", "survival"), false);
  assert.equal(showsInMode("survival", "survival"), true);
});
