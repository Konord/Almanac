"use client";

import { useEffect, useState, useTransition } from "react";
import { CaretLeft, CaretRight, Plus, X } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import { REPEAT_UNITS, type RepeatEvery } from "@/lib/grocery-repeats";
import { addRepeat, readRepeats, removeRepeat, type RepeatsResult } from "./actions";
import type { GroceryLine, GroceryRepeat } from "./data";

/** How many repeats the card lists at once (nothing scrolls). */
const SHOWN = 5;

/**
 * The grocery list's Repeats card (Connor, 2026-11-10): things that put
 * themselves on the list every so often, like milk every week or water
 * filters every 2 months. Adding one puts it on the list now; every change
 * saves straight away, like the list itself.
 */
export function RepeatsCard({ onLines, onClose, dateLabel }: { onLines: (lines: GroceryLine[]) => void; onClose: () => void; dateLabel: (date: string) => string }) {
  const [repeats, setRepeats] = useState<GroceryRepeat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<RepeatEvery>("week");
  const [pending, start] = useTransition();

  const take = (r: RepeatsResult) => {
    if (r.ok) {
      setRepeats(r.repeats);
      onLines(r.lines);
      setError(null);
    } else setError(r.error);
  };
  useEffect(() => {
    let live = true;
    readRepeats().then((r) => live && take(r));
    return () => {
      live = false;
    };
    // Read once when the card opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = repeats ?? [];
  const pages = Math.max(1, Math.ceil(all.length / SHOWN));
  const p = Math.min(page, pages - 1);
  const shown = all.slice(p * SHOWN, p * SHOWN + SHOWN);
  const add = () => {
    if (!name.trim()) return;
    const n = name;
    setName("");
    start(async () => take(await addRepeat({ name: n, every, unit })));
  };
  const control = "h-[var(--touch-target)] rounded-2xl border-2 border-frame bg-rail px-3 text-lg text-ink outline-none focus:border-accent";

  return (
    <div
      className="absolute top-0 right-0 z-20 flex w-[34rem] max-w-full flex-col gap-3 rounded-[1.375rem] border-2 border-frame bg-board p-5 shadow-[0_14px_40px_rgba(35,38,43,0.22)]"
      role="dialog"
      aria-label="Things that repeat"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-2xl font-extrabold text-ink">Repeats</span>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full bg-rail text-ink">
          <X size="1.125rem" weight="bold" aria-hidden />
        </button>
      </div>
      <p className="text-base text-ink-muted">These go on the list by themselves when they come round.</p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Milk" aria-label="What repeats" maxLength={60} className={`${control} min-w-0 flex-1`} />
        <span className="text-base font-bold text-ink-muted">every</span>
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="How many" className={`${control} w-[4.5rem]`}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select value={unit} onChange={(e) => setUnit(e.target.value as RepeatEvery)} aria-label="Days, weeks or months" className={`${control} w-[7.5rem]`}>
          {REPEAT_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {every === 1 ? u.one : u.many}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending || !name.trim()} aria-label="Add a repeat" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-2xl bg-ink text-board disabled:opacity-40">
          <Plus size="1.25rem" weight="bold" aria-hidden />
        </button>
      </form>
      {error ? (
        <p className="text-base font-bold text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {repeats === null ? <li className="text-lg text-ink-muted">Getting them…</li> : null}
        {repeats && repeats.length === 0 ? <li className="text-lg text-ink-muted">Nothing repeats yet.</li> : null}
        {shown.map((r) => (
          <li key={r.id} className="flex min-h-14 items-center gap-3 border-b border-panel last:border-0">
            {r.icon ? <Emoji emoji={r.icon} className="size-8" /> : <span className="size-8 shrink-0" aria-hidden />}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-hand text-[1.375rem] leading-tight text-ink">{r.name}</span>
              <span className="truncate text-sm font-bold text-ink-muted">
                {r.label} · next {dateLabel(r.next_on)}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => take(await removeRepeat(r.id)))}
              aria-label={`Stop ${r.name} repeating`}
              title="Stop repeating"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-rail hover:text-danger"
            >
              <X size="1.125rem" weight="bold" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <button type="button" aria-label="Previous repeats" disabled={p === 0} onClick={() => setPage(p - 1)} className="flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
            <CaretLeft size="1.25rem" weight="bold" aria-hidden />
          </button>
          <span className="text-base font-bold text-ink-muted">
            {p + 1} of {pages}
          </span>
          <button type="button" aria-label="More repeats" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
            <CaretRight size="1.25rem" weight="bold" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
