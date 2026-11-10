import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAfter, repeatLabel, stepOn } from "./grocery-repeats.ts";

test("labels read naturally", () => {
  assert.equal(repeatLabel(1, "week"), "Every week");
  assert.equal(repeatLabel(3, "week"), "Every 3 weeks");
  assert.equal(repeatLabel(10, "day"), "Every 10 days");
  assert.equal(repeatLabel(2, "month"), "Every 2 months");
});

test("a step is days, weeks or months", () => {
  assert.equal(stepOn("2026-11-10", 2, "week"), "2026-11-24");
  assert.equal(stepOn("2026-11-10", 10, "day"), "2026-11-20");
  assert.equal(stepOn("2026-01-31", 1, "month"), "2026-02-28");
});

test("due today: next time is one step on", () => {
  assert.equal(nextAfter("2026-11-10", 1, "week", "2026-11-10"), "2026-11-17");
});

test("a list left alone for a while keeps its rhythm", () => {
  assert.equal(nextAfter("2026-11-02", 1, "week", "2026-11-17"), "2026-11-23");
});
