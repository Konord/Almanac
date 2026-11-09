import { test } from "node:test";
import assert from "node:assert/strict";
import { amountText, formatAmount, guessAisle, mealSlot, scaleAmount, weekDates, weekStartOf } from "./meals.ts";
import { durations, helperText, NIGHT_BEFORE_MINUTES, spotHelpers } from "./meal-helpers.ts";
import { isoMinutes, parseIngredientLine, parseRecipeHtml, parseRecipeText } from "./recipe-import.ts";

test("weeks start on Sunday or Monday", () => {
  // 2026-11-05 is a Thursday.
  assert.equal(weekStartOf("2026-11-05", 0), "2026-11-01");
  assert.equal(weekStartOf("2026-11-05", 1), "2026-11-02");
  assert.equal(weekStartOf("2026-11-01", 0), "2026-11-01");
  assert.equal(weekStartOf("2026-11-01", 1), "2026-10-26");
  assert.deepEqual(weekDates("2026-11-01").at(-1), "2026-11-07");
});

test("amounts read like a recipe", () => {
  assert.equal(formatAmount(1.5), "1 1/2");
  assert.equal(formatAmount(0.25), "1/4");
  assert.equal(formatAmount(2), "2");
  assert.equal(formatAmount(0.333), "1/3");
  assert.equal(formatAmount(null), "");
  assert.equal(amountText(2, "cup"), "2 cups");
  assert.equal(amountText(1, "cup"), "1 cup");
  assert.equal(amountText(null, null), "");
});

test("scaling for more people", () => {
  assert.equal(scaleAmount(1, 8, 4), 2);
  assert.equal(scaleAmount(1, null, 4), 1);
  assert.equal(scaleAmount(null, 8, 4), null);
});

test("aisles are guessed from the name", () => {
  assert.equal(guessAisle("ground beef"), "Meat");
  assert.equal(guessAisle("Shredded cheese"), "Dairy");
  assert.equal(guessAisle("taco shells"), "Bakery");
  assert.equal(guessAisle("onion"), "Produce");
  assert.equal(guessAisle("frozen peas"), "Frozen");
  assert.equal(guessAisle("taco seasoning"), "Pantry");
  assert.equal(guessAisle("paper towels"), "Other");
});

test("a meal block is the eating; the cook starts earlier", () => {
  assert.deepEqual(mealSlot("18:00", { hands_on_minutes: 25, total_minutes: 40 }), { start: 18 * 60, minutes: 30, cookMinutes: 25 });
  assert.equal(mealSlot("18:00", null).cookMinutes, 30);
});

test("timers are spotted in steps", () => {
  assert.deepEqual(durations("Bake for 45 minutes"), [45]);
  assert.deepEqual(durations("Simmer 10 to 12 minutes"), [10]);
  assert.deepEqual(durations("Roast about 1 hour"), [60]);
  assert.deepEqual(durations("Rest for half an hour"), [30]);
  assert.deepEqual(durations("Cook the pasta minutes before serving"), []);
  const [timer] = spotHelpers("Cover with foil and bake 45 minutes.");
  assert.equal(timer.kind, "timer");
  assert.equal(timer.minutes, 45);
  assert.equal(helperText(timer), "Timer 45 min");
});

test("long steps and night-before steps become heads-ups", () => {
  const slow = spotHelpers("Cook on low for 8 hours.");
  assert.equal(slow[0].kind, "heads_up");
  assert.equal(slow[0].minutes, 480);
  const thaw = spotHelpers("Take the ground beef out of the freezer the night before.");
  assert.equal(thaw[0].kind, "heads_up");
  assert.equal(thaw[0].minutes, NIGHT_BEFORE_MINUTES);
  assert.match(thaw[0].label ?? "", /Take the ground beef/);
  assert.equal(helperText(thaw[0]), "Heads-up · night before");
});

