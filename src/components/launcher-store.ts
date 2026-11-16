"use client";

import { useEffect, useSyncExternalStore } from "react";
import { loadLauncher } from "@/app/apps/actions";
import { CHECK_EVERY_MS, HELPER_URL, type LauncherApp } from "@/lib/launcher";

/*
 * What this screen knows about the app launcher, shared by the tray and
 * the Today panel's heads-up.
 *
 * First it looks for the launcher helper on this computer. Only the
 * kitchen PC runs it, so on the iPad or a phone the look fails and
 * nothing else happens: no apps, no checks, no heads-ups. On the kitchen
 * PC it then asks Almanac for the apps (which checks them) once a minute.
 */

/** A program the helper may start, from its own list. */
export type HelperProgram = { key: string; name: string };

type State = {
  /** Null until the first look; false when there's no helper here. */
  /** brightness: the monitor's brightness in percent, or null when the helper can't set it (or is older). */
  helper: false | null | { programs: HelperProgram[]; open: string | null; brightness: number | null };
  apps: LauncherApp[];
  locale: string;
  timeZone: string;
  /** A short message after a launch that didn't work. */
  problem: string | null;
};

/** What the page is drawn with on the server and while it wakes up: no apps yet. */
const FIRST: State = { helper: null, apps: [], locale: "en-CA", timeZone: "America/Toronto", problem: null };
let state: State = FIRST;
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function set(changes: Partial<State>) {
  state = { ...state, ...changes };
  listeners.forEach((l) => l());
}

/** Asks the helper who it is, giving up quickly when there's no helper. */
async function findHelper(): Promise<State["helper"]> {
  try {
    const res = await fetch(`${HELPER_URL}/hello`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    const programs =
      body && typeof body === "object" && Array.isArray((body as { programs?: unknown }).programs)
        ? ((body as { programs: unknown[] }).programs.filter(
            (p): p is HelperProgram => !!p && typeof (p as HelperProgram).key === "string" && typeof (p as HelperProgram).name === "string",
          ) as HelperProgram[])
        : [];
    const open = body && typeof body === "object" && typeof (body as { open?: unknown }).open === "string" ? (body as { open: string }).open : null;
    const b = body && typeof body === "object" ? (body as { brightness?: unknown }).brightness : null;
    const brightness = typeof b === "number" && b >= 0 && b <= 100 ? b : null;
    return { programs, open, brightness };
  } catch {
    return false;
  }
}

async function refresh() {
  const helper = await findHelper();
  if (!helper) {
    set({ helper: false, apps: [] });
    return;
  }
  try {
    const result = await loadLauncher();
    set(result ? { helper, apps: result.apps, locale: result.locale, timeZone: result.timeZone } : { helper, apps: [] });
  } catch {
    // Almanac's server didn't answer: keep what we had and try again next time.
    set({ helper });
  }
}

function start() {
  users += 1;
  if (users > 1) return;
  void refresh();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, CHECK_EVERY_MS);
}

function stop() {
  users -= 1;
  if (users > 0 || !timer) return;
  clearInterval(timer);
  timer = null;
}

/** The launcher as this screen sees it. */
export function useLauncher(): State {
  useEffect(() => {
    start();
    return stop;
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => FIRST,
  );
}

/** Asks the helper to open an app full screen. */
export async function launchApp(app: LauncherApp): Promise<boolean> {
  const body = app.kind === "web" ? { kind: "web", url: app.address, name: app.name } : { kind: "local", key: app.localKey, name: app.name };
  try {
    const res = await fetch(`${HELPER_URL}/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      set({ problem: text.slice(0, 120) || `${app.name} didn't open.` });
      return false;
    }
    set({ problem: null });
    return true;
  } catch {
    set({ problem: `Couldn't reach the launcher to open ${app.name}.` });
    return false;
  }
}

export function clearLaunchProblem() {
  set({ problem: null });
}

/*
 * The monitor's brightness (2026-11-16), set by the helper over the video
 * cable (DDC/CI). A finger dragging the slider asks many times a second,
 * but the monitor takes a moment for each change, so it's sent at most
 * every BRIGHTNESS_EVERY_MS, and always once more at the end.
 */
const BRIGHTNESS_EVERY_MS = 250;
let lastSent = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

async function sendBrightness(percent: number) {
  lastSent = Date.now();
  try {
    await fetch(`${HELPER_URL}/brightness`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The helper didn't answer: the next refresh shows what the monitor really is.
  }
}

/** Sets the monitor's brightness (0 to 100). final: the finger has let go, so send it now. */
export function setBrightness(percent: number, final = false) {
  const value = Math.round(Math.min(100, Math.max(0, percent)));
  if (state.helper) set({ helper: { ...state.helper, brightness: value } });
  if (pending) clearTimeout(pending);
  pending = null;
  const wait = BRIGHTNESS_EVERY_MS - (Date.now() - lastSent);
  if (final || wait <= 0) void sendBrightness(value);
  else pending = setTimeout(() => void sendBrightness(value), wait);
}
