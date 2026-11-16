"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updatePending, usePending } from "@/components/pending-store";

/*
 * The browser-side bits of the Week hour grid (SPEC "Connor's decisions —
 * Nov 15 2026", corrected Nov 16). Dragging the empty grid scrolls the
 * hours: a finger scrolls it natively, and a mouse can drag it the same way.
 * Event cards are DraggableEvents: they stop their own press from reaching
 * the scroller, and are touch-action: none so a finger on a card drags the
 * card instead of scrolling.
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

/**
 * While adding: a tap anywhere in a day's column places the event at that
 * quarter hour (or, with the add card open, moves it there). Dragging still
 * scrolls.
 */
export function PlaceTap({ day, href, defaultMinutes, label }: { day: string; href: string; defaultMinutes: number; label: string }) {
  const router = useRouter();
  const pending = usePending();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const fraction = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
        const start = Math.min(Math.floor((fraction * 24 * 60) / SNAP) * SNAP, 24 * 60 - SNAP);
        if (pending) {
          updatePending({ date: day, start, allDay: false });
          return;
        }
        const join = href.includes("?") ? "&" : "?";
        router.push(`${href}${join}start=${clock(start)}&mins=${defaultMinutes}`, { scroll: false });
      }}
      className="absolute inset-0 z-20 cursor-crosshair outline-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2"
    />
  );
}

/** The dashed outline of the event being added, at its time in its day (it doesn't drag; change it on the card). */
export function PendingOutline({ day, minRem, hourRem }: { day: string; minRem: number; hourRem: number }) {
  const pending = usePending();
  if (pending === null || pending.allDay || pending.start === null || pending.date !== day) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-[0.4rem] z-30 flex items-start rounded-[var(--radius)] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] px-2 py-1 text-[1.125rem] font-bold text-ink"
      style={{ top: `${(pending.start / 60) * hourRem}rem`, height: `${Math.max((pending.minutes / 60) * hourRem, minRem)}rem` }}
    >
      {clock(pending.start)}
    </div>
  );
}

function clock(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
