import { test } from "node:test";
import assert from "node:assert/strict";
import { choreHeadsUpDate, headsUpTime, leadLabel, leadMinutes, splitLead } from "./heads-ups.ts";
import { zonedToUtc } from "./time.ts";

test("a lead is said in the biggest unit that fits", () => {
  assert.deepEqual(splitLead(2880), { amount: 2, unit: "days" });
  assert.deepEqual(splitLead(90), { amount: 90, unit: "minutes" });
  assert.deepEqual(splitLead(10080), { amount: 1, unit: "weeks" });
  assert.equal(leadLabel(60), "1 hour before");
  assert.equal(leadLabel(0), "At the start");
  assert.equal(leadMinutes(3, "days"), 4320);
  assert.equal(leadMinutes(9, "weeks"), null);
});

test("a heads-up the night before a game", () => {
  const game = zonedToUtc("2026-11-14", "18:00", "America/Toronto");
  assert.deepEqual(headsUpTime(game, 1440 + 180, "America/Toronto"), { date: "2026-11-13", time: "15:00" });
  // Exactly a day before an all-day event: that day, no time.
  const allDay = zonedToUtc("2026-11-14", "00:00", "America/Toronto");
  assert.deepEqual(headsUpTime(allDay, 1440, "America/Toronto"), { date: "2026-11-13", time: null });
});

test("a chore's heads-up counts whole days back", () => {
  assert.equal(choreHeadsUpDate("2026-11-14", 10080), "2026-11-07");
  assert.equal(choreHeadsUpDate("2026-11-14", 120), "2026-11-14");
});
