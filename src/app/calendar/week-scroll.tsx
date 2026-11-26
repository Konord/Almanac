"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updatePending, usePending } from "@/components/pending-store";

/*
 * The browser-side bits of the Week hour grid (SPEC "Connor's decisions —
 * Nov 15 2026", corrected Nov 16). Dragging the empty grid scrolls the
 * hours: a finger scrolls it natively, and a mouse can drag it the same way.
 * Event cards are DraggableEvents: they stop their own press from reaching
 * the scroller, and are touch-action: none so a finger on a card drags the
 * card instead of scrolling.
 *
 * Press and hold an empty spot, then drag, to draw a new event from where
 * you pressed to where you let go (Connor, 2026-11-26): a quick drag still
 * scrolls. While adding, the dashed outline of the new event drags to move
 * it and its bottom edge drags to make it longer or shorter.
 */

/** How far a press can wander and still count as a tap. */
const TAP_SLOP = 6;
/** Times placed by tapping snap to the quarter hour. */
const SNAP = 15;

/** How far above now (or the first event) the top of the hours sits. */
const LEAD_MINUTES = 30;
/** How often the hours move on with the clock. */
const FOLLOW_MS = 60_000;
/** After a touch, the hours stay where they were put for this long before following the clock again. */
const HOLD_MS = 2 * 60_000;

/**
 * The scrolling hours. On first show it scrolls so `startMinute` (now, or
 * the week's first event) sits near the top.
 *
 * On the week with today in it (`follow` is the household's time zone),
 * the hours then move on by themselves as the day goes (Connor,
 * 2026-11-16): the top stays half an hour before now, so finished things
 * slide off the top. It can't scroll past the end of the day, so once
 * midnight reaches the bottom of the screen it stops there. A touch or
 * scroll pauses this for a couple of minutes.
 */
