"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Plus, ShoppingCart } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import { amountText } from "@/lib/meals";
import { addToList, openGroceries, putAllOnList, setOnList, type GroceryLine, type GroceryResult } from "./grocery-actions";
import { CloseButton } from "./parts";

/*
 * The grocery list, opened from the review's header (Connor shops right
 * after the review). It's the live list: each tick saves as you make it.
 * The week's meal ingredients, weekly buys and low backup parts show
 * unticked until you tick them on (suggest, then approve).
 */

/** Rows that fit in one column (an aisle heading takes one too). */
const ROWS_PER_COLUMN = 9;
const COLUMNS = 4;

type Column = { aisle: string; lines: GroceryLine[]; more: number; first: boolean }[];

/** Fills up to four columns aisle by aisle; an aisle that doesn't fit shows "+ N more". */
function layout(lines: GroceryLine[], only: string | null): Column[] {
  const aisles = [...new Set(lines.map((l) => l.aisle))].filter((a) => !only || a === only);
  const columns: Column[] = [[]];
  let used = 0;
  for (const aisle of aisles) {
    let rest = lines.filter((l) => l.aisle === aisle);
    let first = true;
    while (rest.length > 0) {
      if (used + 2 > ROWS_PER_COLUMN) {
        if (columns.length === COLUMNS) {
          // No room left: the last aisle shown says how many more.
          const last = columns[COLUMNS - 1].at(-1);
          if (last) last.more += rest.length;
          return columns;
        }
        columns.push([]);
        used = 0;
      }
      const room = ROWS_PER_COLUMN - used - 1;
      const take = only ? rest.slice(0, room) : rest.slice(0, room);
      const fitsNext = columns.length < COLUMNS;
      // Without a column to spill into, the rest of the aisle becomes "+ N more".
      const more = !fitsNext && rest.length > take.length ? rest.length - take.length : 0;
      columns.at(-1)!.push({ aisle, lines: take, more, first });
      used += take.length + 1;
      rest = more > 0 ? [] : rest.slice(take.length);
      first = false;
    }
  }
  return columns;
}

export function GrocerySheet({ week, dirty, onClose }: { week: string; dirty: boolean; onClose: () => void }) {
  const [lines, setLines] = useState<GroceryLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");

  const take = (r: GroceryResult) => {
    if (r.ok) {
      setLines(r.lines);
      setError(null);
    } else setError(r.error);
  };
  useEffect(() => {
    let live = true;
    openGroceries(week).then((r) => live && take(r));
    return () => {
      live = false;
    };
  }, [week]);

  const run = (f: () => Promise<GroceryResult>) => start(async () => take(await f()));
  const suggested = (lines ?? []).filter((l) => !l.onList).length;
  const onList = (lines ?? []).length - suggested;
  const columns = lines ? layout(lines, only) : [];

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(30,35,45,0.38)]" role="dialog" aria-label="Grocery list" onClick={onClose}>
      <div className="absolute inset-x-[3.75rem] inset-y-[2.5rem] flex flex-col gap-4 overflow-hidden rounded-[1.875rem] bg-board p-7 shadow-2xl max-lg:inset-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <ShoppingCart size="2.5rem" className="text-meal-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-3xl font-extrabold text-ink">Grocery list</h2>
            <p className="text-base text-ink-muted">
              {dirty ? "Save the week to add your meal changes here. " : ""}Ticked things are on the list. Changes save as you go.
            </p>
          </div>
          {only ? (
            <button type="button" onClick={() => setOnly(null)} className="flex min-h-[var(--touch-target)] items-center rounded-2xl bg-rail px-5 text-lg font-bold text-ink">
              All aisles
            </button>
          ) : null}
          {suggested > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => putAllOnList(week))}
              className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-meal px-5 text-lg font-bold text-meal-ink disabled:opacity-60"
            >
              <Check size="1.25rem" weight="bold" aria-hidden />
              Put all {suggested} on the list
            </button>
          ) : null}
          <span className="text-base font-bold text-ink-muted">{lines ? `${onList} on the list` : ""}</span>
          <CloseButton onClick={onClose} />
        </div>
        {error ? (
          <p className="text-base font-bold text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-7 lg:grid-cols-4">
          {lines === null ? <p className="text-lg text-ink-muted">Getting the list…</p> : null}
          {lines && lines.length === 0 ? <p className="col-span-2 text-lg text-ink-muted">Nothing on the list. Plan some meals, or add something below.</p> : null}
          {columns.map((col, i) => (
            <div key={i} className="flex min-w-0 flex-col">
              {col.map((part) => (
                <div key={`${part.aisle}-${part.first}`} className="flex flex-col">
                  <h3 className="mt-1.5 mb-1 flex min-h-7 items-end text-sm font-bold tracking-wide text-ink-muted uppercase">{part.first ? part.aisle : `${part.aisle} (more)`}</h3>
                  {part.lines.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setOnList(week, l.id, !l.onList))}
                      aria-pressed={l.onList}
                      className="flex min-h-[3.25rem] min-w-0 items-center gap-2.5 rounded-xl px-1 text-left hover:bg-rail"
                    >
                      <span
                        className={`flex size-7.5 shrink-0 items-center justify-center rounded-lg border-[0.15rem] ${l.onList ? "border-ink bg-ink text-board" : "border-check-border bg-board"}`}
                        aria-hidden
                      >
                        {l.onList ? <Check size="1.1rem" weight="bold" /> : null}
                      </span>
                      {l.icon ? <Emoji emoji={l.icon} className="size-7" /> : null}
                      <span className="flex min-w-0 flex-col">
                        <span className={`truncate font-hand text-[1.375rem] leading-tight ${l.onList ? "text-ink" : "text-ink-muted"}`}>
                          {l.name} <span className="font-sans text-sm font-bold text-ink-muted">{amountText(l.amount, l.unit)}</span>
                        </span>
                        {l.detail ? <span className="truncate text-[0.8125rem] font-bold text-ink-muted">{l.onList ? l.detail : `Suggested: ${l.detail}`}</span> : null}
                      </span>
                    </button>
                  ))}
                  {part.more > 0 ? (
                    <button type="button" onClick={() => setOnly(part.aisle)} className="flex min-h-10 items-center px-1 text-left text-base font-bold text-accent">
                      + {part.more} more
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <form
          className="flex gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const input = { name, amount, unit };
            setName("");
            setAmount("");
            setUnit("");
            run(() => addToList(week, input));
          }}
        >
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2" aria-label="How many" className="h-[var(--touch-target)] w-24 rounded-2xl border-2 border-frame px-4 text-lg" />
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="L" aria-label="Unit" className="h-[var(--touch-target)] w-24 rounded-2xl border-2 border-frame px-4 text-lg" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add something else" aria-label="Something to buy" className="h-[var(--touch-target)] min-w-0 flex-1 rounded-2xl border-2 border-frame px-4 text-lg" />
          <button type="submit" disabled={pending || !name.trim()} className="flex h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-ink px-6 text-lg font-bold text-board disabled:opacity-40">
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
