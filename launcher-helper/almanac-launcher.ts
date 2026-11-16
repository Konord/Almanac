/*
 * Almanac's launcher helper, for the kitchen PC (Ubuntu). See README.md.
 *
 * A web page can't start programs, so when you tap an app in Almanac's
 * tray, Almanac asks this helper (at http://127.0.0.1:4545, which only this
 * PC can reach). The helper:
 *
 * - opens web apps (Jellyfin, Actual) full screen in their own window,
 *   and starts programs (Steam, FreeTube) from its own list in
 *   launcher.config.json, never anything else;
 * - keeps a small "Almanac" pill hidden in a corner while an app is open.
 *   Only a finger on the touchscreen shows it (a controller, mouse or
 *   keyboard don't), and it hides again after a few seconds. Tapping it
 *   closes the app and brings Almanac back;
 * - brings Almanac back by itself when an app is closed the normal way;
 * - turns the screen off overnight when the art screen saver asks;
 * - sets the monitor's brightness (and a warmer evening colour) over DDC/CI
 *   (ddcutil), for the tray's slider and the day and evening levels.
 *
 * It works on both of Ubuntu's desktops. On Xorg it uses wmctrl, xset and
 * pill.py. On Wayland (Ubuntu 25.10 and newer have nothing else) a program
 * can't do those things, so the small GNOME Shell extension in
 * gnome-extension/ does them when asked over D-Bus (see README.md).
 *
 * Run it with: node almanac-launcher.ts [path/to/launcher.config.json]
 * (Node 22.18 or newer runs TypeScript files directly.)
 */

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  corsHeaders,
  canWarm,
  ddcutilCommand,
  EVENT_SIZE,
  GAIN_VCP,
  WARMTH_GAINS,
  WARMTHS,
  type Warmth,
  fromPercent,
  parseBrightness,
  parseConfig,
  planLaunch,
  toPercent,
  touchDowns,
  touchscreenEvents,
  type Config,
  type Plan,
} from "./lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = process.argv[2] ?? join(here, "launcher.config.json");

function loadConfig(): Config {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error(`Couldn't read ${configPath}: ${(e as Error).message}`);
    console.error("Copy launcher.config.example.json to launcher.config.json and fill it in.");
    process.exit(1);
  }
  const result = parseConfig(raw);
  if ("error" in result) {
    console.error(`${configPath}: ${result.error}`);
    process.exit(1);
  }
  return result.config;
}

const config = loadConfig();
const log = (...parts: unknown[]) => console.log(new Date().toISOString(), ...parts);

/** Ubuntu's Wayland desktop: the GNOME Shell extension does the desktop's part. */
// (A service started by systemd may not see XDG_SESSION_TYPE, but GNOME always shares WAYLAND_DISPLAY.)
const wayland = process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY);
const SHELL = { name: "org.almanac.Shell", path: "/org/almanac/Shell" };

// ---------------------------------------------------------------------------
// Starting and closing apps
// ---------------------------------------------------------------------------

/** The app that's open now, if any. */
let current: { plan: Plan; child: ChildProcess } | null = null;

/** Starts a command in its own process group, so closing it closes everything it started. */
function start(command: string[]): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { detached: true, stdio: "ignore" });
    child.once("spawn", () => resolve(child));
    child.once("error", reject);
  });
}

/** Runs a short command and doesn't wait for it (closing Steam, raising Almanac). */
function fireAndForget(command: string[]) {
  start(command)
    .then((child) => child.unref())
    .catch((e: Error) => log(`Couldn't run ${command[0]}: ${e.message}`));
}

/** Asks the GNOME Shell extension to do something (Wayland only). Arguments are GVariant text: 'a string', true. */
function shell(method: string, ...args: string[]) {
  fireAndForget(["gdbus", "call", "--session", "--dest", SHELL.name, "--object-path", SHELL.path, "--method", `${SHELL.name}.${method}`, ...args]);
}

function bringBackAlmanac() {
  if (wayland) shell("Raise", `'${config.almanacWindowClass}'`);
  // wmctrl raises the window whose class is "almanac" (Almanac's own kiosk window).
  else fireAndForget(["wmctrl", "-x", "-a", config.almanacWindowClass]);
}

function closeCurrent() {
  if (!current) return;
  const { plan, child } = current;
  current = null;
  if (plan.close) fireAndForget(plan.close);
  else if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM"); // the whole group: a browser's helper processes too
    } catch {
      child.kill("SIGTERM");
    }
  }
  log(`Closed ${plan.label}`);
}

