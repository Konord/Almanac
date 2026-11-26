"use client";

import { Pager } from "@/components/pager";
import { useEffect, useState, useTransition } from "react";
import { ArrowsClockwise, Plus, Stack, X } from "@phosphor-icons/react";
import { ListRow } from "@/components/list-row";
import { hand } from "@/lib/colours";
import { Emoji } from "@/components/ui";
import { addGrocery, clearTickedGroceries, readGroceries, tickGrocery, type GroceriesResult } from "./actions";
import type { GroceryLine } from "./data";
import { RepeatsCard } from "./repeats";

/*
 * The grocery list (Connor, 2026-11-10): one list, shown in the List
 * Manager, from the weekly review's header and as a chip on the Today
 * panel. Saving the review puts the menu's ingredients on it. You cross
 * off what you have, add anything else, then tick things off in the
 * store. Every tap saves straight away.
 *
 * Lines added together from more than one meal carry a small stacked
 * mark; tapping it shows which meals they're for. Nothing scrolls: aisles
 * fill columns, and further columns go on pages. Each line is the shared
 * ListRow (like the Daily List): round tick, the name handwritten, the
 * amount on the right. Ticked lines stay, muted, until Clear ticked.
 */

type Part<T> = { aisle: string; first: boolean; lines: T[] };
type Column<T> = Part<T>[];

/** Fills columns aisle by aisle (an aisle heading takes a row); columns beyond the page go on the next one. */
export function groceryPages<T extends { aisle: string }>(lines: T[], rows: number, columns: number): Column<T>[][] {
  const cols: Column<T>[] = [];
  let col: Column<T> = [];
  let used = 0;
  const aisles = [...new Set(lines.map((l) => l.aisle))];
  for (const aisle of aisles) {
    let rest = lines.filter((l) => l.aisle === aisle);
    let first = true;
    while (rest.length > 0) {
      if (used + 2 > rows) {
        cols.push(col);
        col = [];
        used = 0;
      }
      const take = rest.slice(0, rows - used - 1);
      col.push({ aisle, first, lines: take });
      used += take.length + 1;
      rest = rest.slice(take.length);
      first = false;
    }
  }
  if (col.length) cols.push(col);
  const pages: Column<T>[][] = [];
  for (let i = 0; i < cols.length; i += columns) pages.push(cols.slice(i, i + columns));
  return pages.length ? pages : [[]];
}