export function WeekScroller({ startMinute, follow, children, label }: { startMinute: number; follow: string | null; children: ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const lastTouch = useRef(0);

  const scrollTo = (minute: number, smooth: boolean) => {
    const el = box.current;
    const content = el?.firstElementChild as HTMLElement | null;
    if (!el || !content) return;
    // The browser stops at the bottom on its own, so midnight never leaves blank space under it.
    el.scrollTo({ top: Math.max(0, ((minute - LEAD_MINUTES) / (24 * 60)) * content.offsetHeight), behavior: smooth ? "smooth" : "instant" });
  };

  // Start near now (or the first event), with half an hour above it.
  useLayoutEffect(() => {
    scrollTo(startMinute, false);
    // Only when the week is first shown: a refresh keeps where you scrolled to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the clock through the day, unless someone has just used the hours.
  useEffect(() => {
    if (!follow) return;
    const minuteNow = () => {
      const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: follow, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
      return h * 60 + m;
    };
    const timer = setInterval(() => {
      if (document.hidden || Date.now() - lastTouch.current < HOLD_MS) return;
      scrollTo(minuteNow(), true);
    }, FOLLOW_MS);
    return () => clearInterval(timer);
     
  }, [follow]);

  // A mouse drags the hours up and down like a finger does (touch scrolls natively).
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    lastTouch.current = Date.now();
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = e.currentTarget;
    const startY = e.clientY;
    const startTop = el.scrollTop;
    let dragged = false;
    const move = (m: PointerEvent) => {
      // A press-and-hold that turned into drawing a new event doesn't scroll.
      if (el.dataset.drawing) return;
      const dy = m.clientY - startY;
      if (!dragged && Math.abs(dy) < TAP_SLOP) return;
      if (!dragged) {
        dragged = true;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
      }
      el.scrollTop = startTop - dy;
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.style.cursor = "";
      // A drag isn't a tap: don't open the card it ended on.
      if (dragged) {
        const stop = (c: MouseEvent) => {
          c.preventDefault();
          c.stopPropagation();
        };
        el.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 0);
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  return (
    <div
      ref={box}
      data-week-scroller
      tabIndex={0}
      aria-label={label}
      onPointerDown={onPointerDown}
      onWheel={() => (lastTouch.current = Date.now())}
      onTouchMove={() => (lastTouch.current = Date.now())}
      // A press on a card would start the browser's link drag; here dragging only scrolls.
      onDragStart={(e) => e.preventDefault()}
      className="absolute inset-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

/** How long a press has to stay still before a drag draws instead of scrolling. */
const HOLD_TO_DRAW_MS = 400;

/** The quarter hour at a point in a day's column (the column is the whole 24 hours tall). */
function minuteAt(column: HTMLElement, clientY: number, round: (n: number) => number = Math.floor): number {
  const rect = column.getBoundingClientRect();
  const fraction = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
  return Math.min(round((fraction * 24 * 60) / SNAP) * SNAP, 24 * 60);
}

/**
 * A day's column, under the events: press and hold, then drag, to draw a
 * new event. While adding (`placing`), it sits over the events and a tap
 * places the event at that quarter hour too (or moves it there, with the
 * add card open).
 */
export function DrawLayer({ day, href, defaultMinutes, placing, label }: { day: string; href: string; defaultMinutes: number; placing: boolean; label: string }) {
  const router = useRouter();
  const pending = usePending();
  const layer = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const [draft, setDraftState] = useState<{ from: number; to: number } | null>(null);
  const draftNow = useRef<{ from: number; to: number } | null>(null);
  const setDraft = (d: { from: number; to: number } | null) => {
    draftNow.current = d;
    setDraftState(d);
  };

  // Once drawing, a finger's moves draw instead of scrolling the hours.
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (drawing.current) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const place = (start: number, minutes: number) => {
    if (pending) {
      updatePending({ date: day, start, minutes, allDay: false });
      return;
    }
    const join = href.includes("?") ? "&" : "?";
    router.push(`${href}${join}start=${clock(start)}&mins=${minutes}`, { scroll: false });
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    const scroller = el.closest<HTMLElement>("[data-week-scroller]");
    const startX = e.clientX;
    const startY = e.clientY;
    const anchor = minuteAt(el, startY);
    let moved = false;
    const hold = setTimeout(() => {
      drawing.current = true;
      if (scroller) scroller.dataset.drawing = "1";
      el.setPointerCapture(e.pointerId);
      navigator.vibrate?.(10);
      setDraft({ from: anchor, to: Math.min(anchor + SNAP, 24 * 60) });
    }, HOLD_TO_DRAW_MS);
    const move = (m: PointerEvent) => {
      if (drawing.current) {
        const at = minuteAt(el, m.clientY, Math.round);
        setDraft(at >= anchor ? { from: anchor, to: Math.max(at, anchor + SNAP) } : { from: at, to: anchor + SNAP });
        return;
      }
      if (Math.hypot(m.clientX - startX, m.clientY - startY) > TAP_SLOP) {
        // Moved before the hold: it's a scroll, not a draw.
        moved = true;
        clearTimeout(hold);
      }
    };
    const up = (u: PointerEvent) => {
      clearTimeout(hold);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (scroller) delete scroller.dataset.drawing;
      if (drawing.current) {
        drawing.current = false;
        // Whatever was drawn becomes the new event.
        const d = draftNow.current;
        setDraft(null);
        if (d && u.type === "pointerup") place(d.from, Math.max(d.to - d.from, SNAP));
        return;
      }
      // A plain tap while adding places the event there.
      if (!moved && placing && u.type === "pointerup") place(Math.min(minuteAt(el, startY), 24 * 60 - SNAP), pending?.minutes ?? defaultMinutes);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  return (
    <div
      ref={layer}
      role={placing ? "button" : undefined}
      aria-label={label}
      title={placing ? label : undefined}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute inset-0 select-none ${placing ? "z-20 cursor-crosshair hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)]" : "z-0"}`}
    >
      {draft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[0.4rem] flex items-start rounded-[var(--radius)] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] px-2 py-1 text-[1.125rem] font-bold text-ink"
          style={{ top: `${(draft.from / (24 * 60)) * 100}%`, height: `${((draft.to - draft.from) / (24 * 60)) * 100}%` }}
        >
          {shortTime(draft.from)}–{shortTime(draft.to)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The dashed outline of the event being added, at its time in its day.
 * Drag it to move it (to another day too), or drag its bottom edge to
 * change how long it is; the add card follows.
 */
export function PendingOutline({ day, minRem, hourRem }: { day: string; minRem: number; hourRem: number }) {
  const pending = usePending();
  const [live, setLive] = useState<{ start: number; minutes: number } | null>(null);
  if (pending === null || pending.allDay || pending.start === null || pending.date !== day) return null;
  const start = live?.start ?? pending.start;
  const minutes = live?.minutes ?? pending.minutes;

  function drag(e: React.PointerEvent<HTMLElement>, kind: "move" | "resize") {
    if (pending === null || pending.start === null) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    const column = el.closest<HTMLElement>("[data-drop-day]");
    if (!column) return;
    el.setPointerCapture(e.pointerId);
    const from = { start: pending.start, minutes: pending.minutes };
    const grab = minuteAt(column, e.clientY, Math.round) - from.start;
    let next = from;
    let nextDay = day;
    const move = (m: PointerEvent) => {
      const at = minuteAt(column, m.clientY, Math.round);
      if (kind === "resize") next = { start: from.start, minutes: Math.max(SNAP, Math.min(at, 24 * 60) - from.start) };
      else next = { start: Math.max(0, Math.min(at - grab, 24 * 60 - from.minutes)), minutes: from.minutes };
      // Moving sideways onto another day takes it there.
      const over = document.elementsFromPoint(m.clientX, m.clientY).find((n) => n instanceof HTMLElement && n.dataset.dropDay) as HTMLElement | undefined;
      nextDay = kind === "move" && over?.dataset.dropDay ? over.dataset.dropDay : day;
      setLive(next);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setLive(null);
      updatePending({ date: nextDay, start: next.start, minutes: next.minutes, allDay: false });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  return (
    <div
      aria-label={`New event at ${clock(start)}: drag to move it`}
      onPointerDown={(e) => drag(e, "move")}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-x-[0.4rem] z-30 flex cursor-grab touch-none items-start rounded-[var(--radius)] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] px-2 py-1 text-[1.125rem] font-bold text-ink select-none"
      style={{ top: `${(start / 60) * hourRem}rem`, height: `${Math.max((minutes / 60) * hourRem, minRem)}rem` }}
    >
      {shortTime(start)}–{shortTime(start + minutes)}
      {/* The bottom edge: a big enough strip to grab with a finger. */}
      <span
        aria-label="Drag to change how long it is"
        onPointerDown={(e) => drag(e, "resize")}
        className="absolute inset-x-0 -bottom-[0.75rem] flex h-[1.5rem] cursor-ns-resize touch-none items-center justify-center"
      >
        <span className="h-[0.35rem] w-[3rem] rounded-full bg-accent" />
      </span>
    </div>
  );
}

/** 885 → "2:45" (the outline is small; the add card has the full times). */
function shortTime(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}

function clock(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
