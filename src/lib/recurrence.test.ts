import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRule, describeRule, expandEvents, parseRule } from "./recurrence.ts";
import { localDateOf, localTimeOf, zonedToUtc } from "./time.ts";

const TZ = "America/Toronto";

function series(rule: string, startDate: string, start: string, end: string, allDay = false) {
  return {
    id: "s1",
    title: "Hockey",
    starts_at: (allDay ? zonedToUtc(startDate, "00:00", TZ) : zonedToUtc(startDate, start, TZ)).toISOString(),
    ends_at: zonedToUtc(startDate, end, TZ).toISOString(),
    all_day: allDay,
    timezone: TZ,
    recurrence_rule: rule,
  };
}

const range = (from: string, to: string) => [zonedToUtc(from, "00:00", TZ), zonedToUtc(to, "00:00", TZ)] as const;

test("a weekly event appears on each matching day in the range", () => {
  const [a, b] = range("2026-11-01", "2026-11-29");
  const occ = expandEvents([series("FREQ=WEEKLY;BYDAY=TU", "2026-11-03", "18:00", "19:00")], [], a, b);
  assert.deepEqual(occ.map((o) => o.occurrence_date), ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  assert.ok(occ.every((o) => localTimeOf(new Date(o.starts_at), TZ) === "18:00"));
});

test("the local time stays the same across the daylight saving change", () => {
  // Toronto falls back on 2026-11-01; an October series must still be 9:30.
  const [a, b] = range("2026-10-26", "2026-11-09");
  const occ = expandEvents([series("FREQ=WEEKLY;BYDAY=MO", "2026-10-05", "09:30", "10:00")], [], a, b);
  assert.deepEqual(occ.map((o) => localTimeOf(new Date(o.starts_at), TZ)), ["09:30", "09:30"]);
  assert.notEqual(new Date(occ[0].starts_at).getUTCHours(), new Date(occ[1].starts_at).getUTCHours());
});

test("count and until stop the series", () => {
  const [a, b] = range("2026-11-01", "2026-12-31");
  assert.equal(expandEvents([series("FREQ=WEEKLY;BYDAY=TU;COUNT=2", "2026-11-03", "18:00", "19:00")], [], a, b).length, 2);
  const until = expandEvents([series("FREQ=DAILY;UNTIL=20261105T235959Z", "2026-11-03", "08:00", "08:30")], [], a, b);
  assert.deepEqual(until.map((o) => o.occurrence_date), ["2026-11-03", "2026-11-04", "2026-11-05"]);
});

test("skipped occurrences disappear and moved ones change time", () => {
  const [a, b] = range("2026-11-01", "2026-11-22");
  const moved = { start: zonedToUtc("2026-11-11", "17:00", TZ), end: zonedToUtc("2026-11-11", "18:00", TZ) };
  const occ = expandEvents(
    [series("FREQ=WEEKLY;BYDAY=TU", "2026-11-03", "18:00", "19:00")],
    [
      { event_id: "s1", original_date: "2026-11-03", skipped: true, new_starts_at: null, new_ends_at: null },
      { event_id: "s1", original_date: "2026-11-10", skipped: false, new_starts_at: moved.start.toISOString(), new_ends_at: moved.end.toISOString() },
    ],
    a,
    b,
  );
  assert.deepEqual(occ.map((o) => [o.occurrence_date, localDateOf(new Date(o.starts_at), TZ), o.moved]), [
    ["2026-11-10", "2026-11-11", true],
    ["2026-11-17", "2026-11-17", false],
  ]);
});

test("monthly all-day events keep their length", () => {
  const [a, b] = range("2026-11-01", "2027-01-01");
  const occ = expandEvents([series("FREQ=MONTHLY", "2026-11-15", "", "00:00", true)].map((e) => ({ ...e, ends_at: zonedToUtc("2026-11-16", "00:00", TZ).toISOString() })), [], a, b);
  assert.deepEqual(occ.map((o) => [localDateOf(new Date(o.starts_at), TZ), localDateOf(new Date(o.ends_at), TZ)]), [
    ["2026-11-15", "2026-11-16"],
    ["2026-12-15", "2026-12-16"],
  ]);
});

test("one-off events pass through unchanged", () => {
  const [a, b] = range("2026-11-01", "2026-11-08");
  const one = { ...series("", "2026-11-04", "10:00", "11:00"), recurrence_rule: null };
  const occ = expandEvents([one], [], a, b);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].id, "s1");
  assert.equal(occ[0].occurrence_date, null);
});

test("form choices round-trip through a rule", () => {
  const rule = buildRule({ frequency: "weekly", interval: 2, weekdays: [4, 2], end: "on", until: "2027-06-30", count: null });
  assert.equal(rule, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20270630T235959Z");
  assert.deepEqual(parseRule(rule), { frequency: "weekly", interval: 2, weekdays: [2, 4], end: "on", until: "2027-06-30", count: null });
  assert.equal(buildRule({ frequency: "none", interval: 1, weekdays: [], end: "never", until: null, count: null }), null);
  assert.equal(describeRule("FREQ=WEEKLY;BYDAY=TU"), "Every week on Tuesday");
});
