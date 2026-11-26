"use client";

import { useEffect } from "react";

/*
 * The pressed look for touch (UI audit H2, 2026-11-21).
 *
 * A finger never hovers, and a quick tap is over before the browser's own
 * :active look would even show, so nothing on screen answered a tap until
 * the next page arrived. This listens once, for the whole app: when a
 * finger (or mouse) goes down on something you can tap, it marks it with
 * data-pressed (globals.css darkens it and shrinks it a little) and keeps
 * the mark for at least PRESS_MS, so even a quick tap is seen.
 *
 * Big things (a whole card, a month day) shrink less, so they don't wobble.
 * Things you drag (events, meals, handles, sliders) are left alone: they
 * have their own look while held, and a shrink would fight the drag.
 */

const TAPPABLE =
  'a[href], button, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], label:has(> input[type="checkbox"]), label:has(> input[type="radio"])';

/** Long enough to see on a quick tap. */
const PRESS_MS = 140;

/** How much a thing shrinks: buttons a bit, big cards hardly at all. */
function scaleFor(el: Element): number {
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height);
  if (size > 320) return 0.99;
  if (size > 160) return 0.975;
  return 0.95;
}

function pressable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(TAPPABLE);
  if (!el) return null;
  if (el.matches(':disabled, [aria-disabled="true"], [data-no-press]')) return null;
  // Draggable things and anything already moved by a transform (a drag in progress).
  if (el.closest('[data-no-press], .cursor-grab, .touch-none, input[type="range"]')) return null;
  if (getComputedStyle(el).transform !== "none") return null;
  return el;
}

export function PressFeedback() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let since = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const release = (el: HTMLElement) => {
      el.setAttribute("data-press-out", "");
      el.removeAttribute("data-pressed");
      el.style.removeProperty("--press-scale");
      setTimeout(() => el.removeAttribute("data-press-out"), 200);
    };

    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      const el = pressable(e.target);
      if (!el) return;
      clearTimeout(timer);
      if (current && current !== el) release(current);
      current = el;
      since = performance.now();
      el.removeAttribute("data-press-out");
      el.style.setProperty("--press-scale", String(scaleFor(el)));
      el.setAttribute("data-pressed", "");
    };

    const up = () => {
      const el = current;
      if (!el) return;
      current = null;
      const left = PRESS_MS - (performance.now() - since);
      if (left > 0) timer = setTimeout(() => release(el), left);
      else release(el);
    };

    window.addEventListener("pointerdown", down, { capture: true, passive: true });
    window.addEventListener("pointerup", up, { capture: true, passive: true });
    window.addEventListener("pointercancel", up, { capture: true, passive: true });
    // A press that turns into a scroll or a swipe stops looking pressed.
    window.addEventListener("scroll", up, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", down, { capture: true });
      window.removeEventListener("pointerup", up, { capture: true });
      window.removeEventListener("pointercancel", up, { capture: true });
      window.removeEventListener("scroll", up, { capture: true });
    };
  }, []);
  return null;
}
