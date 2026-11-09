import { test } from "node:test";
import assert from "node:assert/strict";
import { carriedOver, dailyOrder, onDailyList, showsOn, sortForToday, timedToday, type TodoTiming } from "./todos.ts";

const todo = (over: Partial<TodoTiming>): TodoTiming => ({ status: "open", due_date: null, date_kind: "due", at_time: null, lead_days: null, ...over });
const today = "2026-11-10";

test("a to-do with no date always shows", () => {
  assert.equal(showsOn(todo({}), today), true);
  assert.equal(showsOn(todo({ status: "done" }), today), false);
});

test("a due to-do shows in the lead-up to its date", () => {
  assert.equal(showsOn(todo({ due_date: "2026-11-15" }), today), true);
  assert.equal(showsOn(todo({ due_date: "2026-11-15", lead_days: 3 }), today), false);
  assert.equal(showsOn(todo({ due_date: "2026-11-13", lead_days: 3 }), today), true);
});

test("a to-do that starts on a day only shows from then", () => {
  assert.equal(showsOn(todo({ due_date: "2026-11-15", date_kind: "start" }), today), false);
  assert.equal(showsOn(todo({ due_date: today, date_kind: "start", at_time: "09:00" }), today), true);
});

test("anything still open after its day carries over", () => {
  const late = todo({ due_date: "2026-11-08", date_kind: "start" });
  assert.equal(showsOn(late, today), true);
  assert.equal(carriedOver(late, today), true);
  assert.equal(carriedOver(todo({ due_date: today }), today), false);
});

test("today's order: must-dos, carried over, today's (by time), then later", () => {
  const list = [
    todo({ due_date: "2026-11-20" }),
    todo({ due_date: today, date_kind: "start", at_time: "15:00" }),
    todo({ due_date: today, date_kind: "start", at_time: "09:00" }),
    todo({ due_date: "2026-11-09" }),
    todo({ must_do: true }),
  ];
  assert.deepEqual(
    sortForToday(list, today).map((t) => `${t.must_do ? "must" : ""}${t.due_date ?? ""}${t.at_time ?? ""}`),
    ["must", "2026-11-09", "2026-11-1009:00", "2026-11-1015:00", "2026-11-20"],
  );
});

test("the daily list leaves out tasks with no date until they're moved to today", () => {
  assert.equal(onDailyList(todo({}), today), false);
  assert.equal(onDailyList(todo({ due_date: today, date_kind: "start" }), today), true);
  assert.equal(onDailyList(todo({ due_date: "2026-11-15", lead_days: 3 }), today), false);
  assert.equal(onDailyList(todo({ due_date: "2026-11-08", date_kind: "start" }), today), true);
});

test("the daily list puts timed tasks first, by time, then must-dos and carried over", () => {
  const list = [
    todo({ due_date: "2026-11-12" }),
    todo({ due_date: today, date_kind: "start" }),
    todo({ due_date: "2026-11-09", date_kind: "start" }),
    todo({ due_date: today, must_do: true }),
    todo({ due_date: today, date_kind: "start", at_time: "19:00" }),
    todo({ due_date: today, date_kind: "start", at_time: "07:30" }),
  ];
  assert.deepEqual(
    dailyOrder(list, today).map((t) => `${t.at_time ?? ""}${t.must_do ? "must" : ""}${t.due_date}`),
    ["07:30" + today, "19:00" + today, "must" + today, "2026-11-09", today, "2026-11-12"],
  );
  assert.equal(timedToday(todo({ due_date: today, at_time: "09:00" }), today), true);
  assert.equal(timedToday(todo({ due_date: "2026-11-09", at_time: "09:00" }), today), false);
});
