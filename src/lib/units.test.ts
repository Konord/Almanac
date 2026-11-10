import { test } from "node:test";
import assert from "node:assert/strict";
import { addUp, conversions, measureText, needText, normalUnit } from "./units.ts";

test("units are spelled one way", () => {
  assert.equal(normalUnit("Tablespoons"), "tbsp");
  assert.equal(normalUnit("T"), "tbsp");
  assert.equal(normalUnit("t"), "tsp");
  assert.equal(normalUnit("cups"), "cup");
  assert.equal(normalUnit("cloves"), "clove");
  assert.equal(normalUnit("lbs."), "lb");
  assert.equal(normalUnit(""), null);
  assert.equal(normalUnit("each"), null);
});

test("a Canadian cup is 250 ml", () => {
  const c = conversions(1, "cup");
  assert.equal(c[0].text, "250 ml");
  assert.equal(c[1].text, "16 tbsp");
  assert.deepEqual(conversions(3, "clove"), []);
  assert.equal(conversions(1, "cup", "us")[0].text, "240 ml");
  assert.equal(conversions(1, "lb")[0].text, "450 g");
});

test("the same ingredient adds up across meals", () => {
  assert.deepEqual(addUp([{ amount: 2, unit: "cup" }, { amount: 1, unit: "cups" }]), [{ amount: 3, unit: "cup" }]);
  assert.deepEqual(addUp([{ amount: 1, unit: "cup" }, { amount: 250, unit: "ml" }, { amount: 0.5, unit: "cup" }]), [{ amount: 630, unit: "ml" }]);
  assert.deepEqual(addUp([{ amount: 2, unit: "lb" }, { amount: 500, unit: "g" }]), [{ amount: 1.41, unit: "kg" }]);
  assert.deepEqual(addUp([{ amount: 2, unit: null }, { amount: 1, unit: null }]), [{ amount: 3, unit: null }]);
  assert.deepEqual(addUp([{ amount: 1, unit: "cup" }, { amount: 2, unit: null }]), [
    { amount: 2, unit: null },
    { amount: 1, unit: "cup" },
  ]);
  assert.deepEqual(addUp([{ amount: null, unit: null }]), [{ amount: null, unit: null }]);
});

test("grocery lines say what's needed", () => {
  assert.equal(needText([{ amount: 3, unit: null }]), "3");
  assert.equal(needText([{ amount: 750, unit: "ml" }]), "750 ml needed for meals");
  assert.equal(needText([{ amount: 2, unit: null }, { amount: 1, unit: "cup" }]), "2 + 1 cup needed for meals");
  assert.equal(needText([{ amount: 6, unit: "clove" }]), "6 cloves");
  assert.equal(needText([{ amount: null, unit: null }]), "");
  assert.equal(measureText(1.5, "cup"), "1½ cups");
});
