"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { nowText } from "@/lib/time-text";

/*
 * Fitting today into the agenda panel (Glance spec, "Coming up rule" and
 * "FINAL update"). The page itself never scrolls. In order:
 *
 *   1. All-day chips: as many as fit in one row, then a "+N" chip (the
 *      hidden ones are its tooltip).
 *   2. If the day's cards don't all fit, the finished ones (faded, above
 *      the Now line) are dropped, all of them.
 *   3. "Coming up" only shows when there's room under the cards.
 *   4. If the rest still don't fit, a "+X more" line sits at the bottom;
 *      tapping it scrolls the cards inside the panel (smoothly, or at once
 *      with reduced motion). Cards never shrink.
 *
 * The server draws everything; this marks parts hidden by their data-*
 * names (data-strip, data-chip, data-more-chip, data-cards, data-card,
 * data-past, data-coming, data-more) and runs again whenever the panel
 * changes size or the page is refreshed.
 */
export function AgendaFit({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Bumped by the size watcher, so a resize lays out again.
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (panel) layout(panel);
  });

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const watcher = new ResizeObserver(() => setSize((n) => n + 1));
    watcher.observe(panel);
    // Fonts arriving change the sizes too.
    void document.fonts?.ready.then(() => setSize((n) => n + 1));
    return () => watcher.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-size={size}
      className={className}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("[data-more]")) return;
        const cards = ref.current?.querySelector<HTMLElement>("[data-cards]");
        if (!cards) return;
        const box = cards.getBoundingClientRect();
        const next = [...cards.querySelectorAll<HTMLElement>("[data-card]:not([hidden])")].find((el) => el.getBoundingClientRect().bottom > box.bottom + 2);
        if (!next) return;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        cards.scrollTo({ top: next.offsetTop - cards.offsetTop, behavior: reduced ? "auto" : "smooth" });
      }}
    >
      {children}
    </div>
  );
}

function layout(panel: HTMLElement) {
  fitStrip(panel.querySelector<HTMLElement>("[data-strip]"));

  const cards = panel.querySelector<HTMLElement>("[data-cards]");
  const coming = panel.querySelector<HTMLElement>("[data-coming]");
  const more = panel.querySelector<HTMLButtonElement>("[data-more]");
  if (!cards) return;

  // Start from everything showing.
  cards.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => (el.hidden = false));
  if (coming) coming.hidden = false;
  if (more) more.hidden = true;
  cards.style.overflowY = "visible";
  cards.style.flex = "0 0 auto";

  const style = getComputedStyle(panel);
  const gap = parseFloat(style.rowGap) || 0;
  const inner = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const strip = panel.querySelector<HTMLElement>("[data-strip]");
  const budget = inner - (strip ? strip.offsetHeight + gap : 0);

  // 2. Too many: the finished ones go first, all of them.
  if (cards.scrollHeight > budget + 1) cards.querySelectorAll<HTMLElement>("[data-past]").forEach((el) => (el.hidden = true));

  // 3. Coming up only with room to spare.
  if (coming && cards.scrollHeight + gap + coming.offsetHeight > budget + 1) coming.hidden = true;

  // 4. Still too many: "+X more", and the cards scroll inside the panel.
  const left = budget - (coming && !coming.hidden ? coming.offsetHeight + gap : 0);
  if (cards.scrollHeight > left + 1 && more) {
    more.hidden = false;
    cards.style.overflowY = "auto";
    cards.style.flex = "1 1 auto";
    const box = cards.getBoundingClientRect();
    const below = [...cards.querySelectorAll<HTMLElement>("[data-card]:not([hidden])")].filter((el) => el.getBoundingClientRect().bottom > box.bottom + 2);
    if (below.length === 0) {
      more.hidden = true;
    } else {
      more.textContent = `+${below.length} more`;
      more.setAttribute("aria-label", `Show ${below.length} more ${below.length === 1 ? "thing" : "things"} today`);
    }
  }
}

/** One row of all-day chips; the ones that don't fit go behind "+N". */
function fitStrip(strip: HTMLElement | null) {
  if (!strip) return;
  const chips = [...strip.querySelectorAll<HTMLElement>("[data-chip]")];
  const more = strip.querySelector<HTMLElement>("[data-more-chip]");
  chips.forEach((c) => (c.hidden = false));
  if (more) more.hidden = true;
  const fits = () => strip.scrollWidth <= strip.clientWidth + 1;
  if (fits() || !more) return;
  more.hidden = false;
  const hidden: string[] = [];
  for (let i = chips.length - 1; i >= 0 && !fits(); i--) {
    chips[i].hidden = true;
    hidden.unshift(chips[i].textContent?.trim() ?? "");
    more.textContent = `+${hidden.length}`;
    more.title = hidden.join(", ");
    more.setAttribute("aria-label", `${hidden.length} more all day: ${hidden.join(", ")}`);
  }
}

/** "Now 8:40", ticking over on its own between page refreshes. */
export function NowLabel({ timeZone, locale, initial }: { timeZone: string; locale: string; initial: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setText(nowText(locale, timeZone)), 15_000);
    return () => clearInterval(id);
  }, [locale, timeZone]);
  return <span suppressHydrationWarning>Now {text}</span>;
}

/** "IN 20 MIN" on the next card, while it's 30 minutes away or less. */
export function SoonBadge({ startsAt, initial }: { startsAt: string; initial: number | null }) {
  const [minutes, setMinutes] = useState(initial);
  useEffect(() => {
    const work = () => {
      const left = Math.ceil((new Date(startsAt).getTime() - Date.now()) / 60_000);
      setMinutes(left > 0 && left <= 30 ? left : null);
    };
    const id = setInterval(work, 15_000);
    return () => clearInterval(id);
  }, [startsAt]);
  if (minutes === null) return null;
  return (
    <span className="block text-[1.125rem] leading-none font-extrabold tracking-[0.04em] text-now-on-tint uppercase" suppressHydrationWarning>
      in {minutes} min
    </span>
  );
}
