"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Times snap to the nearest quarter hour. */
const SNAP = 15;

/**
 * Lies over one timeline column while adding. Tap to drop an event of the
 * usual length there, or press and drag down to draw how long it lasts.
 * Then it opens the quick-add card with the day, time and length filled in.
 *
 * This is a "client component": it runs in the browser so it can follow
 * your finger. Everything else on the screen is drawn on the server.
 */
export function PlaceOnTimeline({
  href,
  first,
  last,
  defaultMinutes,
  label,
}: {
  /** Where to go when placed; start and length are added to it. */
  href: string;
  /** The hours the timeline shows (e.g. 8 to 21). */
  first: number;
  last: number;
  defaultMinutes: number;
  label: string;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: number; end: number; downY: number } | null>(null);
  const span = (last - first) * 60;

  /** Minutes since midnight at a finger position, rounded down or to the nearest 15 minutes. */
  function minuteAt(clientY: number, round: (n: number) => number = Math.round): number {
    const rect = box.current!.getBoundingClientRect();
    const fraction = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    return first * 60 + round((fraction * span) / SNAP) * SNAP;
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    // The block starts at the quarter hour you touched.
    const start = Math.min(minuteAt(e.clientY, Math.floor), last * 60 - SNAP);
    setDrag({ start, end: start + defaultMinutes, downY: e.clientY });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    // A small wobble is still a tap; only a real drag changes the length.
    if (Math.abs(e.clientY - drag.downY) < 12) return;
    setDrag({ ...drag, end: Math.max(minuteAt(e.clientY), drag.start + SNAP) });
  }

  function onPointerUp() {
    if (!drag) return;
    const minutes = Math.max(drag.end - drag.start, SNAP);
    const join = href.includes("?") ? "&" : "?";
    router.push(`${href}${join}start=${clock(drag.start)}&mins=${minutes}`, { scroll: false });
  }

  return (
    <div
      ref={box}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const join = href.includes("?") ? "&" : "?";
          router.push(`${href}${join}mins=${defaultMinutes}`, { scroll: false });
        }
      }}
      className="absolute inset-0 z-20 cursor-crosshair touch-none rounded-xl outline-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:outline-2"
    >
      {drag ? (
        <div
          className="pointer-events-none absolute inset-x-1 flex items-start rounded-[0.875rem] border-2 border-dashed border-ink bg-board/80 px-2 py-1 text-sm font-bold text-ink"
          style={{
            top: `${((drag.start - first * 60) / span) * 100}%`,
            height: `${((drag.end - drag.start) / span) * 100}%`,
          }}
        >
          {clock(drag.start)}–{clock(drag.end)}
        </div>
      ) : null}
    </div>
  );
}

function clock(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