async function launch(plan: Plan) {
  closeCurrent();
  const child = await start(plan.command);
  current = { plan, child };
  log(`Opened ${plan.label}`);
  child.once("exit", () => {
    // A program that hands off (Steam) finishes straight away but carries on; it
    // stays "open" until Home. Anything else closing by itself means you're done.
    if (plan.handsOff || current?.child !== child) return;
    current = null;
    pill.hide();
    bringBackAlmanac();
    log(`${plan.label} closed by itself`);
  });
}

function goHome() {
  closeCurrent();
  pill.hide();
  bringBackAlmanac();
}

// ---------------------------------------------------------------------------
// The Almanac pill: pill.py (a tiny GTK window) on Xorg, the extension on Wayland
// ---------------------------------------------------------------------------

type Pill = { start(): void; show(): void; hide(): void };

/** Shows the pill, then hides it again after a few seconds. */
function timedPill(showNow: () => void, hideNow: () => void): Pick<Pill, "show" | "hide"> {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    show() {
      showNow();
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hideNow, config.pill.hideAfterSeconds * 1000);
    },
    hide() {
      if (hideTimer) clearTimeout(hideTimer);
      hideNow();
    },
  };
}

function xorgPill(): Pill {
  let proc: ChildProcess | null = null;
  // If the pill keeps failing to start (no GTK, no display), stop trying after a few goes.
  let failures = 0;

  function ensure(): ChildProcess | null {
    if (proc && proc.exitCode === null) return proc;
    if (failures >= 5) return null;
    const startedAt = Date.now();
    const p = spawn("python3", [join(here, "pill.py"), config.pill.corner], { stdio: ["pipe", "pipe", "inherit"] });
    proc = p;
    p.on("error", (e) => log(`Couldn't start the pill: ${e.message}`));
    p.on("exit", () => {
      if (proc === p) proc = null;
      failures = Date.now() - startedAt > 30_000 ? 0 : failures + 1;
      if (failures >= 5) log("The Almanac pill won't start, so it's switched off. See README.md (Xorg session, GTK).");
    });
    p.stdin?.on("error", () => {}); // writing to a pill that just closed
    createInterface({ input: p.stdout! }).on("line", (line) => {
      if (line.trim() === "home") goHome();
    });
    return p;
  }
  const send = (word: "show" | "hide") => ensure()?.stdin?.write(`${word}\n`);
  return { start: () => void ensure(), ...timedPill(() => send("show"), () => send("hide")) };
}

function waylandPill(): Pill {
  // The extension draws the pill; a tap arrives as its HomeTapped signal,
  // which "gdbus monitor" prints as a line of text.
  function listen() {
    const p = spawn("gdbus", ["monitor", "--session", "--dest", SHELL.name, "--object-path", SHELL.path], { stdio: ["ignore", "pipe", "ignore"] });
    p.on("error", (e) => log(`Couldn't listen for the pill: ${e.message}`));
    createInterface({ input: p.stdout! }).on("line", (line) => {
      if (line.includes(`${SHELL.name}.HomeTapped`)) goHome();
    });
    // If it stops (the desktop restarted), listen again shortly.
    p.on("exit", () => setTimeout(listen, 5000));
  }
  return {
    start: listen,
    ...timedPill(() => shell("ShowPill", `'${config.pill.corner}'`), () => shell("HidePill")),
  };
}

const pill: Pill = wayland ? waylandPill() : xorgPill();

// ---------------------------------------------------------------------------
// The touchscreen: a finger shows the pill while an app is open
// ---------------------------------------------------------------------------

const watching = new Set<string>();

function watchTouchscreens() {
  let devices = "";
  try {
    devices = readFileSync("/proc/bus/input/devices", "utf8");
  } catch {
    return;
  }
  for (const path of touchscreenEvents(devices, config.touchscreen)) {
    if (watching.has(path)) continue;
    watching.add(path);
    let leftover = new Uint8Array(0);
    const stream = createReadStream(path);
    stream.on("data", (chunk) => {
      const bytes = new Uint8Array(leftover.length + chunk.length);
      bytes.set(leftover);
      bytes.set(chunk as Buffer, leftover.length);
      const whole = bytes.length - (bytes.length % EVENT_SIZE);
      leftover = bytes.slice(whole);
      if (touchDowns(bytes.subarray(0, whole)) === 0) return;
      if (screenOff) setScreen(true);
      else if (current) pill.show();
    });
    stream.on("error", (e: NodeJS.ErrnoException) => {
      watching.delete(path);
      log(e.code === "EACCES" ? `Can't read the touchscreen (${path}). Add yourself to the input group: sudo usermod -aG input $USER, then sign out and in.` : `Touchscreen ${path}: ${e.message}`);
    });
    stream.on("close", () => watching.delete(path));
    log(`Watching the touchscreen at ${path}`);
  }
}

