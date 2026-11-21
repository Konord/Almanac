"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

/*
 * Drag a row up or down a list to put it in a new place (UI audit M1,
 * 2026-11-21: "remove the arrows and let them be dragged").
 *
 * Put `handle(i)` on the row's grip and `rowStyle(i)` on each row. While a
 * finger holds the grip, that row follows it and the rows it passes slide
 * out of its way; letting go calls `onMove(from, to)` once. The rows must be
 * the direct children of one list (they are measured once, when the drag
 * starts). The grip needs `touch-none` so the finger drags and doesn't swipe.
 */
type Drag = { from: number; to: number; dy: number; gap: number };

export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const start = useRef<{ y: number; mids: number[]; id: number } | null>(null);

  const handle = (index: number) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button > 0) return;
      const row = e.currentTarget.closest("li");
      const rows = row?.parentElement ? Array.from(row.parentElement.children) : [];
      if (!row || rows.length < 2) return;
      const rects = rows.map((r) => r.getBoundingClientRect());
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { y: e.clientY, mids: rects.map((r) => r.top + r.height / 2), id: e.pointerId };
      // How far the other rows slide: the dragged row's height plus the gap below it.
      const gap = rects[Math.min(index + 1, rects.length - 1)].top - rects[index].top || rects[index].height;
      setDrag({ from: index, to: index, dy: 0, gap: Math.abs(gap) });
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      setDrag((d) => {
        if (!d) return d;
        const dy = e.clientY - s.y;
        const centre = s.mids[d.from] + dy;
        let to = d.from;
        while (to < s.mids.length - 1 && centre > s.mids[to + 1]) to++;
        while (to > 0 && centre < s.mids[to - 1]) to--;
        return { ...d, dy, to };
      });
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (!start.current || e.pointerId !== start.current.id) return;
      start.current = null;
      if (drag && drag.to !== drag.from) onMove(drag.from, drag.to);
      setDrag(null);
    },
    onPointerCancel() {
      start.current = null;
      setDrag(null);
    },
  });

  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (index === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 10, position: "relative", boxShadow: "0 10px 24px rgba(20,30,50,0.18)", background: "var(--color-board)" };
    const shift = drag.from < drag.to && index > drag.from && index <= drag.to ? -drag.gap : drag.to < drag.from && index >= drag.to && index < drag.from ? drag.gap : 0;
    return { transform: `translateY(${shift}px)`, transition: "transform 150ms ease-out" };
  };

  return { handle, rowStyle, dragging: drag !== null };
}
