import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, dayOfWeek, firstOfMonth, fiveRowMonth, layoutBars, layoutDay, layoutSpans, memberRuns, monthGridDays, rollingWeekDays, startOfWeek, weekDays } from "./calendar-layout.ts";

test("finds the day of the week", () => {
  assert.equal(dayOfWeek("2026-11-04"), 3); // Wednesday
  assert.equal(dayOfWeek("2026-11-01"), 0); // Sunday
});

test("weeks start on Sunday or Monday as the household prefers", () => {
  assert.equal(startOfWeek("2026-11-04", 0), "2026-11-01");
  assert.equal(startOfWeek("2026-11-04", 1), "2026-11-02");
  assert.equal(startOfWeek("2026-11-01", 1), "2026-10-26");
  assert.deepEqual(weekDays("2026-12-31", 0), [
    "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
  ]);
});

test("a month grid covers whole weeks", () => {
  const days = monthGridDays("2026-11-15", 0);
  assert.equal(days[0], "2026-11-01");
  assert.equal(days.at(-1), "2026-12-05");
  assert.equal(days.length % 7, 0);
  const feb = monthGridDays("2026-02-10", 1);
  assert.equal(feb[0], "2026-01-26");
  assert.equal(feb.at(-1), "2026-03-01");
});

test("the rolling view starts with this week and shows five", () => {
  const days = rollingWeekDays("2026-11-19", 0);
  assert.equal(days.length, 35);
  assert.equal(days[0], "2026-11-15");
  assert.equal(days.at(-1), "2026-12-19");
});

test("a six-week month folds its last days into the fifth row", () => {
  // August 2026 starting Sunday: Aug 1 is a Saturday, so Aug 30 and 31 make a 6th week.
  const { cells, shared } = fiveRowMonth(monthGridDays("2026-08-10", 0));
  assert.equal(cells.length, 35);
  assert.equal(shared.get("2026-08-23"), "2026-08-30");
  assert.equal(shared.get("2026-08-24"), "2026-08-31");
  assert.equal(shared.size, 2);
  // A five-week month shares nothing.
  assert.equal(fiveRowMonth(monthGridDays("2026-11-15", 0)).shared.size, 0);
});

test("adding months clamps to the end of shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
});

test("the rolling view's arrows jump to the 1st of a month", () => {
  assert.equal(firstOfMonth("2026-11-12", 1), "2026-12-01");
  assert.equal(firstOfMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(firstOfMonth("2026-11-12", -1), "2026-10-01");
  assert.equal(firstOfMonth("2026-01-31", 1), "2026-02-01");
  // The 1st is always in the top row of the rolling 5 weeks.
  assert.equal(rollingWeekDays(firstOfMonth("2026-11-12", 1), 1).slice(0, 7).includes("2026-12-01"), true);
});

test("events that don't overlap each get the full width", () => {
  const placed = layoutDay([
    { id: "a", startMin: 540, endMin: 600 },
    { id: "b", startMin: 600, endMin: 660 },
  ]);
  assert.deepEqual(placed.map((p) => [p.id, p.lane, p.lanes]), [["a", 0, 1], ["b", 0, 1]]);
});

test("overlapping events sit side by side", () => {
  const placed = layoutDay([
    { id: "a", startMin: 540, endMin: 660 },
    { id: "b", startMin: 570, endMin: 600 },
    { id: "c", startMin: 600, endMin: 630 },
    { id: "d", startMin: 720, endMin: 780 },
  ]);
  const byId = Object.fromEntries(placed.map((p) => [p.id, [p.lane, p.lanes]]));
  assert.deepEqual(byId.a, [0, 2]);
  assert.deepEqual(byId.b, [1, 2]);
  assert.deepEqual(byId.c, [1, 2]); // reuses b's lane once b ends
  assert.deepEqual(byId.d, [0, 1]); // a separate group later in the day
});

test("an event's people make runs of neighbouring columns", () => {
  const cols = ["mom", "ava", "dad", "sam"];
  assert.deepEqual(memberRuns(["mom", "ava"], cols), [[0, 1]]);
  assert.deepEqual(memberRuns(["mom", "dad"], cols), [[0, 0], [2, 2]]);
  assert.deepEqual(memberRuns([], cols), [[0, 3]]);
  assert.deepEqual(memberRuns(["gone"], cols), [[0, 3]]);
  assert.deepEqual(memberRuns(["sam", "dad", "ava"], cols), [[1, 3]]);
});

test("spanning blocks share lanes only where they meet", () => {
  const placed = layoutSpans([
    { id: "karate", startMin: 600, endMin: 660, c0: 0, c1: 1 },
    { id: "soccer", startMin: 600, endMin: 660, c0: 2, c1: 3 },
    { id: "dentist", startMin: 630, endMin: 690, c0: 1, c1: 1 },
  ]);
  const by = Object.fromEntries(placed.map((p) => [p.id, p]));
  assert.equal(by.soccer.lanes, 1);
  assert.equal(by.karate.lanes, 2);
  assert.equal(by.dentist.lanes, 2);
  assert.notEqual(by.karate.lane, by.dentist.lane);
});

test("bars over several days stack so they never overlap", () => {
  const { placed, hidden } = layoutBars(
    [
      { id: "trip", first: 3, last: 6 },
      { id: "dentist", first: 4, last: 4 },
      { id: "camp", first: 0, last: 2 },
      { id: "party", first: 4, last: 4 },
    ],
    7,
    2,
  );
  const lane = Object.fromEntries(placed.map((b) => [b.id, b.lane]));
  assert.equal(lane.camp, 0);
  assert.equal(lane.trip, 0);
  assert.equal(lane.dentist, 1);
  // The third thing on Thursday doesn't fit, so Thursday shows "+1".
  assert.equal(lane.party, undefined);
  assert.deepEqual(hidden, [0, 0, 0, 0, 1, 0, 0]);
});