// ---------------------------------------------------------------------------
// The screen: off overnight when the art screen saver asks
// ---------------------------------------------------------------------------

let screenOff = false;

function setScreen(on: boolean) {
  screenOff = !on;
  if (wayland) shell("Screen", on ? "true" : "false");
  else fireAndForget(on ? ["xset", "dpms", "force", "on"] : ["sh", "-c", "xset +dpms && xset dpms force off"]);
  log(on ? "Screen on" : "Screen off for the night");
}

// ---------------------------------------------------------------------------
// Brightness: the monitor's own setting, over the video cable (DDC/CI)
// ---------------------------------------------------------------------------

/** The monitor's brightness now (null: not read yet, or this monitor can't). */
let brightness: { raw: number; max: number } | null = null;
/** False once ddcutil has said this monitor can't be set, so Almanac hides the slider. */
let brightnessWorks = true;
/** Whether this monitor has colour presets and a blue level, so the evening can be warmer. */
let warmthWorks = false;

function run(command: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command[0], command.slice(1), { timeout: 15_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split("\n")[0]));
      else resolve(stdout);
    });
  });
}

/*
 * The monitor answers one question at a time, so every ddcutil runs in
 * turn, never two at once.
 */
let line: Promise<unknown> = Promise.resolve();
function ddcutil(command: string[]): Promise<string> {
  const next = line.then(() => run(command));
  line = next.catch(() => {});
  return next;
}

async function readBrightness(): Promise<void> {
  try {
    const found = parseBrightness(await ddcutil(ddcutilCommand(config)));
    if (!found) throw new Error("the monitor didn't say its brightness");
    brightness = found;
    brightnessWorks = true;
  } catch (e) {
    brightness = null;
    brightnessWorks = false;
    log(`Can't read the monitor's brightness (${(e as Error).message}). Is ddcutil installed, and does "ddcutil getvcp 10" work? See README.md.`);
  }
}

/** Once, at start: can this monitor do a warmer colour? */
async function checkWarmth(): Promise<void> {
  try {
    const which = config.brightness.display ? ["--display", String(config.brightness.display)] : [];
    warmthWorks = canWarm(await ddcutil([...config.brightness.command, ...which, "capabilities"]));
    log(warmthWorks ? "The monitor can do a warmer evening colour" : "The monitor can't do a warmer colour from here (no colour presets or blue level)");
  } catch {
    warmthWorks = false;
  }
}

/*
 * Setting it takes ddcutil a moment (a quarter to half a second), and the
 * slider asks many times while a finger drags. So only one runs at a time,
 * and only the newest ask waits: the ones in between are skipped.
 */
let setting = false;
let waiting: number | null = null;

async function setBrightness(raw: number): Promise<void> {
  if (setting) {
    waiting = raw;
    return;
  }
  setting = true;
  try {
    await ddcutil(ddcutilCommand(config, raw));
    if (brightness) brightness = { ...brightness, raw };
  } catch (e) {
    log(`Couldn't set the brightness: ${(e as Error).message}`);
  } finally {
    setting = false;
  }
  if (waiting !== null) {
    const next = waiting;
    waiting = null;
    await setBrightness(next);
  }
}

/** The brightness as Almanac sees it: a percent, or null when this monitor can't. */
const brightnessPercent = () => (brightnessWorks && brightness ? toPercent(brightness.raw, brightness.max) : null);

/**
 * The colour: "none" is the monitor's normal preset (6500K); a warmth is
 * the User preset with less blue (and a little less green).
 */
let warmthNow: Warmth | null = null;

async function setWarmth(warmth: Warmth): Promise<void> {
  if (warmth === "none") {
    await ddcutil(ddcutilCommand(config, config.colour.normalPreset, "14"));
  } else {
    await ddcutil(ddcutilCommand(config, config.colour.userPreset, "14"));
    const gains = WARMTH_GAINS[warmth];
    for (const colour of ["red", "green", "blue"] as const) {
      const vcp = GAIN_VCP[colour];
      const now = parseBrightness(await ddcutil(ddcutilCommand(config, undefined, vcp)), vcp);
      if (!now) throw new Error(`the monitor didn't say its ${colour} level`);
      await ddcutil(ddcutilCommand(config, Math.round(now.max * gains[colour]), vcp));
    }
  }
  warmthNow = warmth;
  log(warmth === "none" ? "Colour back to normal" : `Colour warmer (${warmth})`);
}

// ---------------------------------------------------------------------------
// Talking to Almanac
// ---------------------------------------------------------------------------

