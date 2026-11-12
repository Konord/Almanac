import { test } from "node:test";
import assert from "node:assert/strict";
import { panelBoxes, stepBox } from "./panel-boxes.ts";

const lists = [
  { id: "todo", name: "To-do", is_chores: false },
  { id: "groc", name: "Groceries", is_chores: false },
  { id: "chores", name: "Chores", is_chores: true },
];

test("by default every box shows except the Chores list", () => {
  assert.deepEqual(
    panelBoxes(null, lists, false).map((b) => b.id),
    ["today", "upnext", "todo", "groc", "routines", "habits", "health", "bucket"],
  );
});

test("the Agenda has no Up next", () => {
  assert.ok(!panelBoxes(null, lists, true).some((b) => b.id === "upnext"));
});

test("a household's pick keeps the usual order", () => {
  assert.deepEqual(
    panelBoxes(["bucket", "groc", "today"], lists, false).map((b) => b.id),
    ["today", "groc", "bucket"],
  );
});

test("a pick with nothing left still shows the daily list", () => {
  assert.deepEqual(
    panelBoxes(["upnext"], lists, true).map((b) => b.id),
    ["today"],
  );
});

test("the arrows go round", () => {
  const boxes = panelBoxes(["today", "groc", "bucket"], lists, false);
  assert.equal(stepBox(boxes, "bucket", 1), "today");
  assert.equal(stepBox(boxes, "today", -1), "bucket");
  assert.equal(stepBox(boxes, "gone", 1), "groc");
});
