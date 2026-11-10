"use client";

import { useState } from "react";
import { columnAt } from "./timeline-drag";

/**
 * Grab strips on the left and right edges of a bubble. On Today, drag one
 * sideways to stretch the bubble over more people's columns, or pull it
 * back to fewer (across the whole row means everyone). On the week view
 * (byDay), stretching over more days makes an event run over several days.
 *
 * c0 and c1 are the first and last columns the bubble covers. While
 * dragging, onPreview gets the columns it would cover; onDone gets them
 * when you let go (only if they changed).
 */
export function SideHandles({
  columns,
  c0,
  c1,
  onPreview,
  onDone,
  byDay = false,
  fullHeight = false,
}: {
  /** Strips run the block's whole height (for short blocks with a thin bottom handle). */
  fullHeight?: boolean;
  /** Columns are days (the week view) rather than people (Today). */
  byDay?: boolean;
  columns: string[];
  c0: number;
  c1: number;
  onPreview: (range: [number, number] | null) => void;
  onDone: (range: [number, number]) => void;
}) {
  const [drag, setDrag] = useState<{ side: "left" | "right"; range: [number, number] } | null>(null);

  const handlers = (side: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ side, range: [c0, c1] });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag;
      if (!d || d.side !== side) return;
      const id = byDay ? dayAtX(e.clientX) : columnAt(e.clientX, e.clientY)?.dataset.dropMember;
      const col = id ? columns.indexOf(id) : -1;
      if (col < 0) return;
      const range: [number, number] = side === "left" ? [Math.min(col, c1), c1] : [c0, Math.max(col, c0)];
      if (range[0] !== d.range[0] || range[1] !== d.range[1]) {
        setDrag({ side, range });
        onPreview(range);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      const d = drag;
      setDrag(null);
      onPreview(null);
      if (d && (d.range[0] !== c0 || d.range[1] !== c1)) onDone(d.range);
    },
    onPointerCancel: () => {
      setDrag(null);
      onPreview(null);
    },
  });

  const strip =
    `absolute top-0 ${fullHeight ? "bottom-0 items-center" : "bottom-5 items-end"} z-10 flex w-4 cursor-ew-resize touch-none justify-center pb-0.5 opacity-60 hover:opacity-100`;
  return (
    <>
      <div {...handlers("left")} aria-hidden className={`${strip} left-0`}>
        <span className="h-4 w-1 rounded-full bg-ink/40" />
      </div>
      <div {...handlers("right")} aria-hidden className={`${strip} right-0`}>
        <span className="h-4 w-1 rounded-full bg-ink/40" />
      </div>
    </>
  );
}

/** The week's day column under a point, going only by how far across it is. */
function dayAtX(x: number): string | undefined {
  const columns = [...document.querySelectorAll<HTMLElement>("[data-drop-day]")];
  const hit = columns.find((el) => {
    const box = el.getBoundingClientRect();
    return x >= box.left && x < box.right;
  });
  return hit?.dataset.dropDay;
}
