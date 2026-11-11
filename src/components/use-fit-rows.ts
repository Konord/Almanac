"use client";

import { useCallback, useLayoutEffect, useState } from "react";

/*
 * How many rows of a list fit in the room it has (Connor, 2026-11-11:
 * "menus should scale with the screen size; only spill over when full").
 * The list must be stretched to the room it has (flex-1 min-h-0), not sized
 * by its rows. Its shortest row is measured, and the count follows the screen
 * as it changes. Until it's measured (on the server), `fallback` is used.
 */
export function useFitRows<T extends HTMLElement>(fallback: number): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [count, setCount] = useState(fallback);
  const ref = useCallback((node: T | null) => setEl(node), []);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      // The shortest row is the usual one (an open row can take the room of two).
      const heights = [...el.children].map((c) => c.getBoundingClientRect().height).filter((h) => h > 0);
      if (heights.length === 0) return;
      const row = Math.min(...heights);
      const style = getComputedStyle(el);
      const gap = parseFloat(style.rowGap) || 0;
      const room = el.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      setCount(Math.max(1, Math.floor((room + gap) / (row + gap))));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [el]);

  return [ref, count];
}
