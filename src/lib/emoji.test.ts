import { test } from "node:test";
import assert from "node:assert/strict";
import { emojiImage, eventEmoji } from "./emoji.ts";

test("emoji with and without the emoji marker find the same picture", () => {
  assert.equal(emojiImage("🛏️"), "/emoji/bed.png");
  assert.equal(emojiImage("🛏"), "/emoji/bed.png");
  assert.equal(emojiImage("⚖️"), "/emoji/balance_scale.png");
});

test("an emoji without a bundled picture has no image", () => {
  assert.equal(emojiImage("🦒"), null);
  assert.equal(emojiImage(null), null);
  assert.equal(emojiImage(""), null);
});

test("an event's own picture wins over a guess", () => {
  assert.equal(eventEmoji("🍕", "Dentist"), "🍕");
});

test("a picture is guessed from the title", () => {
  assert.equal(eventEmoji(null, "Dentist for Sam"), "🦷");
  assert.equal(eventEmoji("", "Court"), "⚖️");
  assert.equal(eventEmoji(null, "Grandpa's birthday"), "🎂");
  assert.equal(eventEmoji(null, "Hockey game"), "🏒");
  assert.equal(eventEmoji(null, "Something else"), "📅");
});

test("every emoji the starter routines use has a picture", () => {
  for (const e of ["🍎", "🍽️", "🎒", "🎮", "👕", "💇", "📖", "📚", "😴", "🚽", "🛁", "🛏️", "🥞", "🥣", "🧥", "🧸", "🧺", "🧼", "🧽", "🪥", "🥪", "💧", "🔒", "📅"]) {
    assert.ok(emojiImage(e), `missing picture for ${e}`);
  }
});
