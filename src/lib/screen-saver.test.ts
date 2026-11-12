import { test } from "node:test";
import assert from "node:assert/strict";
import {
  artChoices,
  DEFAULT_SCREEN_SAVER,
  folderUse,
  inWindow,
  nameKey,
  parseScreenSaver,
  pickPainting,
  saverMode,
  slotFor,
  type ArtFolder,
  type HolidayArt,
  type SaverInput,
} from "./screen-saver.ts";

const folders: ArtFolder[] = [
  { name: "General", files: ["General/a.jpg", "General/b.jpg", "General/c.jpg"] },
  { name: "Autumn", files: ["Autumn/leaves.jpg"] },
  { name: "Winter", files: ["Winter/snow.jpg"] },
  { name: "Halloween", files: ["Halloween/witch.jpg", "Halloween/horseman.jpg"] },
  { name: "Christmas", files: ["Christmas/nativity.jpg"] },
  { name: "New Year's Day", files: ["New Year's Day/fireworks.jpg"] },
  { name: "Ava", files: ["Ava/cake.jpg"] },
];
const halloween: HolidayArt = { id: "h", name: "Halloween", rule: { kind: "fixed", month: 10, day: 31 }, art_only_days: 3, art_mix_days: 30 };
const xmas: HolidayArt = { id: "x", name: "Christmas", rule: { kind: "fixed", month: 12, day: 25 }, art_only_days: 0, art_mix_days: 14 };
const newYear: HolidayArt = { id: "n", name: "New Year’s Day", rule: { kind: "fixed", month: 1, day: 1 }, art_only_days: 1, art_mix_days: 0 };
const holidays = [halloween, xmas, newYear];
const birthdays = [{ id: "b", name: "Ava", month: 10, day: 29 }];

test("folder names match holidays and birthdays loosely", () => {
  assert.equal(nameKey("Valentine's Day"), nameKey("valentines day"));
  assert.deepEqual(folderUse("general", [], []), { kind: "general" });
  assert.deepEqual(folderUse("Fall", [], []), { kind: "season", season: "fall" });
  assert.deepEqual(folderUse("Autumn", [], []), { kind: "season", season: "fall" });
  assert.equal(folderUse("New Year's Day", holidays, []).kind, "holiday");
  assert.equal(folderUse("Ava's birthday", [], birthdays).kind, "birthday");
  assert.equal(folderUse("Xmas", holidays, birthdays).kind, "none");
  // "Day" can be left off a holiday's folder.
  assert.equal(folderUse("Christmas", [{ id: "c", name: "Christmas Day" }], []).kind, "holiday");
  assert.equal(folderUse("Valentines", [{ id: "v", name: "Valentine's Day" }], []).kind, "holiday");
});

test("ordinary October days mix General, Autumn and Halloween", () => {
  const c = artChoices("2026-10-10", folders, holidays, birthdays, "half");
  assert.deepEqual(c.map((x) => [x.label, x.weight]), [["Autumn", 0.25], ["Halloween", 0.25], ["General", 0.5]]);
});

test("the days just before a holiday and the day itself only show its art", () => {
  for (const d of ["2026-10-28", "2026-10-30", "2026-10-31"]) {
    assert.deepEqual(artChoices(d, folders, holidays, [], "half").map((x) => x.label), ["Halloween"], d);
  }
  // The day after: back to normal.
  assert.ok(artChoices("2026-11-01", folders, holidays, [], "half").every((x) => x.label !== "Halloween"));
});

test("a birthday with a folder beats a holiday", () => {
  assert.deepEqual(artChoices("2026-10-29", folders, holidays, birthdays, "half").map((x) => x.label), ["Ava"]);
});

test("New Year's art shows on Dec 31 from last year's December", () => {
  assert.deepEqual(artChoices("2026-12-31", folders, holidays, [], "half").map((x) => x.label), ["New Year’s Day"]);
});

test("no General folder means only seasonal art; no seasonal art means only General", () => {
  const noGeneral = folders.filter((f) => f.name !== "General");
  // Nothing for a July day: any painting not kept for a holiday or birthday.
  const july = artChoices("2026-07-01", noGeneral, holidays, birthdays, "half");
  assert.deepEqual(july.map((x) => x.label), ["All paintings"]);
  assert.ok(july[0].files.includes("Autumn/leaves.jpg") && !july[0].files.includes("Halloween/witch.jpg") && !july[0].files.includes("Ava/cake.jpg"));
  assert.deepEqual(artChoices("2026-07-01", [], [], [], "half"), []);
  assert.deepEqual(artChoices("2026-01-15", noGeneral, [], [], "rarely").map((x) => [x.label, x.weight]), [["Winter", 1]]);
  assert.deepEqual(artChoices("2026-07-01", folders, [], [], "half").map((x) => [x.label, x.weight]), [["General", 1]]);
});

