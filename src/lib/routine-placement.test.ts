import { test } from "node:test";
import assert from "node:assert/strict";
import { placeRoutines, routineMinutes, wantedSlot, type AnchoredRoutine, type Busy, type DayAnchors, type Wanted } from "./routine-placement.ts";

const at = (h: number, m = 0) => h * 60 + m;
const bedtime: Wanted = { id: "bed", start: at(19), minutes: 60, direction: "later", band: 24 * 60 };
const morning: Wanted = { id: "am", start: at(7), minutes: 70, direction: "later", band: 60 };

test("a routine with nothing in the way stays at its usual time", () => {
  const [p] = placeRoutines([bedtime], [{ startMin: at(16), endMin: at(17), title: "Swim" }]);
  assert.deepEqual(p, { id: "bed", startMin: at(19), endMin: at(20), movedFor: null, clash: false });
});

test("a late event pushes bedtime back to when it ends", () => {
  const [p] = placeRoutines([bedtime], [{ startMin: at(18), endMin: at(20, 30), title: "Hockey game" }]);
  assert.equal(p.startMin, at(20, 30));
  assert.equal(p.movedFor, "Hockey game");
});

test("back-to-back events push it past both", () => {
  const busy: Busy[] = [
    { startMin: at(18, 30), endMin: at(19, 30), title: "Dinner out" },
    { startMin: at(19, 30), endMin: at(20), title: "Ice cream" },
  ];
  const [p] = placeRoutines([bedtime], busy);
  assert.equal(p.startMin, at(20));
  assert.equal(p.movedFor, "Dinner out");
});

test("bedtime never goes into the next morning: it stays put instead", () => {
  const [p] = placeRoutines([bedtime], [{ startMin: at(18), endMin: at(24), title: "Overnight shift" }]);
  assert.equal(p.startMin, at(19));
  assert.equal(p.clash, true);
});

test("a morning routine only moves later, and only within its flex", () => {
  const [moved] = placeRoutines([morning], [{ startMin: at(6), endMin: at(7, 30), title: "Early swim" }]);
  assert.equal(moved.startMin, at(7, 30));
  assert.equal(moved.movedFor, "Early swim");
  // An event that runs two hours past wake-up: too far, so it sits on top.
  const [stuck] = placeRoutines([morning], [{ startMin: at(6), endMin: at(9), title: "Night shift" }]);
  assert.equal(stuck.startMin, at(7));
  assert.equal(stuck.clash, true);
});

test("a routine at a set time can move earlier to finish before something", () => {
  const afternoon: Wanted = { id: "pm", start: at(16), minutes: 30, direction: "both", band: 60 };
  const [p] = placeRoutines([afternoon], [{ startMin: at(16), endMin: at(18), title: "Practice" }]);
  assert.equal(p.startMin, at(15, 30));
  assert.equal(p.movedFor, "Practice");
});

test("routines next to each other move together like a train", () => {
  const morningRoutine: Wanted = { id: "am", start: at(7), minutes: 30, direction: "later", band: 60 };
  const chores: Wanted = { id: "jobs", start: at(7, 35), minutes: 20, direction: "both", band: 60 };
  const [a, b] = placeRoutines([morningRoutine, chores], [{ startMin: at(6, 30), endMin: at(7, 20), title: "Run" }]);
  assert.equal(a.startMin, at(7, 20));
  // It keeps its 5-minute gap behind the morning routine.
  assert.equal(b.startMin, at(7, 55));
  assert.equal(b.movedFor, "Run");
});

test("routines don't land on top of each other and stay in order", () => {
  const afterSchool: Wanted = { id: "after", start: at(18), minutes: 60, direction: "both", band: 60 };
  const [first, second] = placeRoutines([afterSchool, bedtime], [{ startMin: at(17), endMin: at(18, 30), title: "Swim" }]);
  assert.equal(first.startMin, at(18, 30));
  assert.equal(second.startMin, at(19, 30));
});

const routine = (over: Partial<AnchoredRoutine>): AnchoredRoutine => ({
  kind: "daily",
  anchor: "clock",
  anchor_meal_time_id: null,
  anchor_offset: 0,
  loose: false,
  usual_start: null,
  usual_minutes: 30,
  ...over,
});
const day: DayAnchors = { wake: at(6, 30), bed: at(21), mealEnd: (id) => (id === "dinner" ? at(18, 30) : null) };

test("anchors: after wake-up, by bedtime, after a meal, at a set time", () => {
  assert.deepEqual(wantedSlot(routine({ kind: "morning", anchor: "wake", anchor_offset: 10 }), [], day, 60), {
    start: at(6, 40),
    minutes: 30,
    direction: "later",
    band: 60,
  });
  const bed = wantedSlot(routine({ kind: "night", anchor: "bed", usual_minutes: 45 }), [], day, 60);
  assert.equal(bed.start, at(20, 15));
  const tidy = wantedSlot(routine({ anchor: "meal", anchor_meal_time_id: "dinner" }), [], day, 60);
  assert.equal(tidy.start, at(18, 30));
  assert.equal(tidy.direction, "later");
  const loose = wantedSlot(routine({ anchor: "meal", anchor_meal_time_id: "dinner", loose: true }), [], day, 60);
  assert.equal(loose.band, 24 * 60);
  // No dinner today: it falls back to its own time.
  assert.equal(wantedSlot(routine({ anchor: "meal", anchor_meal_time_id: "lunch", usual_start: "12:30" }), [], day, 60).start, at(12, 30));
  assert.equal(wantedSlot(routine({ usual_start: "16:15:00" }), [], day, 60).start, at(16, 15));
});

test("how long a routine takes: what it says, else its step times, else 30 minutes", () => {
  assert.equal(routineMinutes({ usual_minutes: 40 }, ["19:00"]), 40);
  assert.equal(routineMinutes({ usual_minutes: null }, ["07:00:00", null, "08:10:00"]), 80);
  assert.equal(routineMinutes({ usual_minutes: null }, [null]), 30);
});
