import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SOUNDS, inQuietHours, parseSounds, play, soundAllowed } from "./sounds.ts";

const at = (h: number, m = 0) => h * 60 + m;

test("quiet hours that run past midnight", () => {
  const s = { quietFrom: "21:00", quietTo: "07:00" };
  assert.equal(inQuietHours(s, at(22)), true);
  assert.equal(inQuietHours(s, at(3)), true);
  assert.equal(inQuietHours(s, at(7)), false);
  assert.equal(inQuietHours(s, at(12)), false);
  assert.equal(inQuietHours(s, at(21)), true);
});

test("quiet hours within one day, and none at all", () => {
  assert.equal(inQuietHours({ quietFrom: "13:00", quietTo: "15:00" }, at(14)), true);
  assert.equal(inQuietHours({ quietFrom: "13:00", quietTo: "15:00" }, at(16)), false);
  assert.equal(inQuietHours({ quietFrom: "09:00", quietTo: "09:00" }, at(9)), false);
});

test("muted means never", () => {
  assert.equal(soundAllowed({ ...DEFAULT_SOUNDS, muted: true }, at(12)), false);
  assert.equal(play("tick", { ...DEFAULT_SOUNDS, muted: true }, at(12)), false);
  assert.equal(play("tick", DEFAULT_SOUNDS, at(12)), true);
  assert.equal(play("tick", DEFAULT_SOUNDS, at(23)), false);
});

test("parseSounds fills gaps and ignores bad values", () => {
  assert.deepEqual(parseSounds(null), DEFAULT_SOUNDS);
  assert.deepEqual(parseSounds({ muted: true, quietFrom: "25:00", quietTo: "06:30", output: "bluetooth" }), {
    muted: true,
    quietFrom: "21:00",
    quietTo: "06:30",
    output: "screen",
  });
});
