import { test } from "node:test";
import assert from "node:assert/strict";
import { corsHeaders, parseConfig, planLaunch, touchDowns, touchscreenEvents, type Config } from "./lib.ts";

const good = {
  almanacOrigins: ["http://192.168.2.23:3001"],
  programs: {
    steam: { name: "Steam", command: ["steam", "steam://open/bigpicture"], close: ["steam", "steam://close/bigpicture"], handsOff: true },
    freetube: { name: "FreeTube", command: ["flatpak", "run", "io.freetubeapp.FreeTube"] },
  },
};
const config = (): Config => {
  const r = parseConfig(good);
  assert.ok("config" in r);
  return r.config;
};

test("a good config reads, with defaults filled in", () => {
  const c = config();
  assert.equal(c.port, 4545);
  assert.deepEqual(c.browser, ["chromium"]);
  assert.equal(c.programs.steam.handsOff, true);
  assert.equal(c.pill.corner, "bottom-left");
});

test("a config without Almanac's address, or with a bad program, is refused", () => {
  assert.ok("error" in parseConfig({}));
  assert.ok("error" in parseConfig({ almanacOrigins: ["http://192.168.2.23:3001/"] }));
  assert.ok("error" in parseConfig({ ...good, programs: { "Bad Name": { name: "x", command: ["x"] } } }));
  assert.ok("error" in parseConfig({ ...good, programs: { ok: { name: "x", command: [] } } }));
  assert.ok("error" in parseConfig({ ...good, pill: { corner: "middle" } }));
});

test("only Almanac's own page gets the sharing headers", () => {
  const c = config();
  assert.equal(corsHeaders("http://192.168.2.23:3001", c)["Access-Control-Allow-Origin"], "http://192.168.2.23:3001");
  assert.equal(corsHeaders("http://192.168.2.23:3001", c)["Access-Control-Allow-Private-Network"], "true");
  assert.deepEqual(corsHeaders("https://evil.example", c), {});
  assert.deepEqual(corsHeaders(undefined, c), {});
});

test("programs only come from the helper's own list", () => {
  const c = config();
  const steam = planLaunch({ kind: "local", key: "steam" }, c, "/home/connor");
  assert.ok(!("error" in steam));
  assert.deepEqual(steam.command, ["steam", "steam://open/bigpicture"]);
  assert.equal(steam.handsOff, true);
  assert.ok("error" in planLaunch({ kind: "local", key: "rm" }, c, "/home/connor"));
  assert.ok("error" in planLaunch({ kind: "local", key: "../steam" }, c, "/home/connor"));
  assert.ok("error" in planLaunch({ kind: "shell", command: "rm -rf /" }, c, "/home/connor"));
});

test("web apps open full screen with their own browser profile", () => {
  const plan = planLaunch({ kind: "web", url: "http://192.168.2.10:8096/", name: "Jellyfin" }, config(), "/home/connor");
  assert.ok(!("error" in plan));
  assert.equal(plan.label, "Jellyfin");
  assert.deepEqual(plan.command.slice(0, 3), ["chromium", "--app=http://192.168.2.10:8096/", "--start-fullscreen"]);
  assert.ok(plan.command.includes("--user-data-dir=/home/connor/almanac-launcher/profiles/192.168.2.10_8096"));
  assert.ok("error" in planLaunch({ kind: "web", url: "file:///etc/passwd" }, config(), "/home/connor"));
  assert.ok("error" in planLaunch({ kind: "web", url: "javascript:alert(1)" }, config(), "/home/connor"));
});

const DEVICES = `I: Bus=0003 Vendor=222a Product=0001 Version=0110
N: Name="ILITEK ILITEK-TP"
H: Handlers=mouse2 event7
B: PROP=2
B: EV=1b
B: ABS=3273800000000003

I: Bus=0003 Vendor=045e Product=028e Version=0114
N: Name="Microsoft X-Box 360 pad"
H: Handlers=event9 js0
B: PROP=0
B: EV=20000b
B: ABS=3003f

I: Bus=0003 Vendor=046d Product=c52b Version=0111
N: Name="Logitech USB Receiver Mouse"
H: Handlers=mouse0 event4
B: PROP=0
B: EV=17
`;

test("the touchscreen is found, and the controller and mouse aren't", () => {
  assert.deepEqual(touchscreenEvents(DEVICES, "auto"), ["/dev/input/event7"]);
  assert.deepEqual(touchscreenEvents(DEVICES, "ilitek"), ["/dev/input/event7"]);
  assert.deepEqual(touchscreenEvents(DEVICES, "nothing like it"), []);
});

function event(type: number, code: number, value: number): Uint8Array {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  view.setUint16(16, type, true);
  view.setUint16(18, code, true);
  view.setInt32(20, value, true);
  return bytes;
}

test("a finger going down is counted; moving and lifting aren't", () => {
  const stream = new Uint8Array(24 * 4);
  stream.set(event(1, 0x14a, 1), 0); // finger down
  stream.set(event(3, 0x35, 900), 24); // moving
  stream.set(event(0, 0, 0), 48); // end of a batch
  stream.set(event(1, 0x14a, 0), 72); // finger up
  assert.equal(touchDowns(stream), 1);
  assert.equal(touchDowns(event(1, 0x130, 1)), 0); // a controller's A button
});
