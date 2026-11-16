import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLIDAY_THEMES, holidayHero, themeFor } from "./holiday-theme.ts";

test("Christmas and Halloween get colour themes; Christmas Eve and others don't", () => {
  assert.equal(themeFor("Christmas Day"), "christmas");
  assert.equal(themeFor("Halloween"), "halloween");
  assert.equal(themeFor("Christmas Eve"), null);
  assert.equal(themeFor("Canada Day"), null);
});

test("the hero is the first holiday, not a birthday", () => {
  const hero = holidayHero(
    [
      { kind: "birthday", name: "Leo", icon: "🎂" },
      { kind: "holiday", name: "Remembrance Day", icon: "🍁" },
    ],
    true,
  );
  assert.deepEqual(hero, { title: "Remembrance Day", emoji: "🍁", theme: null });
  assert.equal(holidayHero([{ kind: "birthday", name: "Leo", icon: "🎂" }], true), null);
});

test("switched off in Settings: no hero", () => {
  assert.equal(holidayHero([{ kind: "holiday", name: "Christmas Day", icon: null }], false), null);
  assert.equal(holidayHero([{ kind: "holiday", name: "Christmas Day", icon: null }], true)?.emoji, "🎄");
});

test("holiday themes never touch person colours", () => {
  for (const t of Object.values(HOLIDAY_THEMES)) {
    assert.equal(Object.keys(t.colours).some((k) => k.startsWith("person")), false);
  }
});
