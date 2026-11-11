"use client";

import { useState, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useFitRows } from "./use-fit-rows";

/**
 * A list that shows as many rows as fit in the room it has, and only
 * turns into pages when it's full (Connor, 2026-11-11). For lists a server
 * page draws: it hands over every row, already drawn. `footer` sits beside
 * the page arrows. With a `heading`, the list draws its own title row and
 * the page arrows sit at the right of it, so they don't take a row of
 * their own (Connor, 2026-11-11).
 */
export function FitList({
  rows,
  fallback,
  className = "",
  footer,
  empty,
  heading,
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
}) {
  const [ref, perPage] = useFitRows<HTMLUListElement>(fallback);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const p = Math.min(page, pages - 1);
  const arrow = "flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30";
  const pager =
    pages > 1 ? (
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)} className={arrow}>
          <CaretLeft size="1.25rem" weight="bold" aria-hidden />
        </button>
        <span className="min-w-16 text-center text-base font-bold text-ink-muted">
          {p + 1} of {pages}
        </span>
        <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className={arrow}>
          <CaretRight size="1.25rem" weight="bold" aria-hidden />
        </button>
      </div>
    ) : null;
  const inHeading = heading !== undefined;
  return (
    <>
      {inHeading ? (
        <div className="mb-1 flex min-h-12 shrink-0 items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">{heading}</h2>
          {pager}
        </div>
      ) : null}
      <ul ref={ref} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
        {rows.length === 0 ? empty : rows.slice(p * perPage, (p + 1) * perPage)}
      </ul>
      {(pages > 1 && !inHeading) || footer ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-2">
          {inHeading ? null : pager}
          {footer}
        </div>
      ) : null}
    </>
  );
}
