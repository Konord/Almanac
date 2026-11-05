import { test } from "node:test";
import assert from "node:assert/strict";
import { emojiImage, emojiPage, eventEmoji, searchEmoji, suggestEmoji } from "./emoji.ts";

test("emoji with and without the emoji marker find the same picture", () => {
  assert.equal(emojiImage("🛏️"), "/emoji/bed.png");
  assert.equal(emojiImage("🛏"), "/emoji/bed.png");
  assert.equal(emojiImage("⚖️"), "/emoji/balance_scale.png");
});

test("an emoji without a bundled picture has no image", () => {
  assert.equal(emojiImage("💾"), null);
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

test("suggests the guessed picture first, with why", () => {
  const s = suggestEmoji("Dentist for Ava");
  assert.equal(s[0].emoji, "🦷");
  assert.equal(s[0].why, '"dentist"');
  assert.equal(s.length, 6);
});

test("suggests everyday pictures for an unknown title", () => {
  const s = suggestEmoji("Zorblax");
  assert.equal(s[0].emoji, "📅");
  assert.ok(s.every((c) => c.why === "everyday"));
});

test("finds pictures by name or extra words", () => {
  assert.equal(searchEmoji("hock")[0].emoji, "🏒");
  assert.ok(searchEmoji("wfh").some((c) => c.emoji === "🏡"));
  assert.ok(searchEmoji("laundry").some((c) => c.emoji === "🧺"));
  assert.equal(searchEmoji("zzzz").length, 0);
});

test("the big set: searches standard names and keywords, best first", () => {
  assert.equal(searchEmoji("cake")[0].emoji, "🎂");
  assert.equal(searchEmoji("church")[0].emoji, "⛪");
  assert.ok(searchEmoji("full moon").some((c) => c.emoji === "🌕"));
  assert.ok(!searchEmoji("hock").some((c) => c.name === "shaking face"));
  assert.ok(searchEmoji("thunder").length > 0);
});

test("the big set leaves out what Connor didn't want", () => {
  for (const e of ["🕐", "🗾", "💾", "📼", "💶", "♈", "⬆", "🔟", "🈳", "🚾", "🇨🇦", "👨‍🍳"]) {
    assert.equal(emojiImage(e), null, `${e} should be left out`);
  }
  for (const e of ["⛪", "🪦", "🍺", "🗡", "🔴", "🌕", "🧑‍🍳", "🏁"]) assert.ok(emojiImage(e), `${e} should be in`);
});

test("browsing a tab goes page by page", () => {
  const first = emojiPage(0, 0, 30);
  assert.equal(first.choices.length, 30);
  assert.equal(first.choices[0].emoji, "😀");
  assert.ok(first.pages > 1);
  assert.equal(emojiPage(0, 999, 30).choices.length > 0, true);
});
