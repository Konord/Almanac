/*
 * The app launcher (2026-11-11): apps on the kitchen screen's tray.
 *
 * Two kinds of app:
 * - "web": a web app on the server, like Jellyfin or Actual. It opens full
 *   screen at its address, and Almanac checks every minute that it answers.
 * - "local": a program on the kitchen PC itself, like Steam or FreeTube.
 *   The launcher helper on that PC keeps its own list of programs it may
 *   start; Almanac only names one from that list (its "key").
 *
 * The launcher helper (launcher-helper/ in this repo) is a small program
 * that runs on the kitchen PC. A web page can't start programs by itself,
 * so Almanac asks the helper. Only that PC runs it, so only that PC shows
 * the apps: the iPad and phones never find it.
 *
 * This file holds the plain rules, so they can be tested.
 */

import { clockTime } from "./time-text.ts";

export type LauncherKind = "web" | "local";

/** One app as the tray shows it. */
export type LauncherApp = {
  id: string;
  name: string;
  icon: string | null;
  colour: string;
  kind: LauncherKind;
  address: string | null;
  localKey: string | null;
  checkUp: boolean;
  /** Null: not checked (a local app, or checks switched off). */
  up: boolean | null;
  /** When it went down (ISO time), if it's down. */
  downSince: string | null;
};

/** Where the helper listens on the kitchen PC. Only that PC can reach it. */
export const HELPER_URL = "http://127.0.0.1:4545";

/** How often the apps are checked while the kitchen screen is on. */
export const CHECK_EVERY_MS = 60_000;
/** Checks closer together than this reuse the last result (several screens, quick reloads). */
export const RECHECK_AFTER_MS = 50_000;
/** How long one check waits for an answer. */
export const CHECK_TIMEOUT_MS = 4_000;
/** Failed checks in a row before an app counts as down (one blip isn't worth a heads-up). */
export const DOWN_AFTER = 2;

/** The most apps the tray's apps tier holds (one row at 1280×720, nothing scrolls). */
export const MAX_APPS = 8;

/** After a check: the new failure count and when it went down. */
export function afterCheck(
  prev: { failures: number; downSince: string | null },
  answered: boolean,
  now: Date,
): { failures: number; downSince: string | null } {
  if (answered) return { failures: 0, downSince: null };
  const failures = prev.failures + 1;
  // It went down at the first failure of this run, not when it reached DOWN_AFTER.
  const downSince = prev.downSince ?? (failures >= DOWN_AFTER ? new Date(now.getTime() - (failures - 1) * CHECK_EVERY_MS).toISOString() : null);
  return { failures, downSince };
}

/** Whether a check is due again. */
export function checkDue(checkedAt: string | null, now: Date): boolean {
  return !checkedAt || now.getTime() - new Date(checkedAt).getTime() >= RECHECK_AFTER_MS;
}

/** Up (true), down (false) or not checked (null), from what's stored. */
export function upState(app: { kind: LauncherKind; checkUp: boolean; failures: number; checkedAt: string | null }): boolean | null {
  if (app.kind !== "web" || !app.checkUp || !app.checkedAt) return null;
  return app.failures < DOWN_AFTER;
}

/** A tidy web address, or null if it doesn't look like one. Adds http:// when it's left off. */
export function cleanAddress(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    const out = url.toString();
    return out.length <= 300 ? out : null;
  } catch {
    return null;
  }
}

export const isLocalKey = (key: string) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(key);

/** One app on the Settings screen, before Save. */
export type AppDraft = {
  /** A database id, or "new-…" for one added on the screen. */
  id: string;
  name: string;
  icon: string | null;
  colour: string;
  kind: LauncherKind;
  address: string;
  localKey: string;
  checkUp: boolean;
  removed: boolean;
};

/** What's wrong with the apps on the Settings screen, in words, or null. */
export function appsProblem(apps: AppDraft[]): string | null {
  const kept = apps.filter((a) => !a.removed);
  if (kept.length > MAX_APPS) return `The tray holds ${MAX_APPS} apps. Remove one first.`;
  for (const a of kept) {
    const name = a.name.trim() || "An app";
    if (!a.name.trim()) return "Every app needs a name.";
    if (a.name.trim().length > 30) return `${a.name.slice(0, 20)}… is too long for an app name.`;
    if (a.icon && [...a.icon].length > 8) return `${name}'s picture should be one emoji.`;
    if (a.kind === "web" && !cleanAddress(a.address)) return `${name} needs a web address, like http://192.168.2.10:8096.`;
    if (a.kind === "local" && !isLocalKey(a.localKey)) return `Pick which program ${name} opens.`;
  }
  return null;
}

/** "Down since 9:40 am" (or "since yesterday" for an older one). */
export function downText(downSince: string, now: Date, locale: string, timeZone: string): string {
  const at = new Date(downSince);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (day(at) !== day(now)) {
    const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(at);
    return `Down since ${weekday}`;
  }
  const time = clockTime(at, locale, timeZone);
  return `Down since ${time}`;
}
