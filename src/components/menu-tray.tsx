"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alarm, Broom, CalendarBlank, CalendarCheck, CaretDown, CaretUp, ForkKnife, GearSix, ListChecks } from "@phosphor-icons/react";
import { lastDisplayHref } from "./remember-display";
import { clearLaunchProblem, launchApp, useLauncher } from "./launcher-store";
import { soft } from "@/lib/colours";
import { MAX_APPS, type LauncherApp } from "@/lib/launcher";
import { emojiImage } from "@/lib/emoji";
import { DownSince } from "./down-since";
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
 *
 * On the kitchen screen the tray has a second tier (2026-11-11): drag it
 * further up (or tap "Drag up for apps") and it grows to show the apps,
 * like a phone's home screen. Only the kitchen PC runs the launcher
 * helper, so only it gets the second tier (see launcher-store.ts).
 */

export type Section = "today" | "calendar" | "chores" | "lists" | "routines" | "meals" | "review" | "settings";

const ITEMS: { section: Section; href: string; label: string; icon: Icon }[] = [
  // Calendar goes back to whichever display (Agenda, Week, Month) this screen
  // showed last; you switch between them at the top right (Connor, 2026-11-09).
  { section: "calendar", href: "/calendar", label: "Calendar", icon: CalendarBlank },
  // Planning happens in the weekly review; the rest are managers (Connor, 2026-11-09).
  { section: "review", href: "/review", label: "Weekly review", icon: CalendarCheck },
  { section: "routines", href: "/routines", label: "Routine Manager", icon: Alarm },
  { section: "lists", href: "/lists", label: "List Manager", icon: ListChecks },
  { section: "chores", href: "/chores", label: "Chore Manager", icon: Broom },
  { section: "meals", href: "/meals/menu", label: "Menu Manager", icon: ForkKnife },
  { section: "settings", href: "/household", label: "Settings", icon: GearSix },
];

/** How long the open tray waits, with no touches, before hiding itself. */
const AUTO_HIDE_MS = 30_000;

/** How far a drag has to go to count, and how far the first drag goes to open both tiers at once. */
const DRAG_PX = 20;
const FAR_DRAG_PX = 220;

type Tier = 0 | 1 | 2;

