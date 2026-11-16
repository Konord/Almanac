"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Sun } from "@phosphor-icons/react";
import { setBrightness } from "./launcher-store";

/*
 * The kitchen screen's brightness slider (2026-11-16), in the menu tray.
 * Like a phone's: one wide bar, the filled part is how bright the screen
 * is. Touch anywhere on it or drag along it. It sets the monitor's own
 * backlight, through the launcher helper (so only the kitchen PC has it).
 */

/** Never all the way down from the slider: a black-looking screen seems broken. Overnight "off" is the screen saver's job. */
const LOWEST = 5;

export function BrightnessSlider({ value }: { value: number }) {
  const bar = useRef<HTMLDivElement>(null);
  // While a finger is on it, the slider shows the finger, not the last answer from the monitor.
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;

  const percentAt = (x: number) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box || box.width === 0) return shown;
    return Math.round(Math.min(100, Math.max(LOWEST, ((x - box.left) / box.width) * 100)));
  };
  const move = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    const p = percentAt(e.clientX);
    setDragging(final ? null : p);
    setBrightness(p, final);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 10 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -10 : 0;
    if (!step) return;
    e.preventDefault();
    setBrightness(Math.min(100, Math.max(LOWEST, shown + step)), true);
  };

  return (
    <div className="flex w-full items-center gap-4 px-2 pb-3">
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="Screen brightness"
        aria-valuemin={LOWEST}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={`${shown}%`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e, false);
        }}
        onPointerMove={(e) => {
          if (dragging !== null) move(e, false);
        }}
        onPointerUp={(e) => move(e, true)}
        onPointerCancel={() => setDragging(null)}
        className="relative h-16 flex-1 cursor-pointer touch-none overflow-hidden rounded-full bg-panel outline-offset-4"
      >
        <div aria-hidden className="absolute inset-y-0 left-0 bg-sun" style={{ width: `${shown}%`, transition: dragging === null ? "width 150ms ease-out" : undefined }} />
        <Sun aria-hidden size="2.25rem" weight="fill" className="absolute top-1/2 left-5 -translate-y-1/2 text-sun-ink" />
      </div>
      {/* A fixed width, so the bar doesn't move as the number changes. */}
      <span className="w-[4.5ch] text-right text-2xl font-bold text-ink tabular-nums">{shown}%</span>
    </div>
  );
}
