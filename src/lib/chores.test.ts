import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, choreTiming, daysBetween, describeRepeat, describeRule, seasonOf, seasonWindow, snapDate, spreadFirstDue, spreadSlack, starterFirstDue, upcomingDue, type ChoreRule } from "./chores.ts";

const rule = (extra: Partial<ChoreRule> = {}): ChoreRule => ({
  repeat_every: 1,
  repeat_unit: "week",
  preferred_weekday: null,
  season_start: null,
  season_end: null,
  ...extra,
});

// 2026-11-05 is a Thursday.
const TODAY = "2026-11-05";

test("a chore never done is due today", () => {
  const t = choreTiming(rule(), [], TODAY);
  assert.equal(t.state, "due");
  assert.equal(t.dueOn, TODAY);
  assert.equal(t.lastDone, null);
});

test("a chore never done with a favourite day waits for that day", () => {
  const t = choreTiming(rule({ preferred_weekday: 6 }), [], TODAY);
  assert.equal(t.dueOn, "2026-11-07");
  assert.equal(t.state, "soon");
});

test("a weekly chore comes back a week after it was done", () => {
  const t = choreTiming(rule(), [{ status: "done", completed_on: "2026-11-01" }], TODAY);
  assert.equal(t.dueOn, "2026-11-08");
  assert.equal(t.state, "soon");
  assert.equal(t.lastDone, "2026-11-01");
});

test("an overdue chore says by how much", () => {
  const t = choreTiming(rule(), [{ status: "done", completed_on: "2026-10-20" }], TODAY);
  assert.equal(t.state, "due");
  assert.equal(t.dueOn, "2026-10-27");
  assert.equal(t.daysOverdue, 9);
});

test("skipping restarts the clock without counting as done", () => {
  const t = choreTiming(
    rule(),
    [
      { status: "done", completed_on: "2026-10-20" },
      { status: "skipped", completed_on: TODAY },
    ],
    TODAY,
  );
  assert.equal(t.dueOn, "2026-11-12");
  assert.equal(t.state, "soon");
  assert.equal(t.lastDone, "2026-10-20");
});

test("a weekly Saturday chore done late on Monday goes back to Saturday", () => {
  const t = choreTiming(rule({ preferred_weekday: 6 }), [{ status: "done", completed_on: "2026-11-02" }], TODAY);
  assert.equal(t.dueOn, "2026-11-07");
});

test("a weekly Saturday chore done on Saturday comes back next Saturday", () => {
  const t = choreTiming(rule({ preferred_weekday: 6 }), [{ status: "done", completed_on: "2026-10-31" }], TODAY);
  assert.equal(t.dueOn, "2026-11-07");
});

test("monthly and every-few-months chores", () => {
  assert.equal(choreTiming(rule({ repeat_unit: "month" }), [{ status: "done", completed_on: "2026-10-05" }], TODAY).state, "due");
  const t = choreTiming(rule({ repeat_unit: "month", repeat_every: 3 }), [{ status: "done", completed_on: "2026-10-05" }], TODAY);
  assert.equal(t.dueOn, "2027-01-05");
  assert.equal(t.state, "later");
});

