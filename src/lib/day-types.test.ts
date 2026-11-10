import { test } from "node:test";
import assert from "node:assert/strict";
import { dayFor, eventDates, weekPlanFor, type DayTypeData, type WeekSettings } from "./day-types.ts";

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
  breaks: [],
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

test("a break gives people another kind of day for its dates", () => {
  const withBreak: DayTypeData = {
    ...data,
    breaks: [
      { id: "xmas", name: "Christmas", icon: null, start_date: "2026-12-21", end_date: "2027-01-01", people: [{ member_id: "dad", day_type_id: "we", week_plan_id: null }] },
    ],
  };
  assert.equal(dayFor(dad, withBreak, "2026-12-22").dayType?.name, "Weekend"); // Tuesday
  assert.equal(dayFor(dad, withBreak, "2026-12-22").onBreak?.name, "Christmas");
  assert.equal(dayFor(dad, withBreak, "2027-01-04").dayType?.name, "Weekday"); // after it
  assert.equal(dayFor(dad, withBreak, "2027-01-04").onBreak, null);
});

test("a break can follow another week plan, or keep usual days", () => {
  const withBreak: DayTypeData = {
    ...data,
    breaks: [
      { id: "s", name: "Shifts", icon: null, start_date: "2026-11-16", end_date: "2026-11-22", people: [{ member_id: "dad", day_type_id: null, week_plan_id: "nights" }] },
      { id: "t", name: "Trip", icon: null, start_date: "2026-11-23", end_date: "2026-11-24", people: [{ member_id: "dad", day_type_id: null, week_plan_id: null }] },
    ],
  };
  assert.equal(dayFor(dad, withBreak, "2026-11-17").dayType?.name, "Night shift");
  assert.equal(dayFor(dad, withBreak, "2026-11-23").dayType?.name, "Weekday");
  assert.equal(dayFor(dad, withBreak, "2026-11-23").onBreak?.name, "Trip");
});

test("a break only changes the people on it", () => {
  const withBreak: DayTypeData = {
    ...data,
    breaks: [{ id: "x", name: "Camp", icon: null, start_date: "2026-11-09", end_date: "2026-11-09", people: [{ member_id: "kid", day_type_id: null, week_plan_id: null }] }],
  };
  assert.equal(dayFor(dad, withBreak, "2026-11-09").onBreak, null);
});

test("an event makes its date a kind of day, for the people on it", () => {
  const withEvent: DayTypeData = {
    ...data,
    dayTypes: [...data.dayTypes, { id: "od", member_id: "dad", name: "Office day", icon: null, wake_time: "06:00:00", bed_time: "22:00:00", sort_order: 4 }],
    eventDays: [{ title: "Office", name: "office day", member_ids: ["dad"], dates: ["2026-11-12"] }],
  };
  const day = dayFor(dad, withEvent, "2026-11-12"); // Thursday
  assert.equal(day.dayType?.name, "Office day");
  assert.equal(day.fromEvent, "Office");
  assert.equal(day.wake, "06:00");
  // Someone else's event, or a kind of day this person doesn't have, changes nothing.
  assert.equal(dayFor(dad, { ...withEvent, eventDays: [{ title: "Office", name: "Office day", member_ids: ["mum"], dates: ["2026-11-12"] }] }, "2026-11-12").dayType?.name, "Weekday");
  assert.equal(dayFor(dad, { ...withEvent, eventDays: [{ title: "Gig", name: "Gig day", member_ids: [], dates: ["2026-11-12"] }] }, "2026-11-12").dayType?.name, "Weekday");
  // A change by hand beats the event.
  const handChanged = { ...withEvent, eventDays: [{ title: "Office", name: "Office day", member_ids: [], dates: ["2026-11-11"] }] };
  assert.equal(dayFor(dad, handChanged, "2026-11-11").dayType?.name, "Weekend");
});

test("a break beats an event", () => {
  const both: DayTypeData = {
    ...data,
    breaks: [{ id: "b", name: "Holiday", icon: null, start_date: "2026-11-12", end_date: "2026-11-13", people: [{ member_id: "dad", day_type_id: "we", week_plan_id: null }] }],
    eventDays: [{ title: "Nights", name: "Night shift", member_ids: [], dates: ["2026-11-12"] }],
  };
  assert.equal(dayFor(dad, both, "2026-11-12").dayType?.name, "Weekend");
  assert.equal(dayFor(dad, { ...both, breaks: [] }, "2026-11-12").dayType?.name, "Night shift");
});

test("an all-day event covers each of its dates; a timed one, the day it starts", () => {
  assert.deepEqual(eventDates("2026-11-12T05:00:00Z", "2026-11-14T05:00:00Z", true, "America/Toronto"), ["2026-11-12", "2026-11-13"]);
  assert.deepEqual(eventDates("2026-11-13T03:00:00Z", "2026-11-13T11:00:00Z", false, "America/Toronto"), ["2026-11-12"]);
});
