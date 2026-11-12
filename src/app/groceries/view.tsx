"use client";

import { Pager } from "@/components/pager";
import { useEffect, useState, useTransition } from "react";
import { ArrowsClockwise, Check, Plus, Stack, X } from "@phosphor-icons/react";
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
 * fill columns, and further columns go on pages.
 */

type Part = { aisle: string; first: boolean; lines: GroceryLine[] };
type Column = Part[];

/** Fills columns aisle by aisle (an aisle heading takes a row); columns beyond the page go on the next one. */
export function groceryPages(lines: GroceryLine[], rows: number, columns: number): Column[][] {
  const cols: Column[] = [];
  let col: Column = [];
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
  const pages: Column[][] = [];
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
  const pages = groceryPages(all, rows, compact ? 1 : columns);
  const p = Math.min(page, pages.length - 1);
  const openLine = all.find((l) => l.id === open);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <form
        className="flex shrink-0 items-center gap-2.5"
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
          className={`h-[var(--touch-target)] min-w-0 flex-1 rounded-2xl border-2 border-frame bg-rail px-4 text-lg text-ink outline-none focus:border-accent ${compact ? "" : "max-w-[44rem]"}`}
        />
        <button type="submit" disabled={pending || !name.trim()} className="flex h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl bg-ink px-5 text-lg font-bold text-board disabled:opacity-40">
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Add
        </button>
        {compact || !all.some((l) => l.parts.length > 1) ? null : (
          <>
            <div className="flex-1" />
            <span className="inline-flex items-center gap-2 text-base text-ink-soft">
              <CombinedMark count={2} />
              from more than one meal
            </span>
          </>
        )}
      </form>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-base font-bold text-ink-muted">{lines === null ? "Getting the list…" : `${toGet} to get${got ? ` · ${got} got` : ""}`}</span>
        {note ? <span className="truncate text-base text-ink-muted">{note}</span> : null}
        <div className="flex-1" />
        <Pager page={p} pages={pages.length} onPage={setPage} />
        {compact ? null : (
          <button
            type="button"
            onClick={() => setRepeatsOpen(!repeatsOpen)}
            aria-expanded={repeatsOpen}
            className="flex min-h-12 items-center gap-2 rounded-2xl bg-rail px-4 text-base font-bold text-ink hover:bg-panel"
          >
            <ArrowsClockwise size="1.125rem" weight="bold" aria-hidden />
            Repeats
          </button>
        )}
        {got > 0 ? (
          <button type="button" disabled={pending} onClick={() => run(clearTickedGroceries)} className="flex min-h-12 items-center rounded-2xl bg-rail px-4 text-base font-bold text-ink hover:bg-panel">
            Clear ticked
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-base font-bold text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className={`grid min-h-0 flex-1 content-start gap-x-7 ${compact ? "grid-cols-1" : ""}`} style={compact ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {lines && lines.length === 0 ? <p className="col-span-full text-lg text-ink-muted">Nothing on the list.</p> : null}
        {pages[p].map((col, i) => (
          <div key={i} className="flex min-w-0 flex-col">
            {col.map((part) => (
              <div key={`${part.aisle}-${part.first}`} className="flex flex-col">
                <h3 className={`flex items-end border-b-2 border-frame pb-1 text-sm font-bold tracking-wide text-ink-muted uppercase ${compact ? "mt-1 min-h-8" : "mt-1.5 mb-1 min-h-9"}`}>
                  {part.first ? part.aisle : `${part.aisle} (more)`}
                </h3>
                {part.lines.map((l) => (
                  <div key={l.id} className={`flex min-w-0 items-center gap-2 rounded-xl ${compact ? "min-h-[3.25rem]" : "min-h-[3.75rem]"} ${open === l.id ? "bg-[color-mix(in_srgb,var(--color-meal)_45%,white)]" : ""}`}>
                    <button type="button" onClick={() => tick(l)} aria-pressed={l.checked} className="flex min-h-[inherit] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 text-left hover:bg-rail">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-[0.15rem] ${l.checked ? "border-success bg-success text-board" : "border-check-border bg-board"}`}
                        aria-hidden
                      >
                        {l.checked ? <Check size="1.1rem" weight="bold" /> : null}
                      </span>
                      {l.icon && !compact ? <Emoji emoji={l.icon} className="size-7" /> : null}
                      <span className="flex min-w-0 flex-col">
                        <span className={`truncate font-hand text-[1.375rem] leading-tight ${l.checked ? "text-ink-muted line-through" : "text-ink"}`}>{l.name}</span>
                        {l.need || l.detail ? (
                          <span className="truncate text-sm font-bold text-ink-muted">{l.need || (l.source === "repeat" ? l.detail : "")}</span>
                        ) : null}
                      </span>
                    </button>
                    {l.parts.length > 1 ? (
                      <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} aria-label={`What ${l.name} is for`} aria-expanded={open === l.id} className="flex min-h-11 shrink-0 items-center rounded-xl px-1">
                        <CombinedMark count={l.parts.length} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

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
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="flex size-11 items-center justify-center rounded-full bg-rail text-ink">
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
export function CombinedMark({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-meal px-1.5 py-0.5 text-sm font-extrabold text-meal-ink">
      <Stack size="0.9rem" weight="bold" aria-hidden />
      {count}
    </span>
  );
}
