import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accepts,
  choreDaysOn,
  placeable,
  planChoreDays,
  stretchStart,
  weekdaysLabel,
  type ChoreDay,
  type PlannableChore,
} from "./chore-days.ts";

// 2026-11-09 is a Monday.
const MON = "2026-11-09";
const TUE = "2026-11-10";
const WED = "2026-11-11";
const SAT = "2026-11-14";
const SUN = "2026-11-15";

const day = (id: string, extra: Partial<ChoreDay> = {}): ChoreDay => ({
  id,
  name: id,
  icon: null,
  weekdays: [],
  span: false,
  restrictive: false,
  max_tasks: 3,
  max_big: 1,
  is_free: false,
  ...extra,
});
const free = day("free", { is_free: true, max_tasks: 2 });
const laundry = day("laundry", {
  weekdays: [2],
  restrictive: true,
  max_tasks: 2,
});
const kitchen = day("kitchen", { weekdays: [6] });
const bigClean = day("big", { weekdays: [6, 0], span: true });

const chore = (id: string, extra: Partial<PlannableChore> = {}): PlannableChore => ({
  id,
  kind: "generated",
  tags: [],
  chore_day_ids: [],
  at_time: null,
  dueOn: MON,
  not_before: null,
  active: true,
  ...extra,
});

const where = (plan: ReturnType<typeof planChoreDays>, id: string) => plan.days.find((d) => d.items.some((i) => i.id === id))?.date;

test("a day with no chore day set gets the Free day", () => {
  assert.deepEqual(
    choreDaysOn([free, laundry], MON).map((d) => d.id),
    ["free"],
  );
  assert.deepEqual(
    choreDaysOn([free, laundry], TUE).map((d) => d.id),
    ["laundry"],
  );
  assert.deepEqual(
    choreDaysOn([free, kitchen, bigClean], SAT).map((d) => d.id),
    ["kitchen", "big"],
  );
});

test("a stretch starts on its first day", () => {
  assert.equal(stretchStart(bigClean, SUN), SAT);
  assert.equal(stretchStart(bigClean, SAT), SAT);
  assert.equal(stretchStart(kitchen, SAT), SAT);
});

test("restrictive days only take their own chores; untagged chores go anywhere else", () => {
  assert.equal(accepts(laundry, []), false);
  assert.equal(accepts(laundry, ["laundry"]), true);
  assert.equal(accepts(kitchen, []), true);
  assert.equal(accepts(kitchen, ["laundry"]), false);
  assert.equal(placeable([laundry], []), false);
  assert.equal(placeable([free, laundry], []), true);
});

test("a generated chore goes on the last matching day on or before it's due", () => {
  const plan = planChoreDays({
    choreDays: [free, laundry],
    chores: [chore("blankets", { chore_day_ids: ["laundry"], dueOn: "2026-11-20" })],
    today: MON,
  });
  // Laundry days are Tuesdays: the 10th and the 17th. The 17th is the last before the 20th.
  assert.equal(where(plan, "blankets"), "2026-11-17");
});

test("when the days before are full it goes on the next one after", () => {
  const tight = { ...laundry, max_tasks: 1 };
  const plan = planChoreDays({
    choreDays: [free, tight],
    chores: [chore("a", { chore_day_ids: ["laundry"], dueOn: TUE }), chore("b", { chore_day_ids: ["laundry"], dueOn: "2026-11-12" })],
    today: MON,
  });
  assert.equal(where(plan, "a"), TUE);
  assert.equal(where(plan, "b"), "2026-11-17");
});

test("an overdue chore goes on the first day with room", () => {
  const plan = planChoreDays({
    choreDays: [free, laundry],
    chores: [chore("towels", { chore_day_ids: ["laundry"], dueOn: "2026-11-01" })],
    today: MON,
  });
  assert.equal(where(plan, "towels"), TUE);
});

