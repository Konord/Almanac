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
  /**
   * The monitor's brightness, set over DDC/CI with ddcutil (2026-11-16).
   * display: which monitor, as `ddcutil detect` numbers them (null: the only one).
   */
  brightness: { command: string[]; display: number | null };
  /**
   * The evening's warmer colour (2026-11-16): the colour preset (VCP 14)
   * for normal colour, and the one whose red, green and blue levels can be
   * changed ("User 1" on most monitors). Hex, as `ddcutil capabilities` lists them.
   */
  colour: { normalPreset: string; userPreset: string };
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
  brightness: { command: ["ddcutil"], display: null },
  colour: { normalPreset: "05", userPreset: "0b" },
};

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CORNERS = ["bottom-left", "bottom-right", "top-left", "top-right"] as const;

/** Reads launcher.config.json. Returns the config, or what's wrong with it. */
export function parseConfig(raw: unknown): { config: Config } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "The config should be a JSON object." };
  const r = raw as Record<string, unknown>;
  const config: Config = { ...DEFAULTS, pill: { ...DEFAULTS.pill }, programs: {}, brightness: { ...DEFAULTS.brightness }, colour: { ...DEFAULTS.colour } };

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
  if (r.brightness !== undefined) {
    const b = r.brightness as Record<string, unknown>;
    if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "brightness should be an object." };
    if (b.command !== undefined) {
      if (!isStrings(b.command)) return { error: 'brightness.command should be a command, like ["ddcutil"].' };
      config.brightness.command = b.command;
    }
    if (b.display !== undefined && b.display !== null) {
      if (typeof b.display !== "number" || !Number.isInteger(b.display) || b.display < 1 || b.display > 9) return { error: "brightness.display should be a monitor number from `ddcutil detect`, like 1." };
      config.brightness.display = b.display;
    }
  }
  if (r.colour !== undefined) {
    const c = r.colour as Record<string, unknown>;
    if (!c || typeof c !== "object" || Array.isArray(c)) return { error: "colour should be an object." };
    for (const key of ["normalPreset", "userPreset"] as const) {
      if (c[key] === undefined) continue;
      if (typeof c[key] !== "string" || !HEX_BYTE.test(c[key] as string)) return { error: `colour.${key} should be a value from \`ddcutil capabilities\` (Feature: 14), like "05".` };
      config.colour[key] = (c[key] as string).toLowerCase();
    }
  }
  return { config };
}

const HEX_BYTE = /^[0-9a-fA-F]{2}$/;

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

/*
 * The monitor's brightness (2026-11-16). Monitors that speak DDC/CI take
 * settings over the video cable, the same ones as the buttons on the
 * monitor's own menu. ddcutil (sudo apt install ddcutil) does the talking.
 * Brightness is setting (VCP code) 10.
 */
export const BRIGHTNESS_VCP = "10";

/** The ddcutil command to read (value undefined) or set one of the monitor's settings (brightness unless named). */
export function ddcutilCommand(config: Config, raw?: number | string, vcp: string = BRIGHTNESS_VCP): string[] {
  const which = config.brightness.display ? ["--display", String(config.brightness.display)] : [];
  // --brief: one line that's easy to read back. --noverify: don't read it back after setting (twice as fast).
  // A preset is given in hex ("0b"), as `ddcutil capabilities` lists it; it's sent as a plain number.
  const value = typeof raw === "string" ? String(parseInt(raw, 16)) : String(raw);
  return raw === undefined
    ? [...config.brightness.command, ...which, "--brief", "getvcp", vcp]
    : [...config.brightness.command, ...which, "--noverify", "setvcp", vcp, value];
}

/** Reads `ddcutil --brief getvcp 10` ("VCP 10 C 50 100": now 50 of 100), or another setting's line. */
export function parseBrightness(text: string, vcp: string = BRIGHTNESS_VCP): { raw: number; max: number } | null {
  const m = new RegExp(`^VCP\\s+${vcp}\\s+C\\s+(\\d+)\\s+(\\d+)\\s*$`, "im").exec(text);
  if (!m) return null;
  const raw = Number(m[1]);
  const max = Number(m[2]);
  return max > 0 && raw <= max ? { raw, max } : null;
}

/** The monitor's own number as a percent (most monitors count to 100 anyway). */
export const toPercent = (raw: number, max: number) => Math.round((raw / max) * 100);

/** A percent asked for by Almanac, as the monitor's own number, or null if it isn't one. */
export function fromPercent(asked: unknown, max: number): number | null {
  if (typeof asked !== "number" || !Number.isFinite(asked)) return null;
  const percent = Math.min(100, Math.max(0, asked));
  return Math.round((percent / 100) * max);
}

/*
 * A warmer colour in the evening (2026-11-16). Few monitors let a computer
 * reach their own "low blue" mode, but most let it pick a colour preset
 * (VCP 14) and change the red, green and blue levels (16, 18, 1A) of the
 * "User" preset. Warmer means less blue, and a little less green.
 */
export type Warmth = "none" | "weak" | "medium" | "strong";
export const WARMTHS: readonly Warmth[] = ["none", "weak", "medium", "strong"];
export const GAIN_VCP = { red: "16", green: "18", blue: "1A" } as const;

/** Each colour's level as a share of its most, for each warmth. */
export const WARMTH_GAINS: Record<Exclude<Warmth, "none">, { red: number; green: number; blue: number }> = {
  weak: { red: 1, green: 0.95, blue: 0.85 },
  medium: { red: 1, green: 0.9, blue: 0.7 },
  strong: { red: 1, green: 0.82, blue: 0.55 },
};

/** Whether `ddcutil capabilities` lists the colour presets and the blue level, so warmth can work. */
export function canWarm(capabilities: string): boolean {
  return /Feature:\s*14\b/i.test(capabilities) && /Feature:\s*1A\b/i.test(capabilities);
}