test("oven and doneness temperatures", () => {
  const oven = spotHelpers("Preheat the oven to 375°F.");
  assert.deepEqual(oven.map((h) => [h.kind, h.temperature]), [["oven", 375]]);
  const done = spotHelpers("Roast until the chicken reaches 165°F, about 75 minutes.");
  assert.deepEqual(done.map((h) => [h.kind, h.temperature ?? h.minutes]), [["doneness", 165], ["timer", 75]]);
  // Turned into the household's unit, and guessed when the step doesn't say.
  assert.deepEqual(spotHelpers("Preheat the oven to 375°F.", "celsius").map((h) => h.temperature), [191]);
  assert.deepEqual(spotHelpers("Bake at 180 degrees for 20 minutes.", "celsius").map((h) => [h.kind, h.temperature ?? h.minutes]), [["oven", 180], ["timer", 20]]);
  assert.deepEqual(spotHelpers("Heat the oven to 350 degrees Fahrenheit.", "fahrenheit").map((h) => h.temperature), [350]);
  assert.deepEqual(spotHelpers("Roast at 220° until golden.", "celsius").map((h) => h.temperature), [220]);
  assert.deepEqual(spotHelpers("Cook until it reaches 74°C.", "fahrenheit").map((h) => [h.kind, h.temperature]), [["doneness", 165]]);
  assert.equal(done[0].label, "Chicken");
});

test("ingredient lines are split into amount, unit, item and note", () => {
  assert.deepEqual(parseIngredientLine("2 1/2 cups shredded cheddar, divided"), { amount: 2.5, unit: "cup", name: "shredded cheddar", note: "divided" });
  assert.deepEqual(parseIngredientLine("1 (14 oz) can crushed tomatoes"), { amount: 1, unit: "can", name: "crushed tomatoes", note: "14 oz" });
  assert.deepEqual(parseIngredientLine("½ tsp salt"), { amount: 0.5, unit: "tsp", name: "salt", note: null });
  assert.deepEqual(parseIngredientLine("2 onions, diced"), { amount: 2, unit: null, name: "onions", note: "diced" });
  assert.deepEqual(parseIngredientLine("Salt and pepper to taste"), { amount: null, unit: null, name: "Salt and pepper to taste", note: null });
  assert.equal(parseIngredientLine("1 tablespoon olive oil")?.unit, "tbsp");
  assert.equal(parseIngredientLine("   "), null);
});

test("pasted recipes are split at their headings", () => {
  const r = parseRecipeText(`Beef tacos
Serves 4

Ingredients
1 lb ground beef
1 onion, diced
1 packet taco seasoning

Directions
1. Brown the beef and onion.
2. Stir in the seasoning and simmer 10 minutes.`);
  assert.equal(r.name, "Beef tacos");
  assert.equal(r.serves, 4);
  assert.equal(r.ingredients.length, 3);
  assert.equal(r.ingredients[0].unit, "lb");
  assert.deepEqual(r.steps, ["Brown the beef and onion.", "Stir in the seasoning and simmer 10 minutes."]);
});

test("recipe web pages are read from their schema.org data", () => {
  assert.equal(isoMinutes("PT1H30M"), 90);
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Lasagne &amp; garlic bread","recipeYield":["6","6 servings"],"prepTime":"PT30M","cookTime":"PT1H","recipeIngredient":["1 lb ground beef","2 cups ricotta"],"recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Preheat the oven to 375&deg;F."},{"@type":"HowToStep","text":"Bake 45 minutes."}]}]}]}</script></head></html>`;
  const r = parseRecipeHtml(html, "https://example.com/lasagne");
  assert.ok(r);
  assert.equal(r.name, "Lasagne & garlic bread");
  assert.equal(r.serves, 6);
  assert.equal(r.handsOnMinutes, 30);
  assert.equal(r.totalMinutes, 90);
  assert.equal(r.ingredients[1].name, "ricotta");
  assert.equal(r.steps.length, 2);
  assert.equal(parseRecipeHtml("<html></html>"), null);
});
