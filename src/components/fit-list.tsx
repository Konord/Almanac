"use client";

import { Pager } from "@/components/pager";
import { useState, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useFitRows } from "./use-fit-rows";

/**
 * A list that shows as many rows as fit in the room it has, and only
 * turns into pages when it's full (Connor, 2026-11-11). For lists a server
 * page draws: it hands over every row, already drawn. `footer` sits beside
 * the page arrows. With a `heading`, the list draws its own title row and
 * the page arrows sit at the right of it, so they don't take a row of
 * their own (Connor, 2026-11-11).
 *
 * `paging="more"` is the quieter Glance version (the Today panel): no
 * arrows in the title row; only when the list is full, one small row under
 * it with "+ N more" (the next page) and, past the first page, "Back".
 */
export function FitList({
  rows,
  fallback,
  className = "",
  footer,
  empty,
  heading,
  aside,
  paging = "pager",
}: {
  rows: ReactNode[];
  /** How many rows to show before the list is measured. */
  fallback: number;
  /** Classes for the list itself (gaps, margins). */
  className?: string;
  footer?: ReactNode;
  /** Shown instead of the rows when there are none. */
  empty?: ReactNode;
  /** A title for the list; the page arrows go beside it. */
  heading?: ReactNode;
  /** Something after the page arrows in the title row (an add button). */
  aside?: ReactNode;
  /** "pager": arrows and "1 of 4"; "more": a quiet "+ N more" row only when full. */
  paging?: "pager" | "more";
}) {
  const [ref, perPage] = useFitRows<HTMLUListElement>(fallback);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const p = Math.min(page, pages - 1);
  const quiet = paging === "more";
  const pager = quiet ? null : <Pager page={p} pages={pages} onPage={setPage} />;
  const inHeading = heading !== undefined;
  const after = rows.length - (p + 1) * perPage;
  const quietButton = "flex min-h-[var(--touch-target)] shrink-0 items-center gap-1.5 rounded-full px-3 text-[1.25rem] leading-none font-bold text-ink-soft";
  return (
    <>
      {inHeading ? (
        <div className="mb-1 flex min-h-12 shrink-0 items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">{heading}</h2>
          {pager}
          {aside}
        </div>
      ) : null}
      <ul ref={ref} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
        {rows.length === 0 ? empty : rows.slice(p * perPage, (p + 1) * perPage)}
      </ul>
      {quiet && pages > 1 ? (
        <div className="flex shrink-0 items-center justify-between">
          {p > 0 ? (
            <button type="button" className={quietButton} onClick={() => setPage(p - 1)} aria-label="Back to the earlier ones">
              <CaretLeft size="1.125rem" weight="bold" aria-hidden />
              Back
            </button>
          ) : (
            <span />
          )}
          {after > 0 ? (
            <button type="button" className={`tabular ${quietButton}`} onClick={() => setPage(p + 1)} aria-label={`Show ${after} more`}>
              + {after} more
              <CaretRight size="1.125rem" weight="bold" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
      {(pages > 1 && !inHeading && !quiet) || footer ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-2">
          {inHeading || quiet ? null : pager}
          {footer}
        </div>
      ) : null}
    </>
  );
}
