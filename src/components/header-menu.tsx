"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react";

/**
 * The header's "more" button (⋯): a small card of links that don't need a
 * place on the screen all the time, like Holidays and Templates on Month.
 * Tapping a link, tapping anywhere else or Escape closes it.
 */
export function HeaderMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink ${open ? "bg-tab-on text-tab-on-ink shadow-raised" : "bg-panel"}`}
      >
        <DotsThree size="1.75rem" weight="bold" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          // A link inside closes the card as it goes.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className="absolute top-full right-0 z-40 mt-2 flex min-w-[16rem] flex-col gap-1 rounded-[var(--radius-card)] bg-board p-2 shadow-raised"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** One line in the header menu: a picture or icon and a name, 48px+ tall. */
export const headerMenuItemClass =
  "flex min-h-[var(--touch-target)] items-center gap-3 rounded-[var(--radius)] px-4 text-lg font-bold whitespace-nowrap text-ink hover:bg-panel";
