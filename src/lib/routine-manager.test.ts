import { test } from "node:test";
import assert from "node:assert/strict";
import { draftProblem, kindFor, type ManagerDraft } from "./routine-manager.ts";

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
  show_on_daily_list: false,
  visibility: "everyone",
};
const draft = (changes: Partial<ManagerDraft> = {}): ManagerDraft => ({
  routines: [routine],
  steps: [{ id: "new-2", routine_id: "new-1", text: "Brush teeth", icon: null, habit: true }],
  uses: [],
  ...changes,
});

test("drafts are checked before saving", () => {
  assert.equal(draftProblem(draft()), null);
  assert.match(draftProblem(draft({ routines: [{ ...routine, name: " " }] })) ?? "", /needs a name/);
  assert.match(draftProblem(draft({ routines: [{ ...routine, anchor: "clock" }] })) ?? "", /Choose a time/);
  assert.match(draftProblem(draft({ routines: [{ ...routine, usual_minutes: Number.NaN }] })) ?? "", /between 5 and 240/);
  assert.match(draftProblem(draft({ steps: [{ id: "x", routine_id: "new-1", text: "", icon: null, habit: true }] })) ?? "", /step is empty/);
});
