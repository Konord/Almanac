import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTimes } from "./quick-times.ts";

const base = { allDay: false, startDate: "2026-11-05", endDate: "2026-11-05", startTime: "", endTime: "", defaultMinutes: 60 };

test("no times means all day", () => {
  assert.deepEqual(fillTimes(base), { allDay: true });
});

test("ticking all day ignores times", () => {
  assert.deepEqual(fillTimes({ ...base, allDay: true, startTime: "09:00" }), { allDay: true });
});

test("only a start time uses the usual length", () => {
  assert.deepEqual(fillTimes({ ...base, startTime: "15:00" }), { allDay: false, startTime: "15:00", endTime: "16:00", endDate: "2026-11-05" });
  assert.deepEqual(fillTimes({ ...base, startTime: "09:15", defaultMinutes: 90 }), { allDay: false, startTime: "09:15", endTime: "10:45", endDate: "2026-11-05" });
});

test("a late start runs into the next day", () => {
  assert.deepEqual(fillTimes({ ...base, startTime: "23:30" }), { allDay: false, startTime: "23:30", endTime: "00:30", endDate: "2026-11-06" });
});

test("an end before the start on the same day ends the next day", () => {
  assert.deepEqual(fillTimes({ ...base, startTime: "22:00", endTime: "01:00" }), { allDay: false, startTime: "22:00", endTime: "01:00", endDate: "2026-11-06" });
});

test("both times given are kept", () => {
  assert.deepEqual(fillTimes({ ...base, startTime: "10:00", endTime: "11:30" }), { allDay: false, startTime: "10:00", endTime: "11:30", endDate: "2026-11-05" });
});

test("only an end time can't be used", () => {
  assert.equal(fillTimes({ ...base, endTime: "10:00" }), null);
});
