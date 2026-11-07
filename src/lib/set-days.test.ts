import { test } from "node:test";
import assert from "node:assert/strict";
import { addWeekPlan, daysProblem, groupsOf, pickWeek, removeDayType, removeWeekPlan, takeTurns, type DaysDraft } from "./set-days.ts";

const draft: DaysDraft = {
  dayTypes: [
    { id: "mia-school", member_id: "mia", group: "school day", name: "School day", icon: "🎒", wake: "07:00", bed: "20:00" },
    { id: "mia-home", member_id: "mia", group: "home day", name: "Home day", icon: null, wake: "07:30", bed: "20:30" },
    { id: "leo-school", member_id: "leo", group: "school day", name: "School day", icon: "🎒", wake: "06:45", bed: "19:30" },
  ],
  weekPlans: [
    { id: "mia-week", member_id: "mia", name: "Usual week" },
    { id: "leo-week", member_id: "leo", name: "Usual week" },
  ],
  planDays: [
    ...[0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ plan_id: "mia-week", weekday, day_type_id: weekday === 0 || weekday === 6 ? "mia-home" : "mia-school" })),
    ...[0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ plan_id: "leo-week", weekday, day_type_id: "leo-school" })),
  ],
  members: [
    { member_id: "mia", current_week_plan_id: "mia-week", rotate: false, rotation_start: null },
    { member_id: "leo", current_week_plan_id: "leo-week", rotate: false, rotation_start: null },
  ],
  breaks: [
    { id: "b1", name: "Winter break", icon: "⛄", start: "2026-12-21", end: "2027-01-01", people: [{ member_id: "mia", day_type_id: "mia-home", week_plan_id: null }] },
  ],
};

test("a good draft has no problem", () => {
  assert.equal(daysProblem(draft), null);
});

test("kinds of day with the same name show as one group", () => {
  const groups = groupsOf(draft.dayTypes);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].types.map((t) => t.member_id), ["mia", "leo"]);
});

test("removing a kind of day moves its weekdays and breaks off it", () => {
  const next = removeDayType(draft, "mia-home");
  assert.equal(next.planDays.filter((d) => d.day_type_id === "mia-home").length, 0);
  assert.equal(next.breaks[0].people[0].day_type_id, null);
  assert.equal(daysProblem(next), null);
  // The last kind of day can't go.
  assert.equal(removeDayType(draft, "leo-school"), draft);
});

test("weeks can be added, taken in turns, and removed", () => {
  let next = addWeekPlan(draft, "mia", "new-1", "Summer week", "mia-week");
  assert.equal(next.planDays.filter((d) => d.plan_id === "new-1").length, 7);
  next = takeTurns(next, "mia", "new-1", "2026-11-11");
  const mia = next.members.find((m) => m.member_id === "mia");
  assert.equal(mia?.rotate, true);
  assert.equal(mia?.rotation_start, "2026-11-01"); // the second week is this week's, so turns began a week earlier
  assert.equal(daysProblem(next), null);
  next = removeWeekPlan(next, "new-1");
  assert.equal(next.members.find((m) => m.member_id === "mia")?.rotate, false);
  assert.equal(next.members.find((m) => m.member_id === "mia")?.current_week_plan_id, "mia-week");
  next = pickWeek(next, "mia", "mia-week");
  assert.equal(daysProblem(next), null);
});

test("problems are explained in plain words", () => {
  const names = { mia: "Mia", leo: "Leo" };
  assert.match(daysProblem({ ...draft, breaks: [{ ...draft.breaks[0], end: "2026-12-01" }] }, names) ?? "", /ends before it starts/);
  assert.match(daysProblem({ ...draft, breaks: [{ ...draft.breaks[0], people: [] }] }, names) ?? "", /Choose who/);
  assert.match(daysProblem({ ...draft, dayTypes: [...draft.dayTypes, { ...draft.dayTypes[0], id: "x" }] }, names) ?? "", /Mia has two kinds of day called School day/);
  assert.match(daysProblem({ ...draft, planDays: draft.planDays.filter((d) => !(d.plan_id === "leo-week" && d.weekday === 3)) }, names) ?? "", /every day/);
});