export function MenuTray({ section }: { section: Section }) {
  const [tier, setTier] = useState<Tier>(0);
  const [calendarHref, setCalendarHref] = useState("/calendar");
  const path = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef<number | null>(null);
  const launcher = useLauncher();
  // The apps tier is only on the screen that runs the launcher helper (the kitchen PC).
  const hasApps = Boolean(launcher.helper);
  const open = tier > 0;

  const openTo = (to: Tier) => {
    if (tier === 0) setCalendarHref(lastDisplayHref());
    setTier(to === 2 && !hasApps ? 1 : to);
  };
  const close = () => {
    setTier(0);
    clearLaunchProblem();
  };

  // Close whenever the screen changes (a section was picked).
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setTier(0);
  }

  // Restart the auto-hide countdown. Called on open and on every touch inside the tray.
  function keepOpen() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(close, AUTO_HIDE_MS);
  }

  useEffect(() => {
    if (!open) return;
    keepOpen();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the tray opens or closes
  }, [open]);

  // A drag on the tray's top edge: up shows the next tier, down the one before.
  const dragStart = (y: number) => (swipeStart.current = y);
  const dragEnd = (y: number): boolean => {
    if (swipeStart.current === null) return false;
    const moved = swipeStart.current - y;
    swipeStart.current = null;
    if (moved > DRAG_PX) openTo(tier === 0 && moved > FAR_DRAG_PX ? 2 : ((tier + 1) as Tier));
    else if (moved < -DRAG_PX) {
      if (tier === 2) setTier(1);
      else close();
    }
    else return false;
    return true;
  };

  const apps = launcher.apps.slice(0, MAX_APPS);

  return (
    <>
      {/* The handle: a short grey bar. The button around it is wider and taller so it is easy to hit. */}
      <button
        type="button"
        aria-label="Open the menu"
        aria-expanded={open}
        aria-controls="menu-tray"
        onClick={() => openTo(1)}
        onPointerDown={(e) => dragStart(e.clientY)}
        onPointerUp={(e) => dragEnd(e.clientY)}
        className={`fixed bottom-0 left-1/2 z-40 flex h-11 w-48 -translate-x-1/2 touch-none items-center justify-center ${
          open ? "invisible" : ""
        }`}
      >
        <span aria-hidden className="h-2 w-30 rounded-full bg-check-border/60" />
      </button>

      {/* A see-through layer behind the tray: tapping it closes the tray. */}
      <div
        aria-hidden
        onClick={close}
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
        {/* The top edge: drag it, or tap it. With apps it moves between the tiers; without, it closes. */}
        <button
          type="button"
          aria-label={!hasApps ? "Close the menu" : tier === 2 ? "Hide the apps" : "Show the apps"}
          aria-expanded={hasApps ? tier === 2 : undefined}
          onPointerDown={(e) => dragStart(e.clientY)}
          onPointerUp={(e) => {
            if (dragEnd(e.clientY)) e.preventDefault();
          }}
          onClick={(e) => {
            if (e.defaultPrevented) return;
            if (!hasApps) close();
            else setTier(tier === 2 ? 1 : 2);
          }}
          className="flex h-11 min-w-48 touch-none items-center justify-center gap-2 px-4 text-base font-bold text-ink-muted"
        >
          {!hasApps ? (
            <CaretDown size="1.75rem" aria-hidden />
          ) : tier === 2 ? (
            <CaretDown size="1.75rem" aria-hidden />
          ) : (
            <>
              <CaretUp size="1.5rem" weight="bold" aria-hidden />
              Drag up for apps
            </>
          )}
        </button>

        {tier === 2 ? (
          <section aria-label="Apps" className="flex w-full flex-col gap-2 pb-3">
            <h2 className="px-2 text-base font-bold tracking-[0.04em] text-ink-muted">APPS</h2>
            {apps.length === 0 ? (
              <p className="px-2 py-4 text-lg text-ink-muted">
                No apps yet. Add them in <Link href="/household?tab=apps" className="font-bold text-accent">Settings › Apps</Link>.
              </p>
            ) : (
              <ul className="flex justify-center gap-4">
                {apps.map((app) => (
                  <li key={app.id}>
                    <AppTile app={app} onOpen={async () => (await launchApp(app)) && close()} />
                  </li>
                ))}
              </ul>
            )}
            {launcher.problem ? <p role="status" className="px-2 text-base font-bold text-danger">{launcher.problem}</p> : null}
            <div aria-hidden className="mt-2 h-0.5 w-full bg-frame" />
          </section>
        ) : null}

        <div className="flex gap-2">
          {ITEMS.map(({ section: s, href, label, icon: IconComponent }) => {
            // The Agenda is one of the calendar's displays.
            const active = s === section || (s === "calendar" && section === "today");
            return (
              <Link
                key={s}
                href={s === "calendar" ? calendarHref : href}
                aria-current={active ? "page" : undefined}
                onClick={close}
                className={`flex min-h-24 w-30 flex-col items-center justify-start gap-1.5 rounded-[1.25rem] px-2 pt-3 pb-2 text-base font-bold ${
                  active ? "bg-rail text-ink" : "text-ink-muted hover:bg-rail"
                }`}
              >
                <IconComponent size="2.5rem" weight={active ? "fill" : "regular"} aria-hidden />
                {/* Two lines kept for every label, so the icons all line up. */}
                <span className="flex min-h-[2lh] items-start text-center leading-tight text-balance">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/**
 * One app: a rounded square (people are circles, so apps aren't), its
 * picture, its name, and a dot when it's checked: green when it answered,
 * red with "Down since …" when it didn't.
 */
function AppTile({ app, onOpen }: { app: LauncherApp; onOpen: () => void }) {
  const launcher = useLauncher();
  const [busy, setBusy] = useState(false);
  const down = app.up === false;
  const src = app.icon ? emojiImage(app.icon) : null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onOpen();
        setBusy(false);
      }}
      aria-label={`Open ${app.name}${down ? " (it isn't answering)" : ""}`}
      className="flex w-34 flex-col items-center gap-2 rounded-[1.25rem] pt-1 pb-1 text-ink disabled:opacity-60"
    >
      <span className="relative flex size-28 items-center justify-center rounded-[1.875rem]" style={{ background: down ? "var(--color-frame)" : soft(app.colour) }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- small local pictures; no resizing needed
          <img src={src} alt="" aria-hidden className={`size-[4.5rem] ${down ? "opacity-45 grayscale" : ""}`} />
        ) : (
          <span aria-hidden className={`text-[3.5rem] leading-none ${down ? "opacity-45 grayscale" : ""}`}>
            {app.icon ?? app.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {app.up === true ? <span aria-hidden className="absolute right-1 bottom-1 size-6 rounded-full border-4 border-board bg-success" /> : null}
        {down ? (
          <span aria-hidden className="absolute -right-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full border-4 border-board bg-danger text-base font-extrabold text-board">!</span>
        ) : null}
      </span>
      <span className="max-w-full truncate text-xl font-bold">{app.name}</span>
      {down && app.downSince ? <DownSince since={app.downSince} locale={launcher.locale} timeZone={launcher.timeZone} short /> : null}
    </button>
  );
}