export function GroceryView({
  initial,
  rows = 9,
  columns = 5,
  compact = false,
  note,
}: {
  /** The lines as the page read them; without, the list is read when it opens. */
  initial?: GroceryLine[];
  /** Lines (and aisle headings) per column. */
  rows?: number;
  columns?: number;
  /** For the Today panel: one column, smaller. */
  compact?: boolean;
  /** A line under the header, e.g. "Save the week to add your meal changes." */
  note?: string;
}) {
  const [lines, setLines] = useState<GroceryLine[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [repeatsOpen, setRepeatsOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const take = (r: GroceriesResult) => {
    if (r.ok) {
      setLines(r.lines);
      setError(null);
    } else setError(r.error);
  };
  useEffect(() => {
    if (initial) return;
    let live = true;
    readGroceries().then((r) => live && take(r));
    return () => {
      live = false;
    };
  }, [initial]);

  const run = (f: () => Promise<GroceriesResult>) => start(async () => take(await f()));
  const tick = (l: GroceryLine) => {
    // Show it straight away; the server's answer follows.
    setLines((ls) => (ls ? ls.map((x) => (x.id === l.id ? { ...x, checked: !l.checked } : x)) : ls));
    run(() => tickGrocery(l.id, !l.checked));
  };
  const add = () => {
    if (!name.trim()) return;
    const n = name;
    setName("");
    run(() => addGrocery(n));
  };

  const all = lines ?? [];
  const toGet = all.filter((l) => !l.checked).length;
  const got = all.length - toGet;
  // A list that fits on one page is spread over all the columns, shortest first, so it
  // uses the width instead of leaving the last columns empty (UI audit M3).
  const cols = compact ? 1 : columns;
  let fit = rows;
  if (!compact && groceryPages(all, rows, cols).length === 1) {
    const aisles = new Set(all.map((l) => l.aisle)).size;
    for (let r = Math.max(2, Math.ceil((all.length + aisles) / cols)); r < rows; r++) {
      if (groceryPages(all, r, cols).length === 1) {
        fit = r;
        break;
      }
    }
  }
  const pages = groceryPages(all, fit, cols);
  const p = Math.min(page, pages.length - 1);
  const openLine = all.find((l) => l.id === open);

  // The add box: at the top of the Groceries page, at the bottom of the Today
  // panel like every other list there (Connor, 2026-11-26).
  const addForm = (
      <form
        className={`flex shrink-0 items-center gap-2.5 ${compact ? "border-t border-frame pt-2" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={compact ? undefined : "Add something"}
          aria-label="Something to buy"
          maxLength={60}
          className={`h-[var(--touch-target)] min-w-0 flex-1 rounded-[var(--radius)] border-2 border-frame bg-board px-4 font-bold text-ink outline-none placeholder:text-ink-muted focus:border-accent ${compact ? "text-xl" : "max-w-[36rem] text-[1.5rem]"}`}
        />
        <button type="submit" disabled={pending} className="flex h-[var(--touch-target)] shrink-0 items-center gap-[0.6rem] rounded-[var(--radius)] bg-primary px-6 text-[1.25rem] font-bold text-primary-ink disabled:opacity-60">
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Add
        </button>
        {compact || !all.some((l) => l.parts.length > 1) ? null : (
          <>
            <div className="flex-1" />
            <span className="inline-flex items-center gap-2 text-[1.15rem] font-bold text-ink-muted">
              <CombinedMark />
              from more than one meal
            </span>
          </>
        )}
      </form>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      {compact ? null : addForm}

      <div className="flex shrink-0 items-center gap-3">
        <span className="tabular text-[1.25rem] font-bold text-ink-muted">{lines === null ? "Getting the list…" : `${toGet} to get${got ? ` · ${got} got` : ""}`}</span>
        {note ? <span className="truncate text-base text-ink-muted">{note}</span> : null}
        <div className="flex-1" />
        <Pager page={p} pages={pages.length} onPage={setPage} />
        {compact ? null : (
          <button
            type="button"
            onClick={() => setRepeatsOpen(!repeatsOpen)}
            aria-expanded={repeatsOpen}
            className="flex min-h-[var(--touch-target)] items-center gap-[0.6rem] rounded-[var(--radius)] bg-panel px-6 text-[1.25rem] font-bold text-ink"
          >
            <ArrowsClockwise size="1.125rem" weight="bold" aria-hidden />
            Repeats
          </button>
        )}
        {got > 0 ? (
          <button type="button" disabled={pending} onClick={() => run(clearTickedGroceries)} className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-panel px-6 text-[1.25rem] font-bold text-ink">
            Clear ticked
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-base font-bold text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className={`grid min-h-0 flex-1 content-start gap-x-[1.15rem] ${compact ? "grid-cols-1" : ""}`} style={compact ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {lines && lines.length === 0 ? <p className="col-span-full text-xl text-ink-muted">Nothing on the list.</p> : null}
        {pages[p].map((col, i) => (
          <div key={i} className="flex min-w-0 flex-col">
            {col.map((part) => (
              <div key={`${part.aisle}-${part.first}`} className="flex flex-col">
                <h3 className={`flex items-end text-[1.15rem] font-bold tracking-[0.06em] text-ink-muted uppercase ${compact ? "mt-1 min-h-8" : "mt-1 min-h-9"}`}>
                  {part.first ? part.aisle : `${part.aisle} (more)`}
                </h3>
                <ul className="flex flex-col">
                  {part.lines.map((l) => (
                    <ListRow
                      key={l.id}
                      size={compact ? "panel" : "page"}
                      title={l.name}
                      // Grocery lines aren't anyone's: dark ink.
                      ink={hand(null)}
                      done={l.checked}
                      tick={{ onTick: () => tick(l) }}
                      highlight={open === l.id}
                      sub={!l.need && l.source === "repeat" && l.detail ? l.detail : undefined}
                      badge={
                        l.parts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setOpen(open === l.id ? null : l.id)}
                            aria-label={`What ${l.name} is for (${l.parts.length} meals)`}
                            aria-expanded={open === l.id}
                            className="-mx-1.5 flex size-12 shrink-0 items-center justify-center"
                          >
                            <CombinedMark />
                          </button>
                        ) : null
                      }
                      meta={l.need ? l.need.replace(/ needed for meals$/, "") : null}
                      icon={l.icon ? <Emoji emoji={l.icon} className="size-8" faded={l.checked} /> : null}
                      iconAt="start"
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>

      {compact ? addForm : null}

      {repeatsOpen ? (
        <div className="absolute top-[7.5rem] right-0 left-0">
          <RepeatsCard
            onLines={setLines}
            onClose={() => setRepeatsOpen(false)}
            dateLabel={(d) => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}
          />
        </div>
      ) : null}

      {openLine ? (
        <div className="absolute top-[7.5rem] left-1/2 z-10 flex w-[28rem] max-w-full -translate-x-1/2 flex-col gap-2.5 rounded-[1.375rem] border-2 border-meal bg-board p-5 shadow-[0_14px_40px_rgba(35,38,43,0.22)]" role="dialog" aria-label={`${openLine.name}: what it's for`}>
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-2xl font-extrabold text-ink">
              {openLine.name}
              {openLine.need ? <span className="text-lg font-bold text-ink-muted"> · {openLine.need.replace(/ needed for meals$/, "")}</span> : null}
            </span>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="flex size-12 items-center justify-center rounded-full bg-rail text-ink">
              <X size="1.125rem" weight="bold" aria-hidden />
            </button>
          </div>
          {openLine.parts.slice(0, 6).map((part, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-lg">
              <span className="truncate text-ink">{part.label}</span>
              <b className="shrink-0 text-ink">{part.text || "some"}</b>
            </div>
          ))}
          {openLine.parts.length > 6 ? <span className="text-base text-ink-muted">and {openLine.parts.length - 6} more</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The small stacked mark on lines added together from more than one meal. */
export function CombinedMark() {
  return (
    <span className="inline-flex size-[1.5rem] shrink-0 items-center justify-center rounded-[0.35rem] bg-meal text-meal-ink" aria-hidden>
      <Stack size="1rem" weight="bold" />
    </span>
  );
}
