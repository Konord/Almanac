"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { spanBox } from "@/lib/calendar-layout";
import { updatePending, usePending } from "./pending-store";
import { clock, columnAt, SNAP } from "./timeline-drag";

/**
 * Lies over the whole row of people on Today while adding. Press in a
 * person's column and drag: down to draw how long it lasts, sideways to
 * stretch it over the people next to them. Across the whole row means
 * everyone. A tap adds an event of the usual length for that one person.
 * Then it opens the quick-add card with the time and people filled in
 * (or, with the card already open, moves the new event there).
 */
export function PlaceAcrossPeople({
  columns,
  href,
  first,
  last,
  defaultMinutes,
  gap,
  moving,
}: {
  /** Each person's column, in order. */
  columns: { id: string; name: string }[];
  /** Where to go when placed; start, length and who are added to it. */
  href: string;
  first: number;
  last: number;
  defaultMinutes: number;
  /** The space between columns (CSS), to line the outline up with them. */
  gap: string;
  /** The add card is open: move the new event instead of starting another. */
  moving: boolean;
}) {
  const router = useRouter();
  const pending = usePending();
  const length = moving && pending ? pending.minutes : defaultMinutes;
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: number; end: number; downY: number; c0: number; c1: number; from: number; long: boolean } | null>(
    null,
  );
  const span = (last - first) * 60;
  const ids = columns.map((c) => c.id);

  function minuteAt(clientY: number, round: (n: number) => number = Math.round): number {
    const rect = box.current!.getBoundingClientRect();
    const fraction = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    return first * 60 + round((fraction * span) / SNAP) * SNAP;
  }

  /** Which person's column is under a finger (the nearest one in a gap). */
  function columnIndex(x: number, y: number, fallback: number): number {
    const id = columnAt(x, y)?.dataset.dropMember;
    const i = id ? ids.indexOf(id) : -1;
    return i >= 0 ? i : fallback;
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = Math.min(minuteAt(e.clientY, Math.floor), last * 60 - SNAP);
    const col = columnIndex(e.clientX, e.clientY, 0);
    setDrag({ start, end: start + length, downY: e.clientY, c0: col, c1: col, from: col, long: false });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const col = columnIndex(e.clientX, e.clientY, drag.from);
    // A small wobble is still a tap; only a real drag down changes the length.
    const long = drag.long || Math.abs(e.clientY - drag.downY) >= 12;
    setDrag({
      ...drag,
      c0: Math.min(drag.from, col),
      c1: Math.max(drag.from, col),
      long,
      end: long ? Math.max(minuteAt(e.clientY), drag.start + SNAP) : drag.end,
    });
  }

  function onPointerUp() {
    if (!drag) return;
    const minutes = Math.max(drag.end - drag.start, SNAP);
    const everyone = drag.c0 === 0 && drag.c1 === ids.length - 1 && ids.length > 1;
    const people = everyone ? [] : ids.slice(drag.c0, drag.c1 + 1);
    setDrag(null);
    if (moving) {
      updatePending({ start: drag.start, minutes, allDay: false, members: people });
      return;
    }
    const join = href.includes("?") ? "&" : "?";
    router.push(`${href}${join}start=${clock(drag.start)}&mins=${minutes}&who=${everyone ? "all" : people.join(",")}`, { scroll: false });
  }

  return (
    <div
      ref={box}
      role="button"
      tabIndex={0}
      aria-label="Add an event: tap a person's column, or drag across several people"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const join = href.includes("?") ? "&" : "?";
          router.push(`${href}${join}mins=${length}`, { scroll: false });
        }
      }}
      className="absolute inset-0 z-20 cursor-crosshair touch-none rounded-xl outline-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,transparent)] focus-visible:outline-2"
    >
      {drag ? (
        <div
          className="pointer-events-none absolute flex items-start justify-between gap-2 rounded-[0.875rem] border-2 border-dashed border-ink bg-board/80 px-2 py-1 text-sm font-bold text-ink"
          style={{
            ...spanBox(drag.c0, drag.c1, ids.length, gap),
            top: `${((drag.start - first * 60) / span) * 100}%`,
            height: `${((drag.end - drag.start) / span) * 100}%`,
          }}
        >
          <span>
            {clock(drag.start)}–{clock(drag.end)}
          </span>
          <span className="truncate">
            {drag.c0 === 0 && drag.c1 === ids.length - 1 && ids.length > 1
              ? "Everyone"
              : columns
                  .slice(drag.c0, drag.c1 + 1)
                  .map((c) => c.name)
                  .join(" + ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
