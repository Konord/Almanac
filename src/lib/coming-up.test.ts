import { test } from "node:test";
import assert from "node:assert/strict";
import { comingDayText, onePerSeries } from "./coming-up.ts";

test("a repeating thing shows once, at its next time", () => {
  const items = [
    { id: "a1", series_id: "grandma", title: "Grandma visit" },
    { id: "b1", series_id: "daycare", title: "Daycare day" },
    { id: "c1", series_id: "counselling", title: "Counselling" },
    { id: "b2", series_id: "daycare", title: "Daycare day" },
    { id: "c2", series_id: "counselling", title: "Counselling" },
    { id: "d1", series_id: "party", title: "Fam Christmas Party" },
  ];
  assert.deepEqual(onePerSeries(items).map((e) => e.id), ["a1", "b1", "c1", "d1"]);
});

test("past the coming week, the date shows with the weekday", () => {
  const tz = "America/Toronto";
  // Thursday Nov 26: Sat Nov 28 is this week; Fri Dec 4 is next.
  assert.equal(comingDayText("2026-11-28", "2026-11-26", new Date("2026-11-28T18:30:00Z"), "en-CA", tz), "Sat");
  assert.equal(comingDayText("2026-12-02", "2026-11-26", new Date("2026-12-02T15:00:00Z"), "en-CA", tz), "Wed");
  assert.match(comingDayText("2026-12-04", "2026-11-26", new Date("2026-12-04T13:00:00Z"), "en-CA", tz), /^Fri, Dec 4$/);
});
