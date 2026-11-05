import { test } from "node:test";
import assert from "node:assert/strict";
import { placeRoutines, usualSlot, type Busy, type Wanted } from "./routine-placement.ts";

const at = (h: number, m = 0) => h * 60 + m;
const bedtime: Wanted = { id: "bed", kind: "night", start: at(19), minutes: 60 };
const morning: Wanted = { id: "am", kind: "morning", start: at(7), minutes: 70 };

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

test("an early appointment pulls the morning routine earlier", () => {
  const [p] = placeRoutines([morning], [{ startMin: at(7, 45), endMin: at(9), title: "Dentist" }]);
  assert.equal(p.startMin, at(6, 35));
  assert.equal(p.endMin, at(7, 45));
  assert.equal(p.movedFor, "Dentist");
});

test("a morning with no room before goes after instead", () => {
  const [p] = placeRoutines([morning], [{ startMin: at(5), endMin: at(8), title: "Early flight" }]);
  assert.equal(p.startMin, at(8));
});

test("a routine with nowhere to go stays put and says so", () => {
  const [p] = placeRoutines([bedtime], [{ startMin: at(18), endMin: at(24), title: "Overnight shift" }]);
  assert.equal(p.startMin, at(19));
  assert.equal(p.clash, true);
});

test("routines don't land on top of each other", () => {
  const afterSchool: Wanted = { id: "after", kind: "daily", start: at(18), minutes: 60 };
  const [first, second] = placeRoutines([afterSchool, bedtime], [{ startMin: at(17), endMin: at(18, 30), title: "Swim" }]);
  assert.equal(first.startMin, at(18, 30));
  assert.equal(second.startMin, at(19, 30));
  assert.equal(second.movedFor, null);
});

test("usual slot comes from the routine, then its steps, then its kind", () => {
  assert.deepEqual(usualSlot({ kind: "night", usual_start: "18:45:00", usual_minutes: 40 }, ["19:00"]), { start: at(18, 45), minutes: 40 });
  assert.deepEqual(usualSlot({ kind: "morning", usual_start: null, usual_minutes: null }, ["07:00:00", null, "08:10:00"]), {
    start: at(7),
    minutes: 80,
  });
  assert.deepEqual(usualSlot({ kind: "daily", usual_start: null, usual_minutes: null }, [null]), { start: at(16), minutes: 30 });
});
