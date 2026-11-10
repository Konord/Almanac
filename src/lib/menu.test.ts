import { test } from "node:test";
import assert from "node:assert/strict";
import { clampBatches, dishesOfKind, hasOpenDish, lastPicksFrom, mainDish, mealsUnder, menuMealName, partLabel, spotSummary, spotsFrom, startDishes } from "./menu.ts";

const dishes = [
  { id: "pork", name: "Pork chops", icon: "🥩", kind_ids: ["main"] },
  { id: "mash", name: "Mashed potatoes", icon: "🥔", kind_ids: ["starch"] },
  { id: "carrot", name: "Glazed carrots", icon: "🥕", kind_ids: ["veggie"] },
  { id: "corn", name: "Corn", icon: "🌽", kind_ids: ["veggie"] },
  { id: "chili", name: "Chili", icon: "🍲", kind_ids: ["main"], is_backup: true },
];
const byId = new Map(dishes.map((d) => [d.id, d]));
const porkChops = {
  id: "m1",
  name: null,
  icon: null,
  category_ids: ["meat"],
  spots: [
    { position: 0, kind_id: "main", recipe_id: "pork", batches: 1 },
    { position: 1, kind_id: "starch", recipe_id: "mash", batches: 2 },
    { position: 2, kind_id: "veggie", recipe_id: null, batches: 1 },
  ],
};

test("a meal is called after its first dish unless it has a name", () => {
  assert.equal(menuMealName(porkChops, byId), "Pork chops");
  assert.equal(menuMealName({ ...porkChops, name: "Chop night" }, byId), "Chop night");
  assert.equal(spotSummary(porkChops), "2 set, 1 to pick");
  assert.equal(spotSummary({ ...porkChops, spots: porkChops.spots.slice(0, 1) }), "One dish");
});

test("open spots start on last time's pick", () => {
  const picks = lastPicksFrom([
    { menu_meal_id: "m1", spot_position: 2, recipe_id: "carrot" },
    { menu_meal_id: "m1", spot_position: 2, recipe_id: "corn" },
    { menu_meal_id: null, spot_position: 0, recipe_id: "corn" },
  ]);
  const start = startDishes(porkChops, picks);
  assert.deepEqual(start, [
    { kindId: "main", recipeId: "pork", batches: 1, spot: 0 },
    { kindId: "starch", recipeId: "mash", batches: 2, spot: 1 },
    { kindId: "veggie", recipeId: "carrot", batches: 1, spot: 2 },
  ]);
  assert.equal(startDishes(porkChops)[2].recipeId, null);
  assert.equal(hasOpenDish(startDishes(porkChops)), true);
  // A pick whose dish was removed isn't used.
  assert.equal(startDishes(porkChops, picks, new Set(["pork", "mash"]))[2].recipeId, null);
});

test("picking lists only the right dishes", () => {
  assert.deepEqual(dishesOfKind(dishes, "veggie").map((d) => d.id), ["carrot", "corn"]);
  assert.deepEqual(dishesOfKind(dishes, "main").map((d) => d.id), ["pork"]);
  assert.equal(dishesOfKind(dishes, null).length, 4);
  assert.equal(mealsUnder([porkChops], "meat").length, 1);
  assert.equal(mealsUnder([porkChops], "pasta").length, 0);
});

test("batches are whole numbers from 1 to 3", () => {
  assert.equal(clampBatches(0), 1);
  assert.equal(clampBatches(2.4), 2);
  assert.equal(clampBatches(9), 3);
  assert.equal(clampBatches("x"), 1);
});

test("save as meal keeps the dishes and the open spots", () => {
  const spots = spotsFrom([
    { kindId: "main", recipeId: "pork", batches: 1, spot: 0 },
    { kindId: "veggie", recipeId: null, batches: 1, spot: null },
    { kindId: null, recipeId: null, batches: 1, spot: null },
  ]);
  assert.deepEqual(spots, [
    { position: 0, kind_id: "main", recipe_id: "pork", batches: 1 },
    { position: 1, kind_id: "veggie", recipe_id: null, batches: 1 },
  ]);
  assert.equal(mainDish([{ kindId: "x", recipeId: null, batches: 1, spot: 0 }, { kindId: "y", recipeId: "corn", batches: 1, spot: 1 }]), "corn");
  assert.equal(partLabel("Beef tacos", 2, "Tue"), "Beef tacos ×2 · Tue");
});
