/*
 * The launcher helper's plain rules, kept apart from the parts that start
 * programs and read the touchscreen, so they can be tested anywhere.
 * See README.md in this folder for what the helper is and how to set it up.
 */

/** A program the helper may start, from launcher.config.json. */
export type Program = {
  name: string;
  /** The command and its arguments, e.g. ["flatpak", "run", "io.freetubeapp.FreeTube"]. */
  command: string[];
  /** For programs that hand off to one already running (Steam): how to close it again. */
  close?: string[];
  /** True when the command finishes straight away while the program carries on (Steam). */
  handsOff?: boolean;
};

export type Config = {
  port: number;
  /** The addresses Almanac is opened at on this PC. Only these may ask the helper to do things. */
  almanacOrigins: string[];
  /** The browser used to open web apps, e.g. ["chromium"] or ["google-chrome"]. */
  browser: string[];
  /** Where each web app keeps its own browser profile (signed-in state). */
  profiles: string;
  /** The window class Almanac's own browser window was started with (--class=almanac). */
  almanacWindowClass: string;
  /** Part of the touchscreen's name, or "auto" to find it. */
  touchscreen: string;
  pill: { corner: "bottom-left" | "bottom-right" | "top-left" | "top-right"; hideAfterSeconds: number };
  programs: Record<string, Program>;
};

export const DEFAULTS: Config = {
  port: 4545,
  almanacOrigins: [],
  browser: ["chromium"],
  profiles: "~/almanac-launcher/profiles",
  almanacWindowClass: "almanac",
  touchscreen: "auto",
  pill: { corner: "bottom-left", hideAfterSeconds: 4 },
  programs: {},
};

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CORNERS = ["bottom-left", "bottom-right", "top-left", "top-right"] as const;

/** Reads launcher.config.json. Returns the config, or what's wrong with it. */
export function parseConfig(raw: unknown): { config: Config } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "The config should be a JSON object." };
  const r = raw as Record<string, unknown>;
  const config: Config = { ...DEFAULTS, pill: { ...DEFAULTS.pill }, programs: {} };

  if (r.port !== undefined) {
    if (typeof r.port !== "number" || !Number.isInteger(r.port) || r.port < 1024 || r.port > 65535) return { error: "port should be a number from 1024 to 65535." };
    config.port = r.port;
  }
  if (!Array.isArray(r.almanacOrigins) || r.almanacOrigins.length === 0 || !r.almanacOrigins.every((o) => typeof o === "string" && originOf(o) === o)) {
    return { error: 'almanacOrigins should list where Almanac is opened, like ["http://192.168.2.23:3001"] (no path, no slash at the end).' };
  }
  config.almanacOrigins = r.almanacOrigins as string[];
  if (r.browser !== undefined) {
    if (!isStrings(r.browser)) return { error: 'browser should be a command, like ["chromium"].' };
    config.browser = r.browser;
  }
  for (const key of ["profiles", "almanacWindowClass", "touchscreen"] as const) {
    if (r[key] === undefined) continue;
    if (typeof r[key] !== "string" || !(r[key] as string).trim()) return { error: `${key} should be some text.` };
    config[key] = (r[key] as string).trim();
  }
  if (r.pill !== undefined) {
    const p = r.pill as Record<string, unknown>;
    if (!p || typeof p !== "object") return { error: "pill should be an object." };
    if (p.corner !== undefined) {
      if (!CORNERS.includes(p.corner as Config["pill"]["corner"])) return { error: `pill.corner should be one of ${CORNERS.join(", ")}.` };
      config.pill.corner = p.corner as Config["pill"]["corner"];
    }
    if (p.hideAfterSeconds !== undefined) {
      if (typeof p.hideAfterSeconds !== "number" || p.hideAfterSeconds < 1 || p.hideAfterSeconds > 60) return { error: "pill.hideAfterSeconds should be from 1 to 60." };
      config.pill.hideAfterSeconds = p.hideAfterSeconds;
    }
  }
  if (r.programs !== undefined) {
    if (!r.programs || typeof r.programs !== "object" || Array.isArray(r.programs)) return { error: "programs should be an object." };
    for (const [key, value] of Object.entries(r.programs as Record<string, unknown>)) {
      if (!KEY.test(key)) return { error: `"${key}" can't be a program name: use small letters, numbers and dashes.` };
      const v = value as Record<string, unknown>;
      if (!v || typeof v !== "object") return { error: `programs.${key} should be an object.` };
      if (typeof v.name !== "string" || !v.name.trim()) return { error: `programs.${key} needs a name.` };
      if (!isStrings(v.command)) return { error: `programs.${key}.command should be a command, like ["steam"].` };
      if (v.close !== undefined && !isStrings(v.close)) return { error: `programs.${key}.close should be a command.` };
      config.programs[key] = {
        name: v.name.trim(),
        command: v.command,
        ...(v.close ? { close: v.close as string[] } : {}),
        ...(v.handsOff === true ? { handsOff: true } : {}),
      };
    }
  }
  return { config };
}

