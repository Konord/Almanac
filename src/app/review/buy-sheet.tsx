"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { Pager } from "@/components/pager";
import { primaryActionClass } from "@/components/ui";
import { hand } from "@/lib/colours";
import type { PreviewLine } from "../groceries/build";
import { CombinedMark, groceryPages } from "../groceries/view";

/*
 * "Review what to buy" (Connor, Nov 15 2026; mock g-final-planner.html).
 * Saving a week with planned meals opens this first: the lines the meals
 * would put on the grocery list, by aisle. Tap anything already in the
 * house: it gets a red X, its name struck through and muted, and it won't
 * go on the list (tap again to undo). "Put the rest on the grocery list"
 * saves the week and sends the rest; "Not now" goes back to the week
 * without saving.
 *
 * Nothing scrolls: aisles fill four columns, balanced like the mock, and a
 * long week goes on pages.
 */

const COLUMNS = 4;
const MAX_ROWS = 12;

/**
 * Whole aisles spread over the four columns, as the mock does: an aisle
 * starts a new column when the aisles left would otherwise not fill them
 * all, or when it doesn't fit. Null when an aisle (or the lot) is too long.
 */
function balanced(lines: PreviewLine[]) {
  const aisles = [...new Set(lines.map((l) => l.aisle))].map((aisle) => lines.filter((l) => l.aisle === aisle));
  const total = aisles.reduce((n, a) => n + a.length + 1, 0);
  const rows = Math.max(Math.ceil(total / COLUMNS), ...aisles.map((a) => a.length + 1));
  if (rows > MAX_ROWS) return null;
  const cols: { aisle: string; first: boolean; lines: PreviewLine[] }[][] = [];
  let used = 0;
  aisles.forEach((a, i) => {
    const size = a.length + 1;
    const col = cols.at(-1);
    if (!col || used + size > rows || aisles.length - i <= COLUMNS - cols.length) {
      cols.push([]);
      used = 0;
    }
    cols.at(-1)!.push({ aisle: a[0].aisle, first: true, lines: a });
    used += size;
  });
  return cols.length <= COLUMNS ? [cols] : null;
}

/** Whole aisles over four columns if they fit; else the fewest rows that keep one page; else pages. */
function layout(lines: PreviewLine[]) {
  const even = balanced(lines);
  if (even) return even;
  const aisles = new Set(lines.map((l) => l.aisle)).size;
  const start = Math.max(4, Math.ceil((lines.length + aisles) / COLUMNS));
  // Best: one page with no aisle split over two columns; then one page; then pages.
  for (const whole of [true, false]) {
    for (let rows = start; rows <= MAX_ROWS; rows++) {
      const pages = groceryPages(lines, rows, COLUMNS);
      if (pages.length === 1 && (!whole || pages[0].every((col) => col.every((part) => part.first)))) return pages;
    }
  }
  return groceryPages(lines, MAX_ROWS, COLUMNS);
}

export function BuySheet({
  lines,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  lines: PreviewLine[];
  saving: boolean;
  error: string | null;
  /** Save the week and put everything but these items on the list. */
  onConfirm: (skipped: string[]) => void;
  onClose: () => void;
}) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const pages = layout(lines);
  const p = Math.min(page, pages.length - 1);
  const toggle = (id: string) => setSkipped((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const combined = lines.some((l) => l.meals.length > 1);

  return (
    <>
      <button type="button" aria-label="Close the review" onClick={onClose} className="fixed inset-0 z-50 bg-[rgb(35_38_43/0.18)]" />
      <div
        role="dialog"
        aria-label="Review what to buy"
        className="fixed inset-x-[3.5rem] top-[2.2rem] bottom-[3.4rem] z-50 flex flex-col gap-[0.85rem] rounded-[1.875rem] bg-board px-[1.6rem] pt-[1.35rem] pb-[1.25rem] shadow-[0_0_2.5rem_rgb(30_35_45/0.25)]"
      >
        <div className="flex shrink-0 items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">Review what to buy</h2>
            <p className="mt-1 text-[1.35rem] font-bold text-ink-soft">From this week&rsquo;s meals. Tap anything you already have &mdash; it won&rsquo;t go on the grocery list.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink">
            <X size="1.5rem" weight="bold" aria-hidden />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 content-start gap-x-[1.4rem]" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
          {pages[p].map((col, i) => (
            <div key={i} className="flex min-w-0 flex-col">
              {col.map((part, j) => (
                <div key={`${part.aisle}-${part.first}`} className={`flex flex-col ${j > 0 ? "mt-[0.8rem]" : ""}`}>
                  <h3 className="text-[1.15rem] font-bold tracking-[0.06em] text-ink-muted uppercase">{part.first ? part.aisle : `${part.aisle} (more)`}</h3>
                  <ul className="flex flex-col">
                    {part.lines.map((l) => {
                      const off = skipped.includes(l.itemId);
                      return (
                        <li key={l.itemId} className="border-b border-frame">
                          <button
                            type="button"
                            onClick={() => toggle(l.itemId)}
                            aria-pressed={off}
                            aria-label={off ? `${l.name}: already have. Tap to buy it after all` : `Skip ${l.name}, already have`}
                            className="flex min-h-[3.6rem] w-full min-w-0 items-center gap-[0.65rem] text-left"
                          >
                            <span
                              aria-hidden
                              className={`flex size-[3rem] shrink-0 items-center justify-center rounded-full border-[0.2rem] ${off ? "border-now bg-now text-white" : "border-check-border"}`}
                            >
                              {off ? <X size="1.4rem" weight="bold" /> : null}
                            </span>
                            <span className="min-w-0 flex-1 leading-[1.1]">
                              <span className={`block truncate font-hand text-[1.5rem] font-bold ${off ? "text-ink-muted line-through" : ""}`} style={off ? undefined : { color: hand(null) }}>
                                {l.name}
                              </span>
                              <span className={`block truncate text-[1.15rem] font-bold text-ink-muted ${off ? "line-through" : ""}`}>{l.meals.join(" · ")}</span>
                            </span>
                            {l.meals.length > 1 ? (
                              <span title="From more than one meal">
                                <CombinedMark />
                              </span>
                            ) : null}
                            {l.need ? <span className="tabular shrink-0 text-[1.25rem] font-bold text-ink-muted">{l.need}</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-[0.8rem]">
          <span className="tabular text-[1.5rem] font-extrabold text-ink">
            {lines.length - skipped.length} to add · {skipped.length} already have
          </span>
          {combined ? (
            <>
              <CombinedMark />
              <span className="text-[1.15rem] font-bold text-ink-muted">from more than one meal</span>
            </>
          ) : null}
          <span className="flex-1" />
          {error ? (
            <span role="alert" className="line-clamp-2 max-w-[30rem] text-right text-[1.15rem] leading-tight font-bold text-danger">
              {error}
            </span>
          ) : null}
          {pages.length > 1 ? <Pager page={p} pages={pages.length} onPage={setPage} /> : null}
          <button type="button" onClick={onClose} disabled={saving} className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-panel px-6 text-[1.25rem] font-bold text-ink">
            Not now
          </button>
          <button type="button" onClick={() => onConfirm(skipped)} disabled={saving} className={`${primaryActionClass} text-[1.25rem] disabled:opacity-70`}>
            {saving ? "Saving…" : "Put the rest on the grocery list"}
          </button>
        </div>
      </div>
    </>
  );
}
