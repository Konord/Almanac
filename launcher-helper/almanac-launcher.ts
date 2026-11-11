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
 * - brings Almanac back by itself when an app is closed the normal way.
 *
 * Run it with: node almanac-launcher.ts [path/to/launcher.config.json]
 * (Node 22.18 or newer runs TypeScript files directly.)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { corsHeaders, EVENT_SIZE, parseConfig, planLaunch, touchDowns, touchscreenEvents, type Config, type Plan } from "./lib.ts";

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

function bringBackAlmanac() {
  // wmctrl raises the window whose class is "almanac" (Almanac's own kiosk window).
  fireAndForget(["wmctrl", "-x", "-a", config.almanacWindowClass]);
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
// The Almanac pill (drawn by pill.py, a tiny GTK window)
// ---------------------------------------------------------------------------

const pill = (() => {
  let proc: ChildProcess | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
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

  return {
    start: ensure,
    show() {
      send("show");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => send("hide"), config.pill.hideAfterSeconds * 1000);
    },
    hide() {
      if (hideTimer) clearTimeout(hideTimer);
      send("hide");
    },
  };
})();

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
      if (current && touchDowns(bytes.subarray(0, whole)) > 0) pill.show();
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
    return send(res, 200, cors, { ok: true, version: 1, programs, open: current?.plan.label ?? null });
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
  if (req.method === "POST" && path === "/home") {
    goHome();
    return send(res, 200, cors, { ok: true });
  }
  send(res, 404, cors, "Not here.");
});

// Only this PC can reach it (127.0.0.1), never the rest of the network.
server.listen(config.port, "127.0.0.1", () => {
  log(`Almanac launcher listening on http://127.0.0.1:${config.port} for ${config.almanacOrigins.join(", ")}`);
  pill.start();
  watchTouchscreens();
  // A touchscreen plugged in later (or after a sleep) is picked up too.
  setInterval(watchTouchscreens, 30_000);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    closeCurrent();
    process.exit(0);
  });
}
