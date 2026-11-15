"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Check } from "@phosphor-icons/react";

/*
 * A row on the Daily List (Glance spec, "Daily List check-off"). Tapping
 * the circle:
 *
 *   1. fills the circle with a tick;
 *   2. draws a slightly wobbly marker stroke across the words, left to
 *      right, in 400 ms, in the row's ink;
 *   3. holds for 180 ms;
 *   4. fades and folds the row away in 300 ms (the rows below slide up).
 *
 * With "reduce motion" on, there's no stroke: a quick 160 ms fade.
 * Then the tick is saved (the server action the row was given), which
 * takes the row off the list for good.
 */

const STROKE_MS = 400;
const HOLD_MS = 180;
const LEAVE_MS = 300;
const QUICK_MS = 160;

export function ScratchRow({
  action,
  fields,
  title,
  ink,
  icon,
  meta,
}: {
  /** The server action that ticks it off (toggleTodo, toggleStep, tickSteps). */
  action: (formData: FormData) => Promise<void>;
  /** The form's hidden fields. */
  fields: [string, string][];
  title: string;
  /** The writer's ink (a CSS colour). */
  ink: string;
  /** The picture, drawn in the reserved slot on the right. */
  icon?: ReactNode;
  /** A time or a count, before the picture. */
  meta?: ReactNode;
}) {
  const [phase, setPhase] = useState<"open" | "ticked" | "scratching" | "leaving">("open");
  const [, startTransition] = useTransition();
  const busy = useRef(false);

  const save = () => {
    const data = new FormData();
    for (const [name, value] of fields) data.append(name, value);
    startTransition(async () => {
      await action(data);
    });
  };

  const tick = () => {
    if (busy.current) return;
    busy.current = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("leaving");
      setTimeout(save, QUICK_MS);
      return;
    }
    setPhase("ticked");
    // Next frame, so the stroke starts from nothing and draws across.
    requestAnimationFrame(() => setPhase("scratching"));
    setTimeout(() => setPhase("leaving"), STROKE_MS + HOLD_MS);
    setTimeout(save, STROKE_MS + HOLD_MS + LEAVE_MS);
  };

  const ticked = phase !== "open";
  return (
    <li
      className={`scratch-row flex min-h-[var(--touch-target)] items-center gap-4 overflow-hidden border-b border-frame last:border-b-0 ${
        phase === "scratching" || phase === "leaving" ? "is-scratching" : ""
      } ${phase === "leaving" ? "is-leaving" : ""}`}
      style={{ color: ink }}
    >
      <button
        type="button"
        onClick={tick}
        aria-label={ticked ? `Done: ${title}` : `Tick off ${title}`}
        aria-pressed={ticked}
        className="flex size-12 shrink-0 items-center justify-center"
      >
        <span
          className={`flex size-10 items-center justify-center rounded-full border-[0.2rem] ${
            ticked ? "border-success bg-success text-white" : "border-check-border"
          }`}
        >
          {ticked ? <Check size="1.5rem" weight="bold" aria-hidden /> : null}
        </span>
      </button>
      <span className="relative min-w-0 flex-1 py-1">
        <span className="line-clamp-2 font-hand text-[1.375rem] leading-[1.15] break-words">{title}</span>
        <svg className="scratch-stroke" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden>
          <path pathLength={1} d="M3 9.2 C 22 5.2, 38 12.4, 58 8.1 S 96 13.2, 118 7.4 S 158 12.6, 197 8.3" />
        </svg>
      </span>
      {meta ? <span className="tabular shrink-0 text-lg font-semibold text-ink-soft">{meta}</span> : null}
      <span className="flex w-[var(--touch-target)] shrink-0 items-center justify-center">{icon}</span>
    </li>
  );
}
