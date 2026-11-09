"use client";

import { useState, type ReactNode } from "react";
import { updatePending, usePending } from "@/components/pending-store";
import { lengthLabel } from "@/lib/quick-times";

/** Ready-made lengths, in minutes. */
const PRESETS = [30, 60, 120];

/**
 * How long an event lasts, set with buttons: a few ready-made lengths,
 * or nudge it 15 minutes at a time. Sends "minutes" with the form.
 * With `allowPoint`, "No length" makes the event a point: a time with no
 * length ("Homework due 9am"), sent as 0 minutes.
 */
export function LengthControl({ initial, allowPoint = false }: { initial: number; allowPoint?: boolean }) {
  // While adding, the length is shared with the outline on the timeline.
  const pending = usePending();
  const [own, setOwn] = useState(initial);
  const minutes = pending?.minutes ?? own;
  const setMinutes = (m: number) => (pending ? updatePending({ minutes: m }) : setOwn(m));
  const point = allowPoint && minutes === 0;
  const nudge = (by: number) => setMinutes(Math.min(Math.max(minutes + by, 15), 24 * 60));
  const button =
    "flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full border-2 px-4 text-lg";
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">How long</legend>
      <input type="hidden" name="minutes" value={minutes} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => nudge(-15)} className={`${button} border-frame bg-board font-bold text-ink`} aria-label="15 minutes shorter">
          −15
        </button>
        <span className="min-w-[6.5rem] text-center text-2xl font-extrabold text-ink" aria-live="polite">
          {point ? "A point" : lengthLabel(minutes)}
        </span>
        <button type="button" onClick={() => nudge(15)} className={`${button} border-frame bg-board font-bold text-ink`} aria-label="15 minutes longer">
          +15
        </button>
        <span className="mx-1 h-8 w-px bg-frame" aria-hidden />
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setMinutes(p)}
            aria-pressed={minutes === p}
            className={`${button} ${minutes === p ? "border-ink bg-rail font-bold" : "border-frame bg-board"} text-ink`}
          >
            {lengthLabel(p)}
          </button>
        ))}
        {allowPoint ? (
          <button
            type="button"
            onClick={() => setMinutes(0)}
            aria-pressed={point}
            title="A time with no length, like Homework due 9am"
            className={`${button} ${point ? "border-ink bg-rail font-bold" : "border-frame bg-board"} text-ink`}
          >
            No length
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * Tabs across the top of the add card: the event itself first, then the
 * rarer settings. Only one shows at a time, so the card never needs to
 * scroll. Every tab stays in the form (just hidden), so whatever you set
 * in one is still sent when you press Add.
 */
export function CardTabs({ tabs, initial = 0 }: { tabs: { label: string; panel: ReactNode }[]; initial?: number }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex shrink-0 gap-1 rounded-[var(--radius)] bg-rail p-1" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={open === i}
            onClick={() => setOpen(i)}
            className={`flex min-h-[var(--touch-target)] flex-1 items-center justify-center rounded-[calc(var(--radius)-0.25rem)] px-3 text-lg font-bold ${
              open === i ? "bg-board text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={open !== i} className="grid content-start gap-5">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
