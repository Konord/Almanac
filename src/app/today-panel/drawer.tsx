"use client";

import { useState, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEdgeSwipe, useSwipeAway } from "@/components/edge-swipe";
import { DAILY_OPEN_COOKIE } from "@/lib/panel-boxes";

/*
 * The Daily List on Week and Month (Connor, 2026-11-16): it slides in from
 * the right with a swipe in from the right edge, and back out with a swipe
 * to the right on it (or, on Month, a tap on the grid). No header button,
 * no shadow (it sits on the grey rail, like the Agenda's right column).
 *
 * The page already has the list drawn, so opening and closing happen right
 * here in the browser: the calendar narrows as the list slides in, with no
 * trip to the server. Each screen remembers it in a cookie the page reads
 * next time.
 *
 * Week drops two days while the list is out, so the others keep their
 * width: the week grid reads `data-daily-open` (see .week-cols in
 * globals.css).
 *
 * A mouse can't swipe, so a small tab shows at the right edge when the
 * pointer comes near it.
 */

const YEAR = 60 * 60 * 24 * 400;

export function DailyListDrawer({
  initialOpen,
  closeOnTap,
  panel,
  children,
}: {
  initialOpen: boolean;
  /** Month: a tap anywhere on the grid puts the list away. */
  closeOnTap: boolean;
  panel: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState(initialOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    document.cookie = `${DAILY_OPEN_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${YEAR}; samesite=lax`;
  };
  useEdgeSwipe("right", () => setOpen(true), !open);
  const swipeAway = useSwipeAway("right", () => setOpen(false));

  return (
    <div data-daily-open={open} className="flex min-h-0 flex-1">
      {/*
        With the list out, the grid sits in the same white rounded card as
        the Agenda's. With it away, the grid fills the screen to its edges
        and bottom corners, square, under the same header (Connor, 2026-11-26).
      */}
      <div
        className={`relative flex min-w-0 flex-1 flex-col overflow-hidden bg-board transition-[margin,border-radius] duration-300 ease-out ${
          open ? "rounded-[var(--radius-card)] shadow-raised" : "rounded-none lg:-mx-8 lg:-mb-6 lg:border-t lg:border-frame"
        }`}
      >
        {children}
        {open && closeOnTap ? (
          <button type="button" aria-label="Put the Daily List away" onClick={() => setOpen(false)} className="absolute inset-0 z-20 cursor-default max-lg:hidden" />
        ) : null}
      </div>
      <div
        inert={!open}
        className="shrink-0 overflow-hidden transition-[width] duration-300 ease-out max-lg:hidden"
        style={{ width: open ? "37.25rem" : "0rem" }}
      >
        <div {...swipeAway} className="flex h-full w-[37.25rem] flex-col pl-5 [&>aside]:flex-1">
          {panel}
        </div>
      </div>

      {/* With a mouse: a tab at the edge (or at the list's edge while it's out) when the pointer comes near. */}
      <div
        className="group fixed top-1/2 z-30 hidden h-[24rem] w-[2.5rem] -translate-y-1/2 items-center justify-end transition-[right] duration-300 ease-out pointer-fine:flex max-lg:!hidden"
        style={{ right: open ? "39.25rem" : "2rem" }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Put the Daily List away" : "Pull out the Daily List"}
          aria-expanded={open}
          className="flex h-[6rem] w-[2.25rem] items-center justify-center rounded-l-[var(--radius)] bg-panel text-ink-soft opacity-0 shadow-raised transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        >
          {open ? <CaretRight size="1.5rem" weight="bold" aria-hidden /> : <CaretLeft size="1.5rem" weight="bold" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