test("pictures never shown come first, then the ones shown longest ago", () => {
  const choice = { label: "General", why: "general" as const, files: ["a", "b", "c", "d"], weight: 1 };
  const shown = new Map([["a", "2026-01-01"], ["b", "2026-01-02"], ["c", "2026-01-03"]]);
  assert.equal(pickPainting([choice], shown, () => 0.99)?.file, "d");
  shown.set("d", "2026-01-04");
  assert.equal(pickPainting([choice], shown, () => 0.99)?.file, "a");
  assert.equal(pickPainting([], shown), null);
});

test("picks the group by weight first", () => {
  const big = { label: "General", why: "general" as const, files: Array.from({ length: 400 }, (_, i) => `g${i}`), weight: 0.5 };
  const small = { label: "Halloween", why: "mixed in" as const, files: ["h1"], weight: 0.5 };
  assert.equal(pickPainting([big, small], new Map(), () => 0.75)?.choice.label, "Halloween");
});

test("slots: a day, half days, two hours, or each start", () => {
  assert.equal(slotFor("day", "2026-11-12", 600, null), "2026-11-12");
  assert.equal(slotFor("twice", "2026-11-12", 13 * 60, null), "2026-11-12 pm");
  assert.equal(slotFor("2h", "2026-11-12", 9 * 60 + 30, null), "2026-11-12 08h");
  assert.equal(slotFor("start", "2026-11-12", 0, "2026-11-12T10:00:00Z"), "start 2026-11-12T10:00:00Z");
});

const base: SaverInput = { minute: 15 * 60, weekday: 4, idleMs: 0, settings: DEFAULT_SCREEN_SAVER, meals: [], appOpen: false };
const min = 60_000;

test("comes on after the idle time", () => {
  assert.equal(saverMode({ ...base, idleMs: 9 * min }), "none");
  assert.equal(saverMode({ ...base, idleMs: 10 * min }), "art");
  assert.equal(saverMode({ ...base, idleMs: 99 * min, settings: { ...DEFAULT_SCREEN_SAVER, idleMinutes: 0 } }), "none");
});

test("during dinner it comes back soon after a tap", () => {
  const dinner = { ...base, minute: 18 * 60 + 10, meals: [{ start: 18 * 60, end: 18 * 60 + 45 }] };
  assert.equal(saverMode({ ...dinner, idleMs: 30_000 }), "none");
  assert.equal(saverMode({ ...dinner, idleMs: 2 * min }), "art");
});

test("overnight turns the screen off, never over an open app", () => {
  assert.equal(saverMode({ ...base, minute: 2 * 60, idleMs: 5 * min }), "off");
  assert.equal(saverMode({ ...base, minute: 23 * 60 + 30, idleMs: 5 * min, appOpen: true }), "none");
  assert.ok(inWindow(23 * 60, "23:00", "06:00") && inWindow(5 * 60 + 59, "23:00", "06:00") && !inWindow(6 * 60, "23:00", "06:00"));
});

test("a set time that crosses midnight belongs to the day it starts on", () => {
  const settings = { ...DEFAULT_SCREEN_SAVER, overnight: { mode: "none" as const, start: "23:00", end: "06:00" }, times: [{ days: [5], start: "22:00", end: "01:00" }] };
  assert.equal(saverMode({ ...base, settings, weekday: 5, minute: 22 * 60 + 30, idleMs: 3 * min }), "art");
  assert.equal(saverMode({ ...base, settings, weekday: 6, minute: 30, idleMs: 3 * min }), "art");
  assert.equal(saverMode({ ...base, settings, weekday: 4, minute: 30, idleMs: 3 * min }), "none");
});

test("settings fill gaps and drop bad set times", () => {
  const s = parseScreenSaver({ idleMinutes: 15, times: [{ days: [0, 6], start: "08:00", end: "10:00" }, { days: [], start: "x", end: "y" }], mat: "purple" });
  assert.equal(s.idleMinutes, 15);
  assert.equal(s.times.length, 1);
  assert.equal(s.mat, "white");
  assert.equal(s.duringMeals, null);
  assert.deepEqual(parseScreenSaver(null), DEFAULT_SCREEN_SAVER);
});
