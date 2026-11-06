import { test } from "node:test";
import assert from "node:assert/strict";
import { fillBlocks, pickForNow, weekdaysLabel, type ChoreBlock, type ChoreTodo } from "./chore-blocks.ts";

// 2026-11-06 is a Friday.
const FRI = "2026-11-06";
const block = (extra: Partial<ChoreBlock>): ChoreBlock => ({
  id: "b",
  name: "Big clean",
  icon: null,
  kind: "open",
  chore_id: null,
  weekdays: [6],
  start_time: "10:00",
  minutes: 60,
  member_ids: [],
  loose: false,
  presets: [],
  ...extra,
});
const todo = (id: string, minutes: number, extra: Partial<ChoreTodo> = {}): ChoreTodo => ({
  id,
  template_id: `c-${id}`,
  minutes,
  due_date: "2026-11-05",
  not_before: null,
  weight: 1,
  ...extra,
});

test("an open block takes its presets, then fills its free time", () => {
  const bigClean = block({ presets: ["c-vacuum"] });
  const { days, left } = fillBlocks([bigClean], [todo("vacuum", 40), todo("dust", 15), todo("oven", 30)], FRI);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-11-07");
  assert.deepEqual(days[0].items.map((t) => t.id), ["vacuum", "dust"]);
  assert.deepEqual(left.map((t) => t.id), ["oven"]);
});

test("a closed block only takes its own chore", () => {
  const laundry = block({ id: "l", name: "Laundry", kind: "closed", chore_id: "c-laundry", weekdays: [1], minutes: 120 });
  const { days, left } = fillBlocks([laundry], [todo("laundry", 90), todo("dust", 15)], FRI);
  assert.equal(days[0].date, "2026-11-09");
  assert.deepEqual(days[0].items.map((t) => t.id), ["laundry"]);
  assert.deepEqual(left.map((t) => t.id), ["dust"]);
});

test("the most overdue go in first, and a swapped one waits", () => {
  const odd = block({ weekdays: [3, 6], minutes: 30 });
  const { days } = fillBlocks(
    [odd],
    [todo("new", 20, { due_date: "2026-11-06" }), todo("old", 20, { due_date: "2026-10-30" }), todo("swapped", 10, { due_date: "2026-10-01", not_before: "2026-11-08" })],
    FRI,
  );
  assert.deepEqual(days[0].items.map((t) => t.id), ["old"]); // Saturday
  assert.deepEqual(days[1].items.map((t) => t.id), ["swapped", "new"]); // Wednesday
});

test("chore now picks what fits the time and energy", () => {
  const todos = [
    { ...todo("a", 30), size: "big" as const },
    { ...todo("b", 10), size: "small" as const },
    { ...todo("c", 15), size: "medium" as const },
  ];
  assert.deepEqual(pickForNow(todos, 20, ["small", "medium"]).map((t) => t.id), ["b"]);
  assert.deepEqual(pickForNow(todos, 30, ["small", "medium"]).map((t) => t.id), ["b", "c"]);
});

test("weekdays read Monday first", () => {
  assert.equal(weekdaysLabel([6, 1, 3]), "Mon, Wed, Sat");
  assert.equal(weekdaysLabel([0, 1, 2, 3, 4, 5, 6]), "Every day");
});
