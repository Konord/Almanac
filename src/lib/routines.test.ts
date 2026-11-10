import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentsForDay, dailyListPart, glanceRoutine, isLate, kindForTime, routineProgress, stepsForMember, type AssignmentLike, type RoutineKind } from "./routines.ts";

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
  day_type_id: null,
  on_date: null,
  active: true,
  ...extra,
});

const ava = [
  a("1", "school", { day_type_id: "weekday" }),
  a("2", "weekend", { day_type_id: "weekend" }),
  a("3", "bedtime", { day_type_id: "weekday" }),
  a("3b", "bedtime", { day_type_id: "weekend" }),
  a("4", "afterSchool", { day_type_id: "weekday" }),
];

test("a day type's routines apply, morning to bedtime", () => {
  assert.deepEqual(assignmentsForDay(ava, "ava", "2026-11-04", "weekday", kindOf).map((x) => x.template_id), ["school", "afterSchool", "bedtime"]);
  assert.deepEqual(assignmentsForDay(ava, "ava", "2026-11-07", "weekend", kindOf).map((x) => x.template_id), ["weekend", "bedtime"]);
});

test("a one-date routine swaps out the same kind for that day only", () => {
  const snowDay = [...ava, a("5", "weekend", { on_date: "2026-11-04" })];
  assert.deepEqual(
    assignmentsForDay(snowDay, "ava", "2026-11-04", "weekday", kindOf).map((x) => x.template_id),
    ["weekend", "afterSchool", "bedtime"],
  );
  // Thursday is unchanged.
  assert.deepEqual(
    assignmentsForDay(snowDay, "ava", "2026-11-05", "weekday", kindOf).map((x) => x.template_id),
    ["school", "afterSchool", "bedtime"],
  );
});

test("other people's and paused routines are left out", () => {
  const mixed = [...ava, a("6", "bedtime", { member_id: "sam", day_type_id: "samday" })];
  assert.equal(assignmentsForDay(mixed, "sam", "2026-11-04", "samday", kindOf).length, 1);
  const paused = ava.map((x) => ({ ...x, active: x.template_id !== "bedtime" }));
  assert.ok(!assignmentsForDay(paused, "ava", "2026-11-04", "weekday", kindOf).some((x) => x.template_id === "bedtime"));
});

test("the same routine is only listed once", () => {
  const twice = [...ava, a("7", "bedtime", { on_date: "2026-11-04" })];
  assert.equal(assignmentsForDay(twice, "ava", "2026-11-04", "weekday", kindOf).filter((x) => x.template_id === "bedtime").length, 1);
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

test("a shared routine gives each person their own steps", () => {
  const steps = [
    { id: "clear", member_ids: ["ava", "ben"] },
    { id: "dishwasher", member_ids: ["mom"] },
    { id: "wipe", member_ids: [] },
  ];
  assert.deepEqual(stepsForMember(steps, "ava").map((s) => s.id), ["clear", "wipe"]);
  assert.deepEqual(stepsForMember(steps, "mom").map((s) => s.id), ["dishwasher", "wipe"]);
});

test("the daily list shows a whole routine as one row, or just the chosen steps", () => {
  const s = (id: string, daily_list: boolean) => ({ id, daily_list });
  const none = new Set<string>();
  assert.equal(dailyListPart([s("a", false), s("b", false)], none).kind, "none");
  const whole = dailyListPart([s("a", true), s("b", true)], new Set(["a"]));
  assert.equal(whole.kind, "routine");
  assert.deepEqual(whole.kind === "routine" ? whole.steps.map((x) => x.id) : [], ["b"]);
  const some = dailyListPart([s("a", true), s("b", false), s("c", true)], new Set(["c"]));
  assert.equal(some.kind, "steps");
  assert.deepEqual(some.kind === "steps" ? some.steps.map((x) => x.id) : [], ["a"]);
  // A one-step routine is just a step.
  assert.equal(dailyListPart([s("a", true)], none).kind, "steps");
  assert.equal(dailyListPart([s("a", true), s("b", true)], new Set(["a", "b"])).kind, "none");
});
