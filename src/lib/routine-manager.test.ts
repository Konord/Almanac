import { test } from "node:test";
import assert from "node:assert/strict";
import { copyRoutine, dailyListState, draftProblem, joinRuns, kindFor, stepPeople, type ManagerDraft } from "./routine-manager.ts";

test("kind comes from when the routine happens", () => {
  assert.equal(kindFor({ anchor: "wake", usual_start: null }, null), "morning");
  assert.equal(kindFor({ anchor: "bed", usual_start: null }, null), "night");
  assert.equal(kindFor({ anchor: "clock", usual_start: "07:30" }, null), "morning");
  assert.equal(kindFor({ anchor: "clock", usual_start: "15:00" }, null), "daily");
  assert.equal(kindFor({ anchor: "clock", usual_start: "19:30" }, null), "night");
  assert.equal(kindFor({ anchor: "meal", usual_start: null }, "18:00"), "daily");
});

const routine = {
  id: "new-1",
  name: "Morning",
  anchor: "wake" as const,
  anchor_meal_time_id: null,
  anchor_offset: 0,
  usual_start: null,
  usual_minutes: 30,
  loose: false,
  habit_since: null,
  visibility: "everyone",
  is_template: false,
};
const draft = (changes: Partial<ManagerDraft> = {}): ManagerDraft => ({
  routines: [routine],
  steps: [{ id: "new-2", routine_id: "new-1", text: "Brush teeth", icon: null, habit: true, member_ids: [], daily_list: false }],
  uses: [],
  ...changes,
});

test("drafts are checked before saving", () => {
  assert.equal(draftProblem(draft()), null);
  assert.match(draftProblem(draft({ routines: [{ ...routine, name: " " }] })) ?? "", /needs a name/);
  assert.match(draftProblem(draft({ routines: [{ ...routine, anchor: "clock" }] })) ?? "", /Choose a time/);
  assert.match(draftProblem(draft({ routines: [{ ...routine, usual_minutes: Number.NaN }] })) ?? "", /between 5 and 240/);
  assert.match(draftProblem(draft({ steps: [{ id: "x", routine_id: "new-1", text: "", icon: null, habit: true, member_ids: [], daily_list: false }] })) ?? "", /step is empty/);
});

test("a step's people are only ones who still have the routine", () => {
  const uses = [
    { id: "u1", routine_id: "new-1", member_id: "ava", day_type_id: "weekday" },
    { id: "u2", routine_id: "new-1", member_id: "mom", day_type_id: "weekday" },
  ];
  const step = { id: "s", routine_id: "new-1", text: "Clear the table", icon: null, habit: true, member_ids: ["ava", "ben"], daily_list: false };
  assert.deepEqual(stepPeople({ uses }, step), ["ava"]);
  assert.equal(draftProblem(draft({ uses, steps: [step] })), null);
  // Ava and Ben both gone: nobody does it, so it must be fixed before saving.
  assert.match(draftProblem(draft({ uses: [uses[1]], steps: [step] })) ?? "", /Nobody on Morning does "Clear the table"/);
});

test("the routine's daily list switch is all, some or none of its steps", () => {
  assert.equal(dailyListState([{ daily_list: true }, { daily_list: true }]), "all");
  assert.equal(dailyListState([{ daily_list: true }, { daily_list: false }]), "some");
  assert.equal(dailyListState([{ daily_list: false }]), "none");
  assert.equal(dailyListState([]), "none");
});

test("neighbouring columns at the same time share one bubble", () => {
  const b = (routineId: string, start: number, end: number) => ({ routineId, start, end });
  const runs = joinRuns([
    [b("tidy", 1110, 1125), b("bed", 1200, 1230)],
    [b("tidy", 1110, 1125), b("bed", 1230, 1260)],
    [b("tidy", 1110, 1125)],
    [],
    [b("tidy", 1110, 1125)],
  ]);
  const tidy = runs.filter((r) => r.routineId === "tidy").map((r) => [r.c0, r.c1]);
  assert.deepEqual(tidy, [
    [0, 2],
    [4, 4],
  ]);
  // Different bedtimes: separate blocks.
  assert.deepEqual(
    runs.filter((r) => r.routineId === "bed").map((r) => [r.c0, r.c1]),
    [
      [0, 0],
      [1, 1],
    ],
  );
});

test("templates are copies, and never on anyone's day", () => {
  let n = 0;
  const id = () => `new-c${(n += 1)}`;
  const shared = { ...draft({ uses: [{ id: "u0", routine_id: "new-1", member_id: "ava", day_type_id: "d" }] }), steps: [{ id: "new-2", routine_id: "new-1", text: "Brush teeth", icon: null, habit: true, member_ids: ["ava"], daily_list: true }] };
  const copy = copyRoutine(shared, "new-1", id, true);
  assert.ok(copy);
  assert.equal(copy.routine.is_template, true);
  assert.notEqual(copy.routine.id, "new-1");
  assert.deepEqual(copy.steps.map((s) => [s.routine_id, s.text, s.member_ids.length, s.daily_list]), [[copy.routine.id, "Brush teeth", 0, true]]);
  const withTemplate = { ...shared, routines: [...shared.routines, copy.routine], steps: [...shared.steps, ...copy.steps] };
  assert.equal(draftProblem(withTemplate), null);
  assert.match(
    draftProblem({ ...withTemplate, uses: [...withTemplate.uses, { id: "u", routine_id: copy.routine.id, member_id: "ava", day_type_id: "d" }] }) ?? "",
    /template can't be on someone's day/,
  );
});
