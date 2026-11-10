"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
 * Keeps the calendar displays (Agenda, Week, Month) up to date on a screen
 * nobody is touching, like the kitchen wall. Without it the clock ticks but
 * everything else stays as it was until someone taps: overnight the wall
 * still shows yesterday, and changes made on another device never appear.
 *
 * Every few minutes, and as soon as the date changes, it quietly asks the
 * server for a fresh copy of the screen. It waits while someone is using the
 * screen (a touch or key press in the last two minutes, or typing in a box),
 * so it never jumps under a finger or interrupts adding an event. A fresh
 * copy is also fetched when the screen wakes up or the tab comes back.
 */

/** How often a screen nobody is touching gets a fresh copy. */
const EVERY_MS = 5 * 60_000;
/** How long after the last touch before refreshing is allowed. */
const IDLE_MS = 2 * 60_000;
/** How often to check. */
const CHECK_MS = 30_000;

export function WallRefresh({ timeZone }: { timeZone: string }) {
  const router = useRouter();

  useEffect(() => {
    const dayOf = () => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    let lastTouch = 0;
    let lastRefresh = Date.now();
    let day = dayOf();

    const touched = () => (lastTouch = Date.now());
    const typing = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
    };
    const refresh = () => {
      lastRefresh = Date.now();
      day = dayOf();
      router.refresh();
    };

    const timer = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const newDay = dayOf() !== day;
      // A new day can't wait for the full interval, but it still waits for an idle screen.
      if ((newDay || now - lastRefresh >= EVERY_MS) && now - lastTouch >= IDLE_MS && !typing()) refresh();
    }, CHECK_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastRefresh >= CHECK_MS) refresh();
    };

    window.addEventListener("pointerdown", touched, { passive: true });
    window.addEventListener("keydown", touched);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", touched);
      window.removeEventListener("keydown", touched);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, timeZone]);

  return null;
}
