import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCheck, appsProblem, checkDue, cleanAddress, downText, upState, type AppDraft } from "./launcher.ts";

const now = new Date("2026-11-11T14:40:00Z");

test("one failed check isn't down yet; two in a row is, dated from the first", () => {
  const one = afterCheck({ failures: 0, downSince: null }, false, now);
  assert.deepEqual(one, { failures: 1, downSince: null });
  const two = afterCheck(one, false, new Date(now.getTime() + 60_000));
  assert.equal(two.failures, 2);
  assert.equal(two.downSince, now.toISOString());
  // Staying down keeps the first time.
  const three = afterCheck(two, false, new Date(now.getTime() + 120_000));
  assert.equal(three.downSince, now.toISOString());
  // Answering clears it.
  assert.deepEqual(afterCheck(three, true, now), { failures: 0, downSince: null });
});

test("checks closer than 50 seconds reuse the last one", () => {
  assert.equal(checkDue(null, now), true);
  assert.equal(checkDue(new Date(now.getTime() - 20_000).toISOString(), now), false);
  assert.equal(checkDue(new Date(now.getTime() - 55_000).toISOString(), now), true);
});

test("only checked web apps get an up or down state", () => {
  const checked = now.toISOString();
  assert.equal(upState({ kind: "web", checkUp: true, failures: 0, checkedAt: checked }), true);
  assert.equal(upState({ kind: "web", checkUp: true, failures: 1, checkedAt: checked }), true);
  assert.equal(upState({ kind: "web", checkUp: true, failures: 2, checkedAt: checked }), false);
  assert.equal(upState({ kind: "web", checkUp: false, failures: 5, checkedAt: checked }), null);
  assert.equal(upState({ kind: "web", checkUp: true, failures: 0, checkedAt: null }), null);
  assert.equal(upState({ kind: "local", checkUp: true, failures: 0, checkedAt: checked }), null);
});

test("web addresses are tidied, and http:// is added when left off", () => {
  assert.equal(cleanAddress("192.168.2.10:8096"), "http://192.168.2.10:8096/");
  assert.equal(cleanAddress(" https://budget.home/ "), "https://budget.home/");
  assert.equal(cleanAddress(""), null);
  assert.equal(cleanAddress("javascript:alert(1)"), null);
  assert.equal(cleanAddress("ftp://files.home"), null);
});

const app = (changes: Partial<AppDraft>): AppDraft => ({
  id: "new-1", name: "Jellyfin", icon: "🍿", colour: "purple", kind: "web", address: "192.168.2.10:8096", localKey: "", checkUp: true, removed: false, ...changes,
});

test("apps need a name and somewhere to go", () => {
  assert.equal(appsProblem([app({})]), null);
  assert.match(appsProblem([app({ name: " " })]) ?? "", /needs a name/);
  assert.match(appsProblem([app({ address: "" })]) ?? "", /web address/);
  assert.match(appsProblem([app({ kind: "local", localKey: "" })]) ?? "", /Pick which program/);
  assert.equal(appsProblem([app({ kind: "local", localKey: "steam" })]), null);
  assert.equal(appsProblem([app({ name: "", removed: true })]), null);
  assert.match(appsProblem(Array.from({ length: 9 }, (_, i) => app({ id: `new-${i}` }))) ?? "", /holds 8/);
});

test("down time reads like a clock, or the weekday for an older one", () => {
  assert.equal(downText("2026-11-11T14:40:00Z", now, "en-CA", "America/Toronto"), "Down since 9:40 am");
  assert.equal(downText("2026-11-09T14:40:00Z", now, "en-CA", "America/Toronto"), "Down since Monday");
});
