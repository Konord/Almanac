import { test } from "node:test";
import assert from "node:assert/strict";
import { planGroceryLines, type PlanIngredient, type PlannedDish } from "./grocery-plan.ts";

const planned: PlannedDish[] = [
  { recipeId: "spag", name: "Spaghetti", batches: 1, day: "Mon" },
  { recipeId: "stew", name: "Beef stew", batches: 2, day: "Tue" },
  { recipeId: "tacos", name: "Beef tacos", batches: 1, day: "Wed" },
];
const ingredients: PlanIngredient[] = [
  { recipe_id: "spag", item_id: "onion", amount: 1, unit: null },
  { recipe_id: "spag", item_id: "pasta", amount: 1, unit: "box" },
  { recipe_id: "stew", item_id: "onion", amount: 1, unit: null },
  { recipe_id: "stew", item_id: "beef", amount: 400, unit: "g" },
  { recipe_id: "tacos", item_id: "onion", amount: 1, unit: null },
  { recipe_id: "tacos", item_id: "cheddar", amount: 1, unit: "pack" },
];

test("ingredients add up by item, times batches", () => {
  const lines = planGroceryLines(planned, ingredients);
  assert.deepEqual(
    lines.map((l) => [l.item_id, l.amount, l.unit]),
    [
      ["onion", 4, null],
      ["pasta", 1, "box"],
      ["beef", 800, "g"],
      ["cheddar", 1, "pack"],
    ],
  );
});

test("a combined line says which meals it comes from", () => {
  const onion = planGroceryLines(planned, ingredients).find((l) => l.item_id === "onion")!;
  assert.deepEqual(onion.meals, ["Spaghetti", "Beef stew", "Beef tacos"]);
  assert.equal(onion.detail, "Spaghetti, Beef stew, Beef tacos");
  assert.deepEqual(
    onion.parts.map((p) => p.label),
    ["Spaghetti · Mon", "Beef stew ×2 · Tue", "Beef tacos · Wed"],
  );
  const cheddar = planGroceryLines(planned, ingredients).find((l) => l.item_id === "cheddar")!;
  assert.deepEqual(cheddar.meals, ["Beef tacos"]);
});

test("the same dish twice is one meal name, two parts", () => {
  const twice = [...planned, { recipeId: "tacos", name: "Beef tacos", batches: 1, day: "Fri" }];
  const cheddar = planGroceryLines(twice, ingredients).find((l) => l.item_id === "cheddar")!;
  assert.deepEqual(cheddar.meals, ["Beef tacos"]);
  assert.equal(cheddar.parts.length, 2);
  assert.equal(cheddar.amount, 2);
});

test("items already ticked or cleared this week aren't put back", () => {
  const lines = planGroceryLines(planned, ingredients, new Set(["cheddar", "onion"]));
  assert.deepEqual(
    lines.map((l) => l.item_id),
    ["pasta", "beef"],
  );
});

test("backup dishes and nothing planned give no lines", () => {
  assert.deepEqual(planGroceryLines([], ingredients), []);
  assert.deepEqual(planGroceryLines([{ recipeId: "tacos", name: "Beef tacos", batches: 1, day: "Wed", isBackup: true }], ingredients), []);
});

test("mixed units stay as parts with no single amount", () => {
  const lines = planGroceryLines(
    [
      { recipeId: "a", name: "A", batches: 1, day: "Mon" },
      { recipeId: "b", name: "B", batches: 1, day: "Tue" },
    ],
    [
      { recipe_id: "a", item_id: "milk", amount: 1, unit: "cup" },
      { recipe_id: "b", item_id: "milk", amount: 2, unit: null },
    ],
  );
  assert.equal(lines[0].amount, null);
  assert.equal(lines[0].parts.length, 2);
});
