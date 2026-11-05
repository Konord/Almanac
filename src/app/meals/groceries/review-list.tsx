"use client";

import { useState } from "react";
import { CaretLeft, CaretRight, Check } from "@phosphor-icons/react";
import { emojiImage } from "@/lib/emoji";
import { approveGroceries } from "../actions";

/*
 * Checking the suggestions before they go on the list: everything starts
 * ticked; untick what you already have, then approve.
 */

export type ReviewLine = { id: string; name: string; icon: string | null; amount: string; detail: string | null; source: "meal" | "weekly" | "backup" | "manual" };

const PAGE = 10;
const WHY: Record<ReviewLine["source"], string> = { meal: "🍽️", weekly: "🔁", backup: "🛟", manual: "✏️" };

export function ReviewList({ lines, week, returnTo }: { lines: ReviewLine[]; week: string; returnTo: string }) {
  const [dropped, setDropped] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(lines.length / PAGE));
  const p = Math.min(page, pages - 1);
  const keep = lines.filter((l) => !dropped.includes(l.id));

  return (
    <form action={approveGroceries} className="flex min-h-0 flex-1 flex-col gap-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="week" value={week} />
      {keep.map((l) => (
        <input key={l.id} type="hidden" name="keep" value={l.id} />
      ))}
      <p className="text-lg text-ink-muted">Untick anything you already have.</p>
      <ul className="flex min-h-0 flex-1 flex-col gap-1">
        {lines.slice(p * PAGE, (p + 1) * PAGE).map((l) => {
          const on = !dropped.includes(l.id);
          const src = l.icon ? emojiImage(l.icon) : null;
          return (
            <li key={l.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setDropped((d) => (on ? [...d, l.id] : d.filter((x) => x !== l.id)))}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-1 text-left ${on ? "" : "opacity-45"}`}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-ink bg-ink text-board" : "border-check-border"}`}>
                  {on ? <Check size="1.25rem" weight="bold" aria-hidden /> : null}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element -- small local pictures */}
                {src ? <img src={src} alt="" aria-hidden className="size-8" /> : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-xl font-bold text-ink ${on ? "" : "line-through"}`}>
                    {l.name}
                    {l.amount ? <span className="font-normal text-ink-muted"> · {l.amount}</span> : null}
                  </span>
                  {l.detail ? (
                    <span className="truncate text-base text-ink-muted">
                      {WHY[l.source]} {l.detail}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex shrink-0 items-center gap-3 border-t border-frame pt-3">
        {pages > 1 ? (
          <>
            <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)} className="flex size-12 items-center justify-center rounded-full bg-rail disabled:opacity-30">
              <CaretLeft size="1.25rem" weight="bold" aria-hidden />
            </button>
            <span className="text-lg font-bold text-ink-muted">
              {p + 1} of {pages}
            </span>
            <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="flex size-12 items-center justify-center rounded-full bg-rail disabled:opacity-30">
              <CaretRight size="1.25rem" weight="bold" aria-hidden />
            </button>
          </>
        ) : null}
        <button className="ml-auto inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-ink px-5 text-lg font-bold text-board">
          Put {keep.length} on the list
        </button>
      </div>
    </form>
  );
}
