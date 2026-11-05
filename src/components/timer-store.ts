import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * Kitchen timers. They're kept in the browser (localStorage) as the time
 * each one ends, so they keep counting if you leave Cooking mode or the
 * page reloads, and every screen on this device can show them.
 */

export type KitchenTimer = {
  id: string;
  label: string;
  /** When it goes off (milliseconds since 1970). */
  endsAt: number;
  minutes: number;
  /** The meal being cooked, so the timer can lead back to it. */
  mealId: string | null;
  /** Set once it has rung, so it only rings once. */
  rang?: boolean;
};

const KEY = "almanac-timers";
const CHANGED = "almanac-timers-changed";

let cache: { raw: string | null; timers: KitchenTimer[] } = { raw: null, timers: [] };

function read(): KitchenTimer[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.timers;
  }
  if (raw === cache.raw) return cache.timers;
  let timers: KitchenTimer[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) timers = parsed.filter((t): t is KitchenTimer => t && typeof t.id === "string" && typeof t.endsAt === "number");
  } catch {
    timers = [];
  }
  cache = { raw, timers };
  return timers;
}

function write(timers: KitchenTimer[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(timers));
  } catch {
    // Private browsing: timers just won't survive a reload.
    cache = { raw: cache.raw, timers };
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

const EMPTY: KitchenTimer[] = [];

export function useTimers(): KitchenTimer[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** The time now, ticking every second while there are timers. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function startTimer(label: string, minutes: number, mealId: string | null = null) {
  const timer: KitchenTimer = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, minutes, endsAt: Date.now() + minutes * 60_000, mealId };
  write([...read(), timer]);
}

export function addMinute(id: string, minutes = 1) {
  write(read().map((t) => (t.id === id ? { ...t, endsAt: Math.max(Date.now(), t.endsAt) + minutes * 60_000, rang: false } : t)));
}

export function stopTimer(id: string) {
  write(read().filter((t) => t.id !== id));
}

/** "12:05" left, or "0:00". */
export function timeLeft(timer: KitchenTimer, now: number): string {
  const seconds = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Rings (a few soft beeps, no sound files needed) when a timer reaches zero. */
export function useAlarm(timers: KitchenTimer[], now: number) {
  useEffect(() => {
    const due = timers.filter((t) => !t.rang && t.endsAt <= now);
    if (due.length === 0) return;
    write(read().map((t) => (due.some((d) => d.id === t.id) ? { ...t, rang: true } : t)));
    beep();
  }, [timers, now]);
}

function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i % 2 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.32);
    }
    setTimeout(() => ctx.close(), 3000);
  } catch {
    // No sound available; the timer still flashes.
  }
}
