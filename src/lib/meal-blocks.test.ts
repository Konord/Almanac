import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksOn, storedEaters } from "./meal-blocks.ts";

const uses = [
  { meal_time_id: "dinner", member_id: "mum", day_type_id: "mum-work" },
  { meal_time_id: "dinner", member_id: "mum", day_type_id: "mum-home" },
  { meal_time_id: "dinner", member_id: "kid", day_type_id: "kid-school" },
  { meal_time_id: "lunch", member_id: "mum", day_type_id: "mum-home" },
];

test("a block is on a day for the people whose kind of day has it", () => {
  const on = blocksOn(uses, { mum: "mum-work", kid: "kid-school" });
  assert.deepEqual(on.get("dinner"), ["mum", "kid"]);
  assert.equal(on.has("lunch"), false);
  assert.deepEqual(blocksOn(uses, { mum: "mum-home", kid: null }).get("lunch"), ["mum"]);
});

test("a meal for everyone is stored with nobody listed", () => {
  assert.deepEqual(storedEaters(["kid", "mum"], ["mum", "kid"]), []);
  assert.deepEqual(storedEaters(["kid"], ["mum", "kid"]), ["kid"]);
  assert.deepEqual(storedEaters([], ["mum", "kid"]), []);
});
