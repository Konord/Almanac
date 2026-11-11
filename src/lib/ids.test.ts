import { test } from "node:test";
import assert from "node:assert/strict";
import { newId } from "./ids.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("newId makes a uuid", () => {
  assert.match(newId(), UUID);
});

test("newId still works when randomUUID is missing (plain http page)", () => {
  const real = globalThis.crypto.randomUUID;
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const a = newId();
    const b = newId();
    assert.match(a, UUID);
    assert.notEqual(a, b);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: real, configurable: true });
  }
});
