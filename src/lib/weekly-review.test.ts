import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChoreDay } from "./chore-days.ts";
import {
  applyFix,
  dismiss,
  moveChoreDay,
  movesFor,
  reviewDue,
  reviewProblems,
  setMeal,
  type ReviewDay,
  type ReviewDraft,
} from "./weekly-review.ts";

// 2026-11-15 is a Sunday; the week runs to Saturday the 21st.
const dates = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const [SUN, MON, TUE, WED, THU] = dates;

const cd = (id: string, weekdays: number[], extra: Partial<ChoreDay> = {}): ChoreDay => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  icon: null,
  weekdays,
  span: false,
  restrictive: false,
  max_tasks: 3,
  max_big: 1,
  is_free: false,
  ...extra,
});
const free = cd("free", [], { is_free: true });
const marketing = cd("marketing", [1]);
const laundry = cd("laundry", [2]);

const week = (extra: Partial<Record<string, Partial<ReviewDay>>> = {}): ReviewDay[] =>
  dates.map((date, i) => ({ date, name: names[i], past: false, away: false, busy: false, busyMinutes: 0, meals: [], ...extra[date] }));

const draft = (): ReviewDraft => ({ choreDays: { [MON]: ["marketing"], [TUE]: ["laundry"] }, dayTypes: {}, meals: {}, dismissed: [] });

const problems = (d: ReviewDraft, days: ReviewDay[], hard: { id: string; name: string }[] = []) =>
  reviewProblems({ draft: d, days, choreDays: [free, marketing, laundry], categoryNames: { pasta: "Pasta night" }, hardChores: hard });

test("a quiet week has nothing to check", () => {
  assert.deepEqual(problems(draft(), week()), []);
});

test("a holiday on a chore day offers to move it to the nearest good day", () => {
  const found = problems(draft(), week({ [MON]: { away: true } }));
  assert.equal(found.length, 1);
  assert.equal(found[0].text, "You're away on Monday, a Marketing day. Move Marketing to Tuesday?");
  // Approving it moves the chore day, and the problem goes away.
  const fixed = applyFix(draft(), found[0].fix!.apply);
  assert.deepEqual(fixed.choreDays[MON], []);
  assert.deepEqual(fixed.choreDays[TUE], ["laundry", "marketing"]);
  assert.deepEqual(problems(fixed, week({ [MON]: { away: true } })), []);
});

test("a chore day packed with plans moves to a day that isn't", () => {
  const found = problems(draft(), week({ [TUE]: { busy: true }, [WED]: { busy: true } }));
  assert.equal(found[0].fix?.apply.kind, "move");
  // Monday is one day from Tuesday, Thursday two: the nearest wins.
  assert.equal(found[0].fix?.label, "Move to Monday");
});

test("a meal on a night everyone is out can be taken off", () => {
  const days = week({ [THU]: { meals: [{ id: "m1", mealTimeName: "Dinner", categoryId: "pasta", everyoneOut: true }] } });
  const found = problems(draft(), days);
  assert.equal(found[0].text, "Everyone is out at dinner on Thursday. Take Pasta night off?");
  const fixed = applyFix(draft(), found[0].fix!.apply);
  assert.deepEqual(problems(fixed, days), []);
});

test("past days aren't checked, and dismissed problems stay hidden", () => {
  assert.deepEqual(problems(draft(), week({ [MON]: { away: true, past: true } })), []);
  const days = week({ [MON]: { away: true } });
  const id = problems(draft(), days)[0].id;
  assert.deepEqual(problems(dismiss(draft(), id), days), []);
});

test("hard-to-schedule chores link to the chore", () => {
  const found = problems(draft(), week(), [{ id: "c1", name: "Wash blankets" }]);
  assert.equal(found[0].link?.href, "/chores?edit=c1");
});

test("saving turns the draft into moves away from the usual weekdays", () => {
  const moved = moveChoreDay(draft(), "marketing", MON, SUN);
  assert.deepEqual(movesFor([free, marketing, laundry], moved, dates), [
    { chore_day_id: "marketing", date: SUN, on: true },
    { chore_day_id: "marketing", date: MON, on: false },
  ]);
  assert.deepEqual(movesFor([free, marketing, laundry], draft(), dates), []);
});

test("swapping a meal keeps the new theme; null takes it off", () => {
  assert.equal(setMeal(draft(), "m1", "tacos").meals.m1, "tacos");
  assert.equal(setMeal(draft(), "m1", null).meals.m1, null);
});

test("the reminder shows from Saturday morning until the week is confirmed", () => {
  const base = { review: { weekday: 6, time: "09:00" }, nextWeek: SUN, reviewed: false };
  assert.equal(reviewDue({ ...base, today: "2026-11-13", nowTime: "20:00" }), false); // Friday
  assert.equal(reviewDue({ ...base, today: "2026-11-14", nowTime: "08:59" }), false);
  assert.equal(reviewDue({ ...base, today: "2026-11-14", nowTime: "09:00" }), true);
  assert.equal(reviewDue({ ...base, today: "2026-11-14", nowTime: "18:00", reviewed: true }), false);
  assert.equal(reviewDue({ ...base, today: SUN, nowTime: "10:00" }), false); // the week has begun
});
