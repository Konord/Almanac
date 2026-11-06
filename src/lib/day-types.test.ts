import { test } from "node:test";
import assert from "node:assert/strict";
import { dayFor, weekPlanFor, type DayTypeData, type WeekSettings } from "./day-types.ts";

const data: DayTypeData = {
  dayTypes: [
    { id: "wd", member_id: "dad", name: "Weekday", icon: null, wake_time: "06:30:00", bed_time: "22:30:00", sort_order: 1 },
    { id: "we", member_id: "dad", name: "Weekend", icon: null, wake_time: "08:00:00", bed_time: "23:00:00", sort_order: 2 },
    { id: "ns", member_id: "dad", name: "Night shift", icon: null, wake_time: "14:00:00", bed_time: "06:00:00", sort_order: 3 },
  ],
  weekPlans: [
    { id: "usual", member_id: "dad", name: "Usual week", sort_order: 1 },
    { id: "nights", member_id: "dad", name: "Night shift week", sort_order: 2 },
  ],
  weekPlanDays: [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ week_plan_id: "usual", weekday, day_type_id: "wd" })),
    ...[0, 6].map((weekday) => ({ week_plan_id: "usual", weekday, day_type_id: "we" })),
    ...[0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ week_plan_id: "nights", weekday, day_type_id: "ns" })),
  ],
  overrides: [{ member_id: "dad", date: "2026-11-11", day_type_id: "we", wake_time: null, bed_time: null }],
};
const dad: WeekSettings = { id: "dad", current_week_plan_id: "usual", week_plans_rotate: false, rotation_start: null };

test("the week plan picks the day type for each weekday", () => {
  assert.equal(dayFor(dad, data, "2026-11-09").dayType?.name, "Weekday"); // Monday
  assert.equal(dayFor(dad, data, "2026-11-08").dayType?.name, "Weekend"); // Sunday
  assert.equal(dayFor(dad, data, "2026-11-09").wake, "06:30");
});

test("one date can be switched to another day type", () => {
  const day = dayFor(dad, data, "2026-11-11"); // Wednesday, Remembrance Day
  assert.equal(day.dayType?.name, "Weekend");
  assert.equal(day.switched, true);
});

test("swapping week plans swaps every day", () => {
  assert.equal(dayFor({ ...dad, current_week_plan_id: "nights" }, data, "2026-11-10").dayType?.name, "Night shift");
});

test("week plans can take turns, week by week", () => {
  const rotating: WeekSettings = { ...dad, week_plans_rotate: true, rotation_start: "2026-11-02" };
  assert.equal(weekPlanFor(rotating, data.weekPlans, "2026-11-04")?.id, "usual");
  assert.equal(weekPlanFor(rotating, data.weekPlans, "2026-11-10")?.id, "nights");
  assert.equal(weekPlanFor(rotating, data.weekPlans, "2026-11-17")?.id, "usual");
  assert.equal(weekPlanFor(rotating, data.weekPlans, "2026-10-28")?.id, "nights");
});