test("intervals add days, weeks, months and years", () => {
  assert.equal(addInterval("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(addInterval("2026-11-05", 2, "week"), "2026-11-19");
  assert.equal(addInterval("2024-02-29", 1, "year"), "2025-02-28");
  assert.equal(addInterval("2026-11-05", 3, "day"), "2026-11-08");
});

test("days between two dates", () => {
  assert.equal(daysBetween("2026-10-27", "2026-11-05"), 9);
  assert.equal(daysBetween("2026-11-05", "2026-11-05"), 0);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
});

const tires = rule({ repeat_unit: "year", season_start: "10-15", season_end: "11-30" });

test("a seasonal chore is due inside its window until it's done", () => {
  const t = choreTiming(tires, [], TODAY);
  assert.equal(t.state, "due");
  assert.deepEqual(t.window, { start: "2026-10-15", end: "2026-11-30" });
  assert.equal(t.daysOverdue, 21);
});

test("a seasonal chore done this season waits for next year", () => {
  const t = choreTiming(tires, [{ status: "done", completed_on: "2026-10-20" }], TODAY);
  assert.equal(t.state, "later");
  assert.equal(t.dueOn, "2027-10-15");
});

test("last year's round doesn't count for this season", () => {
  const t = choreTiming(tires, [{ status: "done", completed_on: "2025-10-20" }], TODAY);
  assert.equal(t.state, "due");
});

test("a seasonal chore before its window is soon or later", () => {
  assert.equal(choreTiming(tires, [], "2026-10-05").state, "soon");
  assert.equal(choreTiming(tires, [], "2026-06-01").state, "later");
  assert.equal(choreTiming(tires, [], "2026-06-01").dueOn, "2026-10-15");
});

test("after its window closes, a missed seasonal chore waits for next year", () => {
  const t = choreTiming(tires, [], "2026-12-10");
  assert.equal(t.state, "later");
  assert.equal(t.dueOn, "2027-10-15");
});

test("season windows can wrap past New Year", () => {
  assert.deepEqual(seasonWindow("12-01", "02-28", "2027-01-10"), { start: "2026-12-01", end: "2027-02-28" });
  assert.deepEqual(seasonWindow("12-01", "02-28", "2026-11-05"), { start: "2026-12-01", end: "2027-02-28" });
  assert.deepEqual(seasonWindow("12-01", "02-29", "2027-01-10"), { start: "2026-12-01", end: "2027-02-28" });
});

test("how often, in words", () => {
  assert.equal(describeRepeat(rule()), "Every week");
  assert.equal(describeRepeat(rule({ repeat_every: 3, repeat_unit: "month" })), "Every 3 months");
  assert.equal(describeRepeat(tires, "Oct 15 – Nov 30"), "Once a year, Oct 15 – Nov 30");
});

test("starter chores come due spread over their first interval", () => {
  const added = "2026-11-01";
  const weekly = Array.from({ length: 40 }, (_, i) => starterFirstDue(`chore-${i}`, added, { repeat_every: 1, repeat_unit: "week" }));
  assert.ok(weekly.every((d) => d >= added && d <= "2026-11-07"));
  assert.ok(new Set(weekly).size >= 4, "not all on one day");
  const yearly = starterFirstDue("x", added, { repeat_every: 1, repeat_unit: "year" });
  assert.ok(yearly <= "2026-11-28", "never more than four weeks away");
  assert.equal(starterFirstDue("same", added, { repeat_every: 1, repeat_unit: "month" }), starterFirstDue("same", added, { repeat_every: 1, repeat_unit: "month" }));
});

test("a never-done chore with a first day waits for it", () => {
  const t = choreTiming(rule({ first_due: "2026-11-09" }), [], TODAY);
  assert.equal(t.dueOn, "2026-11-09");
  assert.notEqual(t.state, "due");
});

test("seasons start on the solstices and equinoxes", () => {
  assert.equal(seasonOf("2026-12-21").season, "winter");
  assert.equal(seasonOf("2026-12-20").season, "fall");
  assert.deepEqual(seasonOf("2027-02-10"), { season: "winter", start: "2026-12-21", end: "2027-03-19" });
  assert.equal(seasonOf("2026-06-21").end, "2026-09-21");
});

test("snap to the first or last Saturday of the month or season", () => {
  assert.equal(snapDate("2026-11-18", "first_of_month", 6), "2026-11-07");
  assert.equal(snapDate("2026-11-18", "last_of_month", 6), "2026-11-28");
  assert.equal(snapDate("2026-11-18", "first_of_season", 6), "2026-09-26");
  assert.equal(snapDate("2026-11-18", "last_of_season", 0), "2026-12-20");
});

test("monthly on the first Saturday, counted from when it was done", () => {
  const r = rule({ repeat_unit: "month", preferred_weekday: 6, snap: "first_of_month" });
  assert.equal(choreTiming(r, [{ status: "done", completed_on: "2026-11-07" }], TODAY).dueOn, "2026-12-05");
  // Done late in the month: still the next month's first Saturday, not this one again.
  assert.equal(choreTiming(r, [{ status: "done", completed_on: "2026-10-30" }], TODAY).dueOn, "2026-11-07");
  // Never done: this month's first Saturday has gone, so next month's.
  assert.equal(choreTiming(r, [], "2026-11-10").dueOn, "2026-12-05");
});

test("a set schedule counts from its start date, not from when it was done", () => {
  const r = rule({ repeat_every: 2, repeat_from: "date", start_date: "2026-10-01" });
  // Oct 1, Oct 15, Oct 29, Nov 12…
  assert.equal(choreTiming(r, [{ status: "done", completed_on: "2026-10-31" }], TODAY).dueOn, "2026-11-12");
  // Missed a couple: only the newest one is due, it doesn't pile up.
  const missed = choreTiming(r, [{ status: "done", completed_on: "2026-10-02" }], TODAY);
  assert.equal(missed.dueOn, "2026-10-29");
  assert.equal(missed.state, "due");
});

test("only in summer: waits for summer, on the nearest Saturday inside it", () => {
  const r = rule({ repeat_every: 2, preferred_weekday: 6, only_seasons: ["summer"] });
  const t = choreTiming(r, [{ status: "done", completed_on: "2026-09-12" }], TODAY);
  assert.equal(t.dueOn, "2027-06-26");
});

test("only in some months", () => {
  const r = rule({ repeat_unit: "month", only_months: [4, 5, 6, 7, 8, 9, 10] });
  assert.equal(choreTiming(r, [{ status: "done", completed_on: "2026-10-20" }], TODAY).dueOn, "2027-04-01");
});

test("the rule in words", () => {
  const r = rule({ repeat_every: 2, preferred_weekday: 6, snap: "last_of_month", only_seasons: ["summer"] });
  assert.equal(describeRule(r), "Every 2 weeks, on the last Saturday of the month, only in summer");
});

test("a new chore's first time goes on the quietest day within one repeat", () => {
  // Monthly: the next ten days are busy, so it goes in the quiet stretch after,
  // as far from them as it can within the month.
  const busy = ["2026-11-05", "2026-11-05", "2026-11-06", "2026-11-08", "2026-11-12", "2026-11-14", "2026-12-06"];
  assert.equal(spreadFirstDue(rule({ repeat_unit: "month" }), TODAY, busy), "2026-11-25");
  // Nothing else due: today.
  assert.equal(spreadFirstDue(rule({ repeat_unit: "month" }), TODAY, []), TODAY);
  // Weekly chores stay within the week.
  const d = spreadFirstDue(rule(), TODAY, busy) as string;
  assert.ok(d >= TODAY && d <= "2026-11-11");
  // Set schedules and season windows keep their own dates.
  assert.equal(spreadFirstDue(rule({ repeat_from: "date", start_date: "2026-11-01" }), TODAY, busy), null);
  assert.equal(spreadFirstDue(rule({ season_start: "10-15", season_end: "11-30" }), TODAY, busy), null);
});

test("chores made together and spread out keep apart", () => {
  let others: string[] = [];
  const picks: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = rule({ repeat_unit: "month" });
    const d = spreadFirstDue(r, TODAY, others) as string;
    picks.push(d);
    others = [...others, ...upcomingDue(d, r, TODAY, "2026-12-31")];
  }
  // Four monthly chores made on one day land at least a week apart.
  const sorted = picks.toSorted();
  for (let i = 1; i < sorted.length; i++) assert.ok(daysBetween(sorted[i - 1], sorted[i]) >= 7, picks.join(", "));
});

test("only long repeats may go early", () => {
  assert.equal(spreadSlack(rule()), 0);
  assert.equal(spreadSlack(rule({ repeat_every: 2 })), 0);
  assert.equal(spreadSlack(rule({ repeat_unit: "month" })), 4);
  assert.equal(spreadSlack(rule({ repeat_unit: "month", repeat_every: 3 })), 7);
  assert.equal(spreadSlack(rule({ repeat_unit: "month", repeat_from: "date", start_date: "2026-01-01" })), 0);
});
