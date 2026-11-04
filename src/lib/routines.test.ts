import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentsForDay, glanceRoutine, isLate, kindForTime, routineProgress, type AssignmentLike, type RoutineKind } from "./routines.ts";

const kinds: Record<string, RoutineKind> = {
  school: "morning",
  weekend: "morning",
  bedtime: "night",
  afterSchool: "daily",
};
const kindOf = (id: string) => kinds[id];

const a = (id: string, template_id: string, extra: Partial<AssignmentLike>): AssignmentLike => ({
  id,
  template_id,
  member_id: "ava",
  weekdays: null,
  on_date: null,
  active: true,
  ...extra,
});

const ava = [
  a("1", "school", { weekdays: [1, 2, 3, 4, 5] }),
  a("2", "weekend", { weekdays: [0, 6] }),
  a("3", "bedtime", { weekdays: [0, 1, 2, 3, 4, 5, 6] }),
  a("4", "afterSchool", { weekdays: [1, 2, 3, 4, 5] }),
];

test("weekday routines apply on their days, morning to bedtime", () => {
  // 2026-11-04 is a Wednesday.
  assert.deepEqual(assignmentsForDay(ava, "ava", "2026-11-04", kindOf).map((x) => x.template_id), ["school", "afterSchool", "bedtime"]);
  // 2026-11-07 is a Saturday.
  assert.deepEqual(assignmentsForDay(ava, "ava", "2026-11-07", kindOf).map((x) => x.template_id), ["weekend", "bedtime"]);
});

test("a one-date routine swaps out the same kind for that day only", () => {
  const snowDay = [...ava, a("5", "weekend", { on_date: "2026-11-04" })];
  assert.deepEqual(
    assignmentsForDay(snowDay, "ava", "2026-11-04", kindOf).map((x) => x.template_id),
    ["weekend", "afterSchool", "bedtime"],
  );
  // Thursday is unchanged.
  assert.deepEqual(
    assignmentsForDay(snowDay, "ava", "2026-11-05", kindOf).map((x) => x.template_id),
    ["school", "afterSchool", "bedtime"],
  );
});

test("other people's and paused routines are left out", () => {
  const mixed = [...ava, a("6", "bedtime", { member_id: "sam", weekdays: [3] })];
  assert.equal(assignmentsForDay(mixed, "sam", "2026-11-04", kindOf).length, 1);
  const paused = ava.map((x) => ({ ...x, active: x.template_id !== "bedtime" }));
  assert.ok(!assignmentsForDay(paused, "ava", "2026-11-04", kindOf).some((x) => x.template_id === "bedtime"));
});

test("the same routine is only listed once", () => {
  const twice = [...ava, a("7", "bedtime", { on_date: "2026-11-04" })];
  assert.equal(assignmentsForDay(twice, "ava", "2026-11-04", kindOf).filter((x) => x.template_id === "bedtime").length, 1);
});

const steps = [
  { id: "c", position: 3, target_time: null, essential: true },
  { id: "a", position: 1, target_time: "07:00:00", essential: false },
  { id: "b", position: 2, target_time: "07:45:00", essential: true },
];

test("progress counts ticks and finds the next step in order", () => {
  const none = routineProgress(steps, new Set());
  assert.equal(none.next?.id, "a");
  assert.equal(none.done, 0);
  const some = routineProgress(steps, new Set(["a", "c"]));
  assert.equal(some.next?.id, "b");
  assert.equal(some.done, 2);
  assert.equal(some.complete, false);
  assert.equal(routineProgress(steps, new Set(["a", "b", "c"])).complete, true);
  assert.equal(routineProgress([], new Set()).complete, false);
});

test("a step is late once its target time has passed", () => {
  assert.equal(isLate(steps[2], "07:44"), false);
  assert.equal(isLate(steps[2], "07:46"), true);
  assert.equal(isLate(steps[0], "23:00"), false);
});

test("the glance shows the routine for this time of day", () => {
  assert.equal(kindForTime("07:30", "17:00"), "morning");
  assert.equal(kindForTime("15:30", "17:00"), "daily");
  assert.equal(kindForTime("19:00", "17:00"), "night");
  const day = [
    { name: "School morning", kind: "morning" as const, complete: false },
    { name: "After school", kind: "daily" as const, complete: false },
    { name: "Bedtime", kind: "night" as const, complete: false },
  ];
  assert.equal(glanceRoutine(day, "morning")?.name, "School morning");
  assert.equal(glanceRoutine(day, "daily")?.name, "After school");
  // Nothing for the afternoon: look ahead to bedtime, not back to the morning.
  assert.equal(glanceRoutine([day[0], day[2]], "daily")?.name, "Bedtime");
  // Everything done: show the last one (as finished).
  assert.equal(glanceRoutine(day.map((r) => ({ ...r, complete: true })), "night")?.name, "Bedtime");
});
