import { test } from "node:test";
import assert from "node:assert/strict";
import { autoFirstDues, draftProblem, ruleColumns, seasonTabs, type ChoreManagerDraft, type DraftOccasional } from "./chore-manager.ts";

const occasional = (extra: Partial<DraftOccasional> = {}): DraftOccasional => ({
  id: "c1",
  name: "Clean the oven",
  icon: null,
  assignee_id: null,
  tags: [],
  chore_day_ids: [],
  repeat_every: 3,
  repeat_unit: "month",
  repeat_from: "done",
  start_date: null,
  snap: "none",
  preferred_weekday: 6,
  only_in: "any",
  only_seasons: [],
  only_months: [],
  season_start: "10-01",
  season_end: "10-31",
  at_time: null,
  visibility: "everyone",
  notes: null,
  active: true,
  heads_ups: [],
  first_due: null,
  ...extra,
});

const draft = (extra: Partial<ChoreManagerDraft> = {}): ChoreManagerDraft => ({
  days: [
    { id: "free", name: "Free day", icon: null, weekdays: [], span: false, restrictive: false, max_tasks: 2, max_big: 0, is_free: true, errands: false },
    { id: "laundry", name: "Laundry", icon: "🧺", weekdays: [1], span: false, restrictive: true, max_tasks: 2, max_big: 0, is_free: false, errands: false },
  ],
  regular: [{ id: "r1", chore_day_id: "laundry", name: "Wash the sheets", icon: null, assignee_id: null, due_time: "19:00", notes: null, active: true }],
  occasional: [occasional()],
  ...extra,
});

test("a good draft has no problem", () => {
  assert.equal(draftProblem(draft()), null);
});

test("problems are said in plain words", () => {
  assert.match(draftProblem(draft({ regular: [{ ...draft().regular[0], name: " " }] })) ?? "", /needs a name/);
  assert.match(draftProblem(draft({ regular: [{ ...draft().regular[0], chore_day_id: "gone" }] })) ?? "", /needs a chore day/);
  assert.match(draftProblem(draft({ regular: [{ ...draft().regular[0], due_time: "7pm" }] })) ?? "", /7 pm/);
  const noDays = draft();
  noDays.days[1] = { ...noDays.days[1], weekdays: [] };
  assert.match(draftProblem(noDays) ?? "", /Pick at least one day/);
  assert.match(draftProblem(draft({ occasional: [occasional({ repeat_from: "date", start_date: null })] })) ?? "", /counts from/);
  assert.match(draftProblem(draft({ occasional: [occasional({ only_in: "seasons" })] })) ?? "", /season/);
  assert.match(draftProblem(draft({ occasional: [occasional({ chore_day_ids: ["gone"] })] })) ?? "", /chore days is gone/);
});

test("once a year between dates saves as a yearly rule", () => {
  const cols = ruleColumns(occasional({ only_in: "dates", repeat_every: 3, snap: "weekday" }));
  assert.equal(cols.repeat_unit, "year");
  assert.equal(cols.repeat_every, 1);
  assert.equal(cols.snap, "none");
  assert.equal(cols.season_start, "10-01");
  assert.equal(ruleColumns(occasional()).season_start, null);
});

test("season tabs start with this season and file chores by when they're next due", () => {
  // 2026-11-09 is in fall.
  const tabs = seasonTabs(
    [
      { id: "late", dueOn: "2026-11-20" },
      { id: "overdue", dueOn: "2026-06-01" },
      { id: "winter", dueOn: "2027-01-05" },
      { id: "spring", dueOn: "2027-04-01" },
    ],
    "2026-11-09",
  );
  assert.deepEqual(
    tabs.map((t) => t.season),
    ["fall", "winter", "spring", "summer"],
  );
  assert.deepEqual(
    tabs[0].chores.map((c) => c.id),
    ["overdue", "late"],
  );
  assert.deepEqual(
    tabs[1].chores.map((c) => c.id),
    ["winter"],
  );
  assert.deepEqual(
    tabs[2].chores.map((c) => c.id),
    ["spring"],
  );
});

test("new occasional chores get quiet first days, apart from each other", () => {
  const today = "2026-11-09";
  const saved = occasional({ id: "saved", repeat_every: 1, repeat_unit: "month" });
  const a = occasional({ id: "new-a", repeat_every: 1, repeat_unit: "month" });
  const b = occasional({ id: "new-b", repeat_every: 1, repeat_unit: "month" });
  const set = occasional({ id: "new-c", repeat_every: 1, repeat_unit: "month", first_due: "2026-11-30" });
  const picked = autoFirstDues([saved, a, b, set], { saved: today }, today);
  // The one with a date set keeps it; the others avoid today, the 30th and each other.
  assert.equal(picked.has("new-c"), false);
  assert.equal(picked.has("saved"), false);
  const days = [today, "2026-11-30", picked.get("new-a"), picked.get("new-b")].map((d) => Number((d as string).slice(8)) + (d!.startsWith("2026-12") ? 30 : 0));
  days.sort((x, y) => x - y);
  for (let i = 1; i < days.length; i++) assert.ok(days[i] - days[i - 1] >= 4, days.join(","));
});
