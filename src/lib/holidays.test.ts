import { test } from "node:test";
import assert from "node:assert/strict";
import { describeHolidayRule, easterSunday, holidayDate, isHolidayRule, nextDate, PUBLIC_HOLIDAYS, specialDays, specialLabel } from "./holidays.ts";

const rule = (key: string) => PUBLIC_HOLIDAYS.find((h) => h.key === key)!.rule;

test("Easter falls on the right Sunday", () => {
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
  assert.equal(easterSunday(2024), "2024-03-31");
});

test("public holidays land on the right dates in 2026", () => {
  assert.equal(holidayDate(rule("family-day"), 2026), "2026-02-16");
  assert.equal(holidayDate(rule("good-friday"), 2026), "2026-04-03");
  assert.equal(holidayDate(rule("victoria-day"), 2026), "2026-05-18");
  assert.equal(holidayDate(rule("victoria-day"), 2027), "2027-05-24");
  assert.equal(holidayDate(rule("civic-holiday"), 2026), "2026-08-03");
  assert.equal(holidayDate(rule("thanksgiving"), 2026), "2026-10-12");
  assert.equal(holidayDate(rule("mothers-day"), 2026), "2026-05-10");
});

test("the last weekday of a month", () => {
  assert.equal(holidayDate({ kind: "nth", month: 5, weekday: 1, n: -1 }, 2026), "2026-05-25");
});

test("a date that can't happen is skipped", () => {
  assert.equal(holidayDate({ kind: "fixed", month: 2, day: 30 }, 2026), null);
});

test("birthdays show with the age they turn", () => {
  const days = specialDays([], [{ id: "a", name: "Ava", icon: null, month: 11, day: 20, birth_year: 2018 }], "2026-11-01", "2026-11-30");
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-11-20");
  assert.equal(specialLabel(days[0]), "Ava turns 8");
  assert.equal(days[0].icon, "🎂");
});

test("a range over New Year finds both years", () => {
  const xmas = { id: "x", name: "Christmas", icon: "🎄", rule: rule("christmas"), public_key: "christmas", art_only_days: 0, art_mix_days: 14 };
  const ny = { id: "n", name: "New Year", icon: null, rule: rule("new-year"), public_key: "new-year", art_only_days: 0, art_mix_days: 14 };
  const days = specialDays([xmas, ny], [], "2026-12-20", "2027-01-05");
  assert.deepEqual(days.map((d) => d.date), ["2026-12-25", "2027-01-01"]);
});

test("the next date rolls over to next year", () => {
  assert.equal(nextDate({ rule: rule("canada-day") }, "2026-11-09"), "2027-07-01");
  assert.equal(nextDate({ month: 11, day: 9 }, "2026-11-09"), "2026-11-09");
});

test("rules read back and describe themselves", () => {
  assert.ok(PUBLIC_HOLIDAYS.every((h) => isHolidayRule(h.rule)));
  assert.equal(isHolidayRule({ kind: "nth", month: 13, weekday: 1, n: 1 }), false);
  assert.equal(describeHolidayRule(rule("family-day")), "3rd Monday of February");
  assert.equal(describeHolidayRule(rule("good-friday")), "2 days before Easter");
});

test("new households start with every public holiday (the migration matches the list)", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../../supabase/migrations/20261110240000_starter_holidays.sql", import.meta.url), "utf8");
  const rows = [...sql.matchAll(/\(target_household, '((?:[^']|'')*)', '([^']*)', '([^']*)'::jsonb, '([^']*)', (\d+)\)/g)];
  assert.equal(rows.length, PUBLIC_HOLIDAYS.length);
  PUBLIC_HOLIDAYS.forEach((h, i) => {
    const [, name, icon, rule, key, order] = rows[i];
    assert.deepEqual(
      { name: name.replace(/''/g, "'"), icon, rule: JSON.parse(rule), key, order: Number(order) },
      { name: h.name, icon: h.icon, rule: h.rule, key: h.key, order: i },
    );
  });
});
