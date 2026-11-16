"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Check } from "@phosphor-icons/react";

/*
 * One row of a list, the same everywhere a list is ticked off: the Daily
 * List (Today panel), the lists on the Lists screen, the Chores list and
 * the grocery list. A round tick on the left, the words handwritten in the
 * writer's ink (dark ink when it isn't anyone's), then whatever the list
 * needs on the right (a time, an amount, who, a picture).
 *
 * Two ways to tick:
 *
 * - `action` (a server action with its form fields): the row leaves the
 *   list once it's saved. Ticking an open row draws the marker stroke
 *   (Glance spec, "Daily List check-off"):
 *     1. the circle fills with a tick;
 *     2. a slightly wobbly marker stroke crosses the words, left to right,
 *        in 400 ms, in the row's ink;
 *     3. it holds for 180 ms;
 *     4. the row fades and folds away in 300 ms (the rows below slide up).
 *   Unticking a done row just folds it away. With "reduce motion" on,
 *   there's no stroke: a quick 160 ms fade. Then the tick is saved.
 * - `onTick` (for lists that keep their ticked rows, like groceries): the
 *   row stays and shows `done`; the list saves it.
 */

const STROKE_MS = 400;
const HOLD_MS = 180;
const LEAVE_MS = 300;
const QUICK_MS = 160;

type Tick =
  | { action: (formData: FormData) => Promise<void>; fields: [string, string][]; onTick?: never }
  | { onTick: () => void; action?: never; fields?: never };

export function ListRow({
  title,
  ink,
  done = false,
  tick,
  lead,
  editHref,
  sub,
  badge,
  meta,
  icon,
  slot = false,
  iconAt = "end",
  end,
  size = "panel",
  highlight = false,
}: {
  title: string;
  /** The writer's ink (a CSS colour, from `hand()`). */
  ink: string;
  /** Already ticked (the done pile, a ticked grocery): circle filled, words muted. */
  done?: boolean;
  /** What ticking does. Leave out when `lead` replaces the tick. */
  tick?: Tick;
  /** Something in the tick's place (e.g. the › of "Start dinner"). */
  lead?: ReactNode;
  /** Tapping the words opens the row for editing. */
  editHref?: string;
  /** A small printed line under the words (tags, where it's from). */
  sub?: ReactNode;
  /** A small mark right after the words (e.g. "from more than one meal"). */
  badge?: ReactNode;
  /** A time, a count or an amount, on the right. */
  meta?: ReactNode;
  /** The picture. */
  icon?: ReactNode;
  /** Keep a place for the picture even when there's none, so the column lines up. */
  slot?: boolean;
  /** Where the picture goes: before the words, or (the Daily List) on the right. */
  iconAt?: "start" | "end";
  /** Last thing on the right (who, "Add to Daily list"). */
  end?: ReactNode;
  /** "panel": the Daily List's size. "page": the Lists screen's (a little bigger). */
  size?: "panel" | "page";
  /** Shown as picked (e.g. while its "what it's for" card is open). */
  highlight?: boolean;
}) {
  const [phase, setPhase] = useState<"open" | "ticked" | "scratching" | "leaving">("open");
  const [, startTransition] = useTransition();
  const busy = useRef(false);

  const save = () => {
    if (!tick?.action) return;
    const data = new FormData();
    for (const [name, value] of tick.fields) data.append(name, value);
    const action = tick.action;
    startTransition(async () => {
      await action(data);
    });
  };

  const onTap = () => {
    if (!tick) return;
    if (tick.onTick) {
      tick.onTick();
      return;
    }
    if (busy.current) return;
    busy.current = true;
    // Unticking a done row, or reduced motion: no stroke, just fold away.
    if (done || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("leaving");
      setTimeout(save, done ? LEAVE_MS : QUICK_MS);
      return;
    }
    setPhase("ticked");
    // Next frame, so the stroke starts from nothing and draws across.
    requestAnimationFrame(() => setPhase("scratching"));
    setTimeout(() => setPhase("leaving"), STROKE_MS + HOLD_MS);
    setTimeout(save, STROKE_MS + HOLD_MS + LEAVE_MS);
  };

  const page = size === "page";
  // Ticking a done row shows it going back to open; anything else, ticked.
  const ticked = phase === "open" ? done : !done;
  const words = (
    <>
      <span className="relative block">
        <span className={`line-clamp-2 font-hand leading-[1.15] break-words ${page ? "text-[1.5rem]" : "text-[1.375rem]"}`} style={done ? undefined : { color: ink }}>
          {title}
        </span>
        <svg className="scratch-stroke" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden style={{ color: ink }}>
          <path pathLength={1} d="M3 9.2 C 22 5.2, 38 12.4, 58 8.1 S 96 13.2, 118 7.4 S 158 12.6, 197 8.3" />
        </svg>
      </span>
      {sub ? <span className="mt-0.5 block truncate text-[1.125rem] font-bold text-ink-muted">{sub}</span> : null}
    </>
  );

  return (
    <li
      className={`scratch-row flex min-h-[var(--touch-target)] min-w-0 items-center border-b border-frame last:border-b-0 ${page ? "gap-3 py-[0.2rem]" : "gap-4"} ${
        done ? "text-ink-muted" : ""
      } ${phase === "scratching" || phase === "leaving" ? "is-scratching" : ""} ${phase === "leaving" ? "is-leaving" : ""} ${
        highlight ? "rounded-xl bg-[color-mix(in_srgb,var(--color-meal)_45%,white)]" : ""
      }`}
    >
      {lead ??
        (tick ? (
          <button
            type="button"
            onClick={onTap}
            aria-label={done ? `Untick ${title}` : `Tick off ${title}`}
            aria-pressed={ticked}
            className="flex size-12 shrink-0 items-center justify-center"
          >
            <span
              className={`flex items-center justify-center rounded-full border-[0.2rem] ${page ? "size-12" : "size-10"} ${
                ticked ? "border-success bg-success text-white" : "border-check-border"
              }`}
            >
              {ticked ? <Check size={page ? "1.25rem" : "1.5rem"} weight="bold" aria-hidden /> : null}
            </span>
          </button>
        ) : null)}
      {iconAt === "start" && icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
      {editHref ? (
        <Link href={editHref} scroll={false} className="min-w-0 flex-1 py-1">
          {words}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 py-1">{words}</span>
      )}
      {badge}
      {meta ? (
        <span className={`tabular shrink-0 ${page ? "text-[1.25rem] font-bold text-ink-muted" : "text-lg font-semibold text-ink-soft"}`}>{meta}</span>
      ) : null}
      {iconAt === "end" && (icon || slot) ? <span className={`flex shrink-0 items-center justify-center ${page ? "w-10" : "w-[var(--touch-target)]"}`}>{icon}</span> : null}
      {end}
    </li>
  );
}
