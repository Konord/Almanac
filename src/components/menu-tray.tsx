"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alarm, Broom, CalendarBlank, CalendarCheck, CaretDown, ForkKnife, GearSix, House, ListChecks } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

/**
 * The hidden menu tray.
 *
 * The menu used to be an icon rail down the left side, which took space on
 * every screen even though it is only needed when someone walks up to change
 * something. Now there is just a small handle at the bottom centre. Tapping it
 * (or swiping up on it) slides the tray up with the section buttons. The tray
 * hides itself again after a short while with no touches, when you pick a
 * section, when you tap outside it, or when you press Escape.
 */

export type Section = "today" | "calendar" | "chores" | "lists" | "routines" | "meals" | "review" | "settings";

const ITEMS: { section: Section; href: string; label: string; icon: Icon }[] = [
  { section: "today", href: "/", label: "Agenda", icon: House },
  { section: "calendar", href: "/calendar", label: "Calendar", icon: CalendarBlank },
  // Planning happens in the weekly review; the rest are managers (Connor, 2026-11-09).
  { section: "review", href: "/review", label: "Weekly review", icon: CalendarCheck },
  { section: "routines", href: "/routines", label: "Routine Manager", icon: Alarm },
  { section: "lists", href: "/lists", label: "List Manager", icon: ListChecks },
  { section: "chores", href: "/chores", label: "Chore Manager", icon: Broom },
  { section: "meals", href: "/meals/library", label: "Menu Manager", icon: ForkKnife },
  { section: "settings", href: "/household", label: "Settings", icon: GearSix },
];

/** How long the open tray waits, with no touches, before hiding itself. */
const AUTO_HIDE_MS = 30_000;

export function MenuTray({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef<number | null>(null);

  // Close whenever the screen changes (a section was picked).
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }

  // Restart the auto-hide countdown. Called on open and on every touch inside the tray.
  function keepOpen() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), AUTO_HIDE_MS);
  }

  useEffect(() => {
    if (!open) return;
    keepOpen();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open]);

  return (
    <>
      {/* The handle: a short grey bar. The button around it is wider and taller so it is easy to hit. */}
      <button
        type="button"
        aria-label="Open the menu"
        aria-expanded={open}
        aria-controls="menu-tray"
        onClick={() => setOpen(true)}
        onPointerDown={(e) => (swipeStart.current = e.clientY)}
        onPointerUp={(e) => {
          if (swipeStart.current !== null && swipeStart.current - e.clientY > 20) setOpen(true);
          swipeStart.current = null;
        }}
        className={`fixed bottom-0 left-1/2 z-40 flex h-11 w-48 -translate-x-1/2 touch-none items-center justify-center ${
          open ? "invisible" : ""
        }`}
      >
        <span aria-hidden className="h-2 w-30 rounded-full bg-check-border/60" />
      </button>

      {/* A see-through layer behind the tray: tapping it closes the tray. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/10 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <nav
        id="menu-tray"
        aria-label="Menu"
        inert={!open}
        onPointerDown={keepOpen}
        className={`fixed bottom-0 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center rounded-t-[1.75rem] bg-board px-5 pt-2 pb-5 shadow-[0_-0.25rem_2rem_rgba(30,35,45,0.18)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-[calc(100%+3rem)]"
        }`}
      >
        <button
          type="button"
          aria-label="Close the menu"
          onClick={() => setOpen(false)}
          className="flex h-11 w-48 items-center justify-center text-ink-muted"
        >
          <CaretDown size="1.75rem" aria-hidden />
        </button>
        <div className="flex gap-2">
          {ITEMS.map(({ section: s, href, label, icon: IconComponent }) => {
            const active = s === section;
            return (
              <Link
                key={s}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-24 min-w-28 flex-col items-center justify-center gap-1.5 rounded-[1.25rem] px-3 text-base font-bold ${
                  active ? "bg-rail text-ink" : "text-ink-muted hover:bg-rail"
                }`}
              >
                <IconComponent size="2.5rem" weight={active ? "fill" : "regular"} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
