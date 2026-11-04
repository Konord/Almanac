import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, dayOfWeek, layoutDay, monthGridDays, startOfWeek, weekDays } from "./calendar-layout.ts";

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

test("adding months clamps to the end of shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
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