function send(res: ServerResponse, status: number, headers: Record<string, string>, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { ...headers, "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json" });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let text = "";
    req.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
      if (text.length > 8192) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const cors = corsHeaders(origin, config);
  const allowed = Boolean(cors["Access-Control-Allow-Origin"]);
  const path = (req.url ?? "/").split("?")[0];

  // Only Almanac's own page may ask; other websites in a browser get nothing.
  if (origin && !allowed) return send(res, 403, {}, "Not from Almanac.");
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  if (req.method === "GET" && path === "/hello") {
    const programs = Object.entries(config.programs).map(([key, p]) => ({ key, name: p.name }));
    // version 2: brightness (a percent, or null when this monitor can't be set), and whether it can be warmer.
    return send(res, 200, cors, { ok: true, version: 2, programs, open: current?.plan.label ?? null, brightness: brightnessPercent(), warmth: warmthWorks ? warmthNow ?? "unknown" : null });
  }
  // Anything that does something must come from Almanac's page.
  if (req.method === "POST" && !allowed) return send(res, 403, {}, "Not from Almanac.");
  if (req.method === "POST" && path === "/launch") {
    const plan = planLaunch(await readBody(req), config, homedir());
    if ("error" in plan) return send(res, 400, cors, plan.error);
    try {
      await launch(plan);
      return send(res, 200, cors, { ok: true });
    } catch (e) {
      return send(res, 500, cors, `Couldn't open ${plan.label}: ${(e as Error).message}`);
    }
  }
  if (req.method === "POST" && path === "/screen") {
    // The art screen saver's "Screen off" overnight: the monitor sleeps (DPMS)
    // and wakes when touched or when Almanac asks. Never while an app is open.
    const body = await readBody(req);
    const on = Boolean(body && typeof body === "object" && (body as { on?: unknown }).on === true);
    if (!on && current) return send(res, 409, cors, "An app is open.");
    setScreen(on);
    return send(res, 200, cors, { ok: true });
  }
  if (req.method === "GET" && path === "/brightness") {
    // Read it fresh (someone may have used the monitor's own buttons), unless it's being set right now.
    if (!setting) await readBrightness();
    return send(res, 200, cors, { ok: true, brightness: brightnessPercent() });
  }
  if (req.method === "POST" && path === "/brightness") {
    // The tray's slider: { percent: 0 to 100 }. Answers straight away; the monitor follows a moment later.
    if (!brightness) await readBrightness();
    if (!brightness) return send(res, 409, cors, "This monitor's brightness can't be set from here.");
    const body = await readBody(req);
    const raw = fromPercent(body && typeof body === "object" ? (body as { percent?: unknown }).percent : undefined, brightness.max);
    if (raw === null) return send(res, 400, cors, "Brightness should be a percent.");
    void setBrightness(raw);
    return send(res, 200, cors, { ok: true, brightness: toPercent(raw, brightness.max) });
  }
  if (req.method === "POST" && path === "/colour") {
    // The evening's warmer colour: { warmth: "none" | "weak" | "medium" | "strong" }.
    if (!warmthWorks) return send(res, 409, cors, "This monitor's colour can't be set from here.");
    const body = await readBody(req);
    const warmth = body && typeof body === "object" ? (body as { warmth?: unknown }).warmth : undefined;
    if (!WARMTHS.includes(warmth as Warmth)) return send(res, 400, cors, "Warmth should be none, weak, medium or strong.");
    try {
      await setWarmth(warmth as Warmth);
      return send(res, 200, cors, { ok: true });
    } catch (e) {
      log(`Couldn't set the colour: ${(e as Error).message}`);
      return send(res, 500, cors, `Couldn't set the colour: ${(e as Error).message}`);
    }
  }
  if (req.method === "POST" && path === "/home") {
    goHome();
    return send(res, 200, cors, { ok: true });
  }
  send(res, 404, cors, "Not here.");
});

// Only this PC can reach it (127.0.0.1), never the rest of the network.
server.listen(config.port, "127.0.0.1", () => {
  log(`Almanac launcher listening on http://127.0.0.1:${config.port} for ${config.almanacOrigins.join(", ")} (${wayland ? "Wayland: using the GNOME Shell extension" : "Xorg"})`);
  pill.start();
  watchTouchscreens();
  void readBrightness().then(() => {
    if (!brightness) return;
    log(`Monitor brightness is ${brightnessPercent()}%`);
    void checkWarmth();
  });
  // A touchscreen plugged in later (or after a sleep) is picked up too.
  setInterval(watchTouchscreens, 30_000);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    closeCurrent();
    process.exit(0);
  });
}