test("an essential overdue chore goes on today even when today is full", () => {
  const full = { ...free, max_tasks: 0 };
  const plan = planChoreDays({
    choreDays: [full],
    chores: [chore("meds", { tags: ["essential"], dueOn: "2026-11-08" })],
    today: MON,
  });
  assert.equal(where(plan, "meds"), MON);
});

test("the Big limit holds a second Big chore back", () => {
  const plan = planChoreDays({
    choreDays: [free],
    chores: [chore("oven", { tags: ["big"] }), chore("windows", { tags: ["big"] })],
    today: MON,
  });
  assert.equal(where(plan, "oven"), MON);
  assert.equal(where(plan, "windows"), TUE);
});

test("presets show on each chore day, and once per stretch", () => {
  const plan = planChoreDays({
    choreDays: [free, laundry, bigClean],
    chores: [chore("bins", { kind: "preset", chore_day_ids: ["laundry"] }), chore("floors", { kind: "preset", chore_day_ids: ["big"] })],
    today: MON,
    days: 14,
  });
  assert.deepEqual(
    plan.days.filter((d) => d.presets.includes("bins")).map((d) => d.date),
    [TUE, "2026-11-17"],
  );
  assert.deepEqual(
    plan.days.filter((d) => d.presets.includes("floors")).map((d) => d.date),
    [SAT, "2026-11-21"],
  );
  // Today inside a stretch that started yesterday: it still shows today.
  const sunday = planChoreDays({
    choreDays: [free, bigClean],
    chores: [chore("floors", { kind: "preset", chore_day_ids: ["big"] })],
    today: SUN,
    days: 1,
  });
  assert.deepEqual(sunday.days[0].presets, ["floors"]);
});

test("a chore at an exact time stays on its day and skips the count", () => {
  const full = { ...free, max_tasks: 0 };
  const plan = planChoreDays({
    choreDays: [full],
    chores: [chore("bins out", { at_time: "19:00", dueOn: WED })],
    today: MON,
  });
  assert.equal(where(plan, "bins out"), WED);
  assert.equal(plan.unplaced.length, 0);
});

test("nothing goes on days away; chores wait until after", () => {
  const plan = planChoreDays({
    choreDays: [free],
    chores: [chore("dust", { dueOn: "2026-11-01" }), chore("bins", { kind: "preset", chore_day_ids: ["free"] })],
    today: MON,
    away: new Set([MON, TUE]),
  });
  assert.equal(where(plan, "dust"), WED);
  assert.equal(plan.days[0].presets.length, 0);
});

test("a skipped chore waits until its not-before day", () => {
  const plan = planChoreDays({
    choreDays: [free],
    chores: [chore("dust", { not_before: WED })],
    today: MON,
  });
  assert.equal(where(plan, "dust"), WED);
});

test("errands are grouped onto a day that already has one", () => {
  const plan = planChoreDays({
    choreDays: [free],
    chores: [chore("post", { tags: ["errand"], dueOn: TUE }), chore("library", { tags: ["errand"], dueOn: "2026-11-12" })],
    today: MON,
  });
  assert.equal(where(plan, "post"), TUE);
  assert.equal(where(plan, "library"), TUE);
});

test("one-off chores wait for their chore day", () => {
  const plan = planChoreDays({
    choreDays: [free, kitchen],
    chores: [],
    oneOffs: [{ id: "dresser", chore_day_id: "kitchen" }],
    today: MON,
  });
  assert.equal(where(plan, "dresser"), SAT);
});

test("a one-off chore with no chore day goes on the next day that isn't restrictive", () => {
  const plan = planChoreDays({
    choreDays: [free, laundry],
    chores: [chore("big-one", { tags: ["big"], dueOn: MON })],
    oneOffs: [{ id: "eaves", chore_day_id: null, tags: ["big", "outdoor"] }],
    today: MON,
  });
  // Monday's one Big slot is taken and Tuesday is laundry only, so Wednesday.
  assert.equal(where(plan, "big-one"), MON);
  assert.equal(where(plan, "eaves"), WED);
});

