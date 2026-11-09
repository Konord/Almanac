import { test } from "node:test";
import assert from "node:assert/strict";
import { endOf, setEnd, setLength, setStart, type When } from "./event-times.ts";

const nine: When = { date: "2026-11-10", start: 9 * 60, length: 60, anchor: "start" };

test("the end is the start plus the length", () => {
  assert.deepEqual(endOf(nine), { date: "2026-11-10", minute: 10 * 60 });
});

test("a new start keeps the length, so the end moves", () => {
  const moved = setStart(nine, "2026-11-11", 14 * 60);
  assert.deepEqual(endOf(moved), { date: "2026-11-11", minute: 15 * 60 });
});

test("a new length moves the end", () => {
  assert.deepEqual(endOf(setLength(nine, 120)), { date: "2026-11-10", minute: 11 * 60 });
});

test("a new end keeps the start and changes the length", () => {
  const ended = setEnd(nine, { date: "2026-11-10", minute: 12 * 60 });
  assert.equal(ended.start, 9 * 60);
  assert.equal(ended.length, 180);
});

test("after setting the end, a new length moves the start instead", () => {
  const ended = setEnd(nine, { date: "2026-11-10", minute: 17 * 60 });
  const longer = setLength(ended, 120);
  assert.equal(longer.start, 15 * 60);
  assert.deepEqual(endOf(longer), { date: "2026-11-10", minute: 17 * 60 });
});

test("an end time before the start runs past midnight", () => {
  const late: When = { ...nine, start: 22 * 60 };
  const ended = setEnd(late, { date: "2026-11-10", minute: 60 });
  assert.equal(ended.length, 3 * 60);
  assert.deepEqual(endOf(ended), { date: "2026-11-11", minute: 60 });
});

test("an end on a later day makes a multi-day event", () => {
  const conference = setEnd({ ...nine, start: 18 * 60 }, { date: "2026-11-12", minute: 12 * 60 });
  assert.equal(conference.length, 42 * 60);
});

test("an end day before the start moves the whole event back", () => {
  const back = setEnd(nine, { date: "2026-11-08", minute: 10 * 60 });
  assert.equal(back.date, "2026-11-08");
  assert.equal(back.start, 9 * 60);
  assert.equal(back.length, 60);
});

test("a long length set from the end can start the day before", () => {
  const twoAm: When = { date: "2026-11-10", start: 60, length: 60, anchor: "end" };
  const early = setLength(twoAm, 4 * 60);
  assert.equal(early.date, "2026-11-09");
  assert.equal(early.start, 22 * 60);
});
