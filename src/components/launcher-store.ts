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
  helper: false | null | { programs: HelperProgram[] };
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
    return { programs };
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
