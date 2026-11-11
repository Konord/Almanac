/*
 * Making ids in the browser.
 *
 * crypto.randomUUID() only works on "secure" pages (https or localhost).
 * Almanac is opened over plain http on the home network
 * (http://192.168.2.23:3001), where the browser hides it and tapping
 * anything that needs a new id crashed. newId() uses it when it's there
 * and otherwise builds the same kind of id from crypto.getRandomValues(),
 * which works on any page, or Math.random() as a last resort.
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