/** "http://host:port" from an address, or null. */
export function originOf(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** The headers that let Almanac's page (and only it) talk to the helper. */
export function corsHeaders(origin: string | undefined, config: Config): Record<string, string> {
  if (!origin || !config.almanacOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Chrome asks before a page on the network talks to this computer itself.
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  };
}

/** What to run for a launch request, or what's wrong with it. */
export type Plan = { label: string; command: string[]; close?: string[]; handsOff: boolean };

export function planLaunch(body: unknown, config: Config, home: string): Plan | { error: string } {
  if (!body || typeof body !== "object") return { error: "Nothing to open." };
  const b = body as Record<string, unknown>;
  if (b.kind === "local") {
    const key = typeof b.key === "string" ? b.key : "";
    const program = KEY.test(key) ? config.programs[key] : undefined;
    if (!program) return { error: `The launcher on this PC has no program called "${key}". Add it to launcher.config.json.` };
    return { label: program.name, command: program.command, close: program.close, handsOff: Boolean(program.handsOff) };
  }
  if (b.kind === "web") {
    const url = typeof b.url === "string" ? b.url : "";
    const origin = originOf(url);
    if (!origin) return { error: "That web address doesn't look right." };
    // Each web app keeps its own browser profile, so its sign-in is remembered
    // and closing it never touches Almanac's own window.
    const profile = `${expandHome(config.profiles, home)}/${origin.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9.-]/g, "_")}`;
    const label = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 30) : origin;
    return {
      label,
      command: [...config.browser, `--app=${url}`, "--start-fullscreen", `--user-data-dir=${profile}`, "--class=almanac-app", "--no-first-run", "--no-default-browser-check"],
      handsOff: false,
    };
  }
  return { error: "Nothing to open." };
}

export function expandHome(path: string, home: string): string {
  return path === "~" ? home : path.startsWith("~/") ? `${home}${path.slice(1)}` : path;
}

/*
 * Finding the touchscreen. Linux lists input devices in /proc/bus/input/devices.
 * A touchscreen is a "direct" device (you touch where things are), which the
 * PROP line marks with bit 1. Mice, keyboards and game controllers aren't,
 * so they never wake the pill.
 */
export function touchscreenEvents(devicesText: string, nameHint: string): string[] {
  const found: string[] = [];
  for (const block of devicesText.split(/\n\s*\n/)) {
    const name = /^N: Name="(.*)"$/m.exec(block)?.[1] ?? "";
    const handlers = /^H: Handlers=(.*)$/m.exec(block)?.[1] ?? "";
    const event = /\b(event\d+)\b/.exec(handlers)?.[1];
    if (!event) continue;
    const prop = parseInt(/^B: PROP=([0-9a-f]+)/m.exec(block)?.[1] ?? "0", 16);
    const hasAbs = /^B: ABS=/m.test(block);
    const direct = (prop & 0x2) !== 0 && hasAbs;
    const named = nameHint !== "auto" && name.toLowerCase().includes(nameHint.toLowerCase());
    if (nameHint === "auto" ? direct : named) found.push(`/dev/input/${event}`);
  }
  return found;
}

/*
 * Reading touches. Each input event is 24 bytes on a 64-bit PC: the time
 * (16 bytes), then type, code (2 bytes each) and value (4 bytes). A finger
 * going down is type 1 (a key) code 0x14a (BTN_TOUCH) value 1.
 */
export const EVENT_SIZE = 24;
const EV_KEY = 1;
const BTN_TOUCH = 0x14a;

/** How many fingers went down in these bytes (whole events only). */
export function touchDowns(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let downs = 0;
  for (let at = 0; at + EVENT_SIZE <= bytes.byteLength; at += EVENT_SIZE) {
    const type = view.getUint16(at + 16, true);
    const code = view.getUint16(at + 18, true);
    const value = view.getInt32(at + 20, true);
    if (type === EV_KEY && code === BTN_TOUCH && value === 1) downs += 1;
  }
  return downs;
}
