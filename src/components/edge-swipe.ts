"use client";

import { useEffect, useRef } from "react";

/*
 * Swiping in from the edge of the screen, like a phone (Connor,
 * 2026-11-16): up from the bottom edge brings out the menu tray, in from
 * the right edge brings out the Daily List. Nothing is drawn for it, so
 * the screen keeps every bit of its space and a tap near the edge still
 * reaches whatever is there.
 *
 * It listens to touches on the whole window (passive, so it never holds up
 * scrolling): a touch that starts within EDGE_REM of the edge and moves
 * SWIPE_PX inwards, mostly straight, counts. Touch events keep coming even
 * when the browser also starts scrolling something under the finger, which
 * pointer events don't.
 *
 * A mouse can't swipe, so each edge also shows a small button while the
 * mouse is near it (see the tray and the Daily List).
 */

/** How close to the edge a swipe has to start, in rem (about 40px at 1920×1080). */
const EDGE_REM = 2.5;
/** How far it has to move inwards to count. */
const SWIPE_PX = 40;

export type Edge = "bottom" | "right";

export function useEdgeSwipe(edge: Edge, onSwipe: () => void, enabled = true) {
  // The latest callback, without restarting the listeners every render.
  const callback = useRef(onSwipe);
  useEffect(() => {
    callback.current = onSwipe;
  });

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let fired = false;
    const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const onStart = (e: TouchEvent) => {
      fired = false;
      start = null;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const zone = EDGE_REM * rem();
      const near = edge === "bottom" ? t.clientY >= window.innerHeight - zone : t.clientX >= window.innerWidth - zone;
      if (near) start = { x: t.clientX, y: t.clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || fired) return;
      const t = e.touches[0];
      const along = edge === "bottom" ? start.y - t.clientY : start.x - t.clientX;
      const across = Math.abs(edge === "bottom" ? t.clientX - start.x : t.clientY - start.y);
      if (along >= SWIPE_PX && along > across * 1.5) {
        fired = true;
        start = null;
        callback.current();
      }
    };
    const onEnd = () => (start = null);

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [edge, enabled]);
}

/**
 * A swipe on an open panel back towards its edge (down for the tray, right
 * for the Daily List) closes it. Spread the result on the panel.
 */
export function useSwipeAway(edge: Edge, onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const t = e.touches[0];
      const along = edge === "bottom" ? t.clientY - s.y : t.clientX - s.x;
      const across = Math.abs(edge === "bottom" ? t.clientX - s.x : t.clientY - s.y);
      if (along >= SWIPE_PX * 1.5 && along > across * 1.5) {
        start.current = null;
        onClose();
      }
    },
    onTouchEnd: () => (start.current = null),
  };
}