test("an essential one-off chore goes on today, room or not", () => {
  const plan = planChoreDays({
    choreDays: [{ ...free, max_tasks: 1 }],
    chores: [chore("first", { dueOn: MON })],
    oneOffs: [{ id: "furnace", chore_day_id: null, tags: ["essential"] }],
    today: MON,
  });
  assert.equal(where(plan, "furnace"), MON);
});

test("a chore with no room anywhere this week is hard to schedule", () => {
  const plan = planChoreDays({
    choreDays: [free, laundry],
    chores: [chore("rug", { chore_day_ids: ["nowhere"] })],
    today: MON,
  });
  assert.deepEqual(plan.unplaced, ["rug"]);
});

test("chores already on today's list stay there", () => {
  const plan = planChoreDays({
    choreDays: [{ ...free, max_tasks: 1 }],
    chores: [chore("urgent", { dueOn: "2026-11-01" }), chore("kept")],
    today: MON,
    keptToday: new Set(["kept"]),
  });
  assert.equal(where(plan, "kept"), MON);
  assert.equal(where(plan, "urgent"), TUE);
});

test("weekday labels", () => {
  assert.equal(weekdaysLabel([6, 0]), "Sat, Sun");
  assert.equal(weekdaysLabel([]), "Days with nothing else");
});

test("a chore day moved by the weekly review", () => {
  // Laundry moved from Tuesday to Wednesday this week.
  const moves = [
    { chore_day_id: "laundry", date: TUE, on: false },
    { chore_day_id: "laundry", date: WED, on: true },
  ];
  assert.deepEqual(
    choreDaysOn([free, laundry], TUE, moves).map((d) => d.id),
    ["free"],
  );
  assert.deepEqual(
    choreDaysOn([free, laundry], WED, moves).map((d) => d.id),
    ["laundry"],
  );
  const plan = planChoreDays({
    choreDays: [free, laundry],
    chores: [chore("bins", { kind: "preset", chore_day_ids: ["laundry"] })],
    today: MON,
    days: 7,
    moves,
  });
  assert.deepEqual(
    plan.days.filter((d) => d.presets.includes("bins")).map((d) => d.date),
    [WED],
  );
  // A stretch moved a day earlier starts on the new first day.
  const early = [{ chore_day_id: "big", date: "2026-11-13", on: true }];
  assert.equal(stretchStart(bigClean, SUN, early), "2026-11-13");
});

test("a chore put on today by hand stays there even when it isn't due for months", () => {
  const plan = planChoreDays({
    choreDays: [free, kitchen],
    chores: [chore("oven", { dueOn: "2027-02-01" })],
    today: MON,
    keptToday: new Set(["oven"]),
  });
  assert.equal(where(plan, "oven"), MON);
  // Without the hand-placed task, it isn't planned at all yet.
  const later = planChoreDays({ choreDays: [free, kitchen], chores: [chore("oven", { dueOn: "2027-02-01" })], today: MON });
  assert.equal(where(later, "oven"), undefined);
});

test("a long-repeat chore goes a few days early onto a quieter day", () => {
  // Three chores due Friday the 13th; the third may go up to four days early.
  const roomy = { ...free, max_tasks: 5 };
  const plan = planChoreDays({
    choreDays: [roomy],
    chores: [
      chore("a", { dueOn: "2026-11-13" }),
      chore("b", { dueOn: "2026-11-13" }),
      chore("c", { dueOn: "2026-11-13", slackDays: 4 }),
    ],
    today: MON,
  });
  assert.equal(where(plan, "a"), "2026-11-13");
  assert.equal(where(plan, "b"), "2026-11-13");
  // The latest of the quiet days before it: Thursday.
  assert.equal(where(plan, "c"), "2026-11-12");
});

test("with no quieter day it stays on its due date", () => {
  const plan = planChoreDays({
    choreDays: [{ ...free, max_tasks: 5 }],
    chores: [chore("c", { dueOn: "2026-11-13", slackDays: 4 })],
    today: MON,
  });
  assert.equal(where(plan, "c"), "2026-11-13");
});
