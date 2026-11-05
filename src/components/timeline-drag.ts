"use client";

import { useRef, useState } from "react";

/*
 * Dragging things on a timeline (the week view and the Today screen).
 * Each timeline column is marked with data-drop-day (and on Today,
 * data-drop-member), so a block can tell which column it was dropped in.
 */

/** Times snap to the nearest quarter hour. */
export const SNAP = 15;

export type Placement = {
  /** Minutes since midnight. */
  start: number;
  minutes: number;
  day: string;
  /** Which person's column on Today ("everyone" or a member id); undefined on the week view. */
  member?: string;
};

/** Where the block is being dragged to, and which spot it started from. */
type Preview = Placement & { dx: number; from: string };

const keyOf = (p: Placement) => `${p.day}|${p.member ?? ""}|${p.start}|${p.minutes}`;

/** "09:30" for 570 minutes. */
export function clock(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 570 for "09:30". */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function columnAt(x: number, y: number): HTMLElement | null {
  const hit = document.elementsFromPoint(x, y).find((el) => el instanceof HTMLElement && el.dataset.dropDay);
  return (hit as HTMLElement | undefined) ?? null;
}

function readColumn(el: HTMLElement) {
  return { day: el.dataset.dropDay!, member: el.dataset.dropMember };
}

/**
 * Press and drag a block to move it (up and down for time, sideways for
 * another day or person), or drag its bottom edge to change how long it is.
 * A press that doesn't move counts as a tap.
 */
export function useTimelineDrag({
  first,
  last,
  placement,
  onDrop,
  onTap,
}: {
  first: number;
  last: number;
  placement: Placement;
  onDrop: (p: Placement) => void;
  onTap?: () => void;
}) {
  const [rawPreview, setPreview] = useState<Preview | null>(null);
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; origin: HTMLElement; moved: boolean } | null>(null);
  const span = (last - first) * 60;

  // Once the block has really moved (the page or the card caught up), the preview is stale.
  const from = keyOf(placement);
  const preview = rawPreview && rawPreview.from === from ? rawPreview : null;

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    e.stopPropagation();
    const origin = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-drop-day]");
    if (!origin) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, origin, moved: false };
  }

  function cancel() {
    drag.current = null;
    setPreview(null);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    d.moved = true;
    const rect = d.origin.getBoundingClientRect();
    const deltaMin = Math.round((((e.clientY - d.y) / rect.height) * span) / SNAP) * SNAP;
    if (d.mode === "resize") {
      const minutes = Math.min(Math.max(placement.minutes + deltaMin, SNAP), last * 60 - placement.start);
      setPreview({ ...placement, minutes, dx: 0, from });
      return;
    }
    const start = Math.min(Math.max(placement.start + deltaMin, first * 60), last * 60 - Math.min(placement.minutes, span));
    const target = columnAt(e.clientX, e.clientY) ?? d.origin;
    const col = readColumn(target);
    setPreview({
      start,
      minutes: placement.minutes,
      day: col.day,
      member: col.member,
      dx: target.getBoundingClientRect().left - rect.left,
      from,
    });
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setPreview(null);
      onTap?.();
      return;
    }
    if (preview) onDrop({ start: preview.start, minutes: preview.minutes, day: preview.day, member: preview.member });
  }

  const shown = preview ?? { ...placement, dx: 0 };
  return {
    /** Where to draw the block right now (top and height in %, sideways shift in px). */
    position: {
      top: `${((shown.start - first * 60) / span) * 100}%`,
      height: `${(shown.minutes / span) * 100}%`,
      transform: shown.dx ? `translateX(${shown.dx}px)` : undefined,
    },
    dragging: preview !== null,
    label: `${clock(shown.start)}–${clock(shown.start + shown.minutes)}`,
    clearPreview: () => setPreview(null),
    bodyHandlers: { onPointerDown: (e: React.PointerEvent) => begin("move", e), onPointerMove: move, onPointerUp: up, onPointerCancel: cancel },
    handleHandlers: { onPointerDown: (e: React.PointerEvent) => begin("resize", e), onPointerMove: move, onPointerUp: up, onPointerCancel: cancel },
  };
}
