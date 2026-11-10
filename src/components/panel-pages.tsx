"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * A list in the Today panel, a page at a time (nothing scrolls).
 *
 * The rows are made on the server (their tick buttons are server actions) and
 * handed over already split into pages; this part only remembers which page
 * is showing and draws the arrows. The link at the bottom left still opens
 * the full screen for that list.
 */
export function PanelPages({ pages, link }: { pages: ReactNode[]; link: { href: string; label: string } }) {
  const [wanted, setPage] = useState(0);
  // Ticking a row can leave fewer pages than before: stay on the last one.
  const page = Math.min(wanted, Math.max(0, pages.length - 1));
  const arrow =
    "flex h-11 w-14 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30";

  return (
    <>
      {pages[page] ?? null}
      <div className="mt-auto flex min-h-11 items-center gap-2">
        <Link href={link.href} className="flex min-h-11 min-w-0 flex-1 items-center truncate text-lg font-bold text-accent">
          {link.label}
        </Link>
        {pages.length > 1 ? (
          <>
            <button type="button" aria-label="Previous page" className={arrow} disabled={page === 0} onClick={() => setPage(page - 1)}>
              <CaretLeft size="1.5rem" weight="bold" aria-hidden />
            </button>
            <span className="shrink-0 text-lg font-bold text-ink-muted tabular-nums">
              {page + 1} of {pages.length}
            </span>
            <button
              type="button"
              aria-label="Next page"
              className={arrow}
              disabled={page >= pages.length - 1}
              onClick={() => setPage(page + 1)}
            >
              <CaretRight size="1.5rem" weight="bold" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
