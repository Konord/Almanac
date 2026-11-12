"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { screenSaverPlan, type SaverPlan } from "@/app/screen-saver/actions";
import { HELPER_URL } from "@/lib/launcher";
import { saverMode, toMinutes, type MatColour, type SaverMode } from "@/lib/screen-saver";
import { localDateOf, localTimeOf } from "@/lib/time";
import { useLauncher } from "./launcher-store";
import { useScreenSaverHere } from "./screen-saver-here";

/*
 * The art screen saver (2026-11-12): a painting in a mat over the whole
 * screen, like a Samsung Frame TV. See src/lib/screen-saver.ts for when it
 * comes on. One tap anywhere goes straight back to Almanac, and that tap
 * never presses anything underneath. Overnight it can turn the screen off
 * instead (through the launcher helper on the kitchen PC).
 *
 * It sits in the root layout, so it covers every screen, and it's always
 * there but hidden, so the painting is already loaded when it fades in.
 */

/** How often it checks whether to come on. */
const TICK_MS = 5_000;
/** How often it asks for the plan (settings, meal times, the painting). */
const PLAN_MS = 5 * 60_000;
/** Settings › Screen saver's "Try it" button sends this. */
export const PREVIEW_EVENT = "almanac-screen-saver-preview";

// The bevel is the same board as the mat, a touch lighter where it's cut, and
// its faces are shaded toward a darker tone of that same board.
const MAT: Record<MatColour, { mat: string; core: string; shade: string }> = {
  white: { mat: "var(--color-mat-white)", core: "var(--color-board)", shade: "#6d6252" },
  cream: { mat: "var(--color-mat-cream)", core: "color-mix(in srgb, var(--color-mat-cream) 55%, var(--color-board))", shade: "#6b5634" },
  charcoal: { mat: "var(--color-mat-charcoal)", core: "color-mix(in srgb, var(--color-mat-charcoal) 89%, var(--color-board))", shade: "#000000" },
};

async function screenPower(on: boolean) {
  try {
    await fetch(`${HELPER_URL}/screen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }), signal: AbortSignal.timeout(3000) });
  } catch {
    // No helper (or an older one): the screen just stays on, showing black.
  }
}

export function ScreenSaver() {
  const here = useScreenSaverHere();
  const { helper } = useLauncher();
  const enabled = here === "on" || (here === null && Boolean(helper));
  const appOpen = Boolean(helper && helper.open);

  const [plan, setPlan] = useState<SaverPlan | null>(null);
  const [mode, setMode] = useState<SaverMode>("none");
  const [preview, setPreview] = useState(false);
  // When the screen was last touched (counted from when the page opened).
  const lastTouch = useRef(0);
  const swallowUntil = useRef(0);
  const startedAt = useRef<string | null>(null);
  const powered = useRef(true);
  const shownNow = useRef(false);
  const wakeNow = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    try {
      setPlan(await screenSaverPlan(startedAt.current));
    } catch {
      // Keep the last plan; try again next time.
    }
  }, []);

  // The plan, while this screen uses the screen saver.
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, PLAN_MS);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  // Any touch, key or wheel counts as someone using the screen.
  useEffect(() => {
    lastTouch.current = Date.now();
    const touched = (e: Event) => {
      lastTouch.current = Date.now();
      // A key wakes it too (a pointer wakes it through the cover's own handler).
      if (e.type === "keydown" && shownNow.current) wakeNow.current();
    };
    // The tap that wakes the screen must not also press what's underneath.
    const swallow = (e: Event) => {
      if (Date.now() < swallowUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("pointerdown", touched, { capture: true, passive: true });
    window.addEventListener("keydown", touched, { capture: true, passive: true });
    window.addEventListener("wheel", touched, { capture: true, passive: true });
    window.addEventListener("click", swallow, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", touched, { capture: true });
      window.removeEventListener("keydown", touched, { capture: true });
      window.removeEventListener("wheel", touched, { capture: true });
      window.removeEventListener("click", swallow, { capture: true });
    };
  }, []);

  // Settings' "Try it" shows the painting straight away, until a tap.
  useEffect(() => {
    const show = () => {
      setPreview(true);
      void refresh();
    };
    window.addEventListener(PREVIEW_EVENT, show);
    return () => window.removeEventListener(PREVIEW_EVENT, show);
  }, [refresh]);

  // Every few seconds: should it be on?
  const modeNow = useRef<SaverMode>("none");
  useEffect(() => {
    const tick = () => {
      let next: SaverMode = "none";
      const now = new Date();
      if (enabled && plan) {
        const date = localDateOf(now, plan.timeZone);
        next = saverMode({
          minute: toMinutes(localTimeOf(now, plan.timeZone)),
          weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
          idleMs: now.getTime() - lastTouch.current,
          settings: plan.settings,
          meals: plan.meals,
          appOpen,
        });
        // "Each time it starts": a new painting for each start.
        if (modeNow.current === "none" && next !== "none" && plan.settings.every === "start") {
          startedAt.current = now.toISOString();
          void refresh();
        }
      }
      modeNow.current = next;
      setMode(next);
    };
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [enabled, plan, appOpen, refresh]);

  // Overnight "screen off": ask the helper to turn the monitor off, and on again after.
  const off = mode === "off" && !preview;
  useEffect(() => {
    if (off && powered.current) {
      powered.current = false;
      void screenPower(false);
    } else if (!off && !powered.current) {
      powered.current = true;
      void screenPower(true);
    }
  }, [off]);

  const painting = plan?.painting ?? null;
  const showArt = (preview || mode === "art") && painting !== null;
  const shown = showArt || off;

  const wake = () => {
    lastTouch.current = Date.now();
    swallowUntil.current = Date.now() + 700;
    setPreview(false);
    modeNow.current = "none";
    setMode("none");
  };
  useEffect(() => {
    wakeNow.current = wake;
    shownNow.current = shown;
  });

  const mat = MAT[plan?.settings.mat ?? "white"];
  return (
    <div
      aria-hidden={!shown}
      onPointerDown={
        shown
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              swallowUntil.current = Date.now() + 700;
            }
          : undefined
      }
      onPointerUp={shown ? wake : undefined}
      className={`fixed inset-0 z-[1000] grid place-items-center transition-opacity duration-700 ${shown ? "opacity-100" : "pointer-events-none opacity-0"} ${off ? "bg-black" : "art-mat"}`}
      style={{ "--mat": mat.mat, "--core": mat.core, "--shade": mat.shade } as CSSProperties}
    >
      {painting && !off ? (
        <div key={painting.src} className="art-opening art-fade-in">
          <Image src={painting.src} width={painting.width} height={painting.height} sizes="92vw" quality={90} alt="" draggable={false} loading="eager" />
        </div>
      ) : null}
    </div>
  );
}
