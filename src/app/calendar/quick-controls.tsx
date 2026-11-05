"use client";

import { useState, type ReactNode } from "react";
import { updatePending, usePending } from "@/components/pending-store";

/** Ready-made lengths, in minutes. */
const PRESETS = [30, 60, 120];

/** "1 h 30" style label for a length in minutes. */
export function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/**
 * How long an event lasts, set with buttons: a few ready-made lengths,
 * or nudge it 15 minutes at a time. Sends "minutes" with the form.
 */
export function LengthControl({ initial }: { initial: number }) {
  // While adding, the length is shared with the outline on the timeline.
  const pending = usePending();
  const [own, setOwn] = useState(initial);
  const minutes = pending?.minutes ?? own;
  const setMinutes = (m: number) => (pending ? updatePending({ minutes: m }) : setOwn(m));
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
          {lengthLabel(minutes)}
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
      </div>
    </fieldset>
  );
}

/**
 * Tabs for the extra settings. Every panel stays in the form (just hidden),
 * so whatever you set in one tab is still sent when you press Add.
 */
export function ExtraTabs({ tabs }: { tabs: { label: string; panel: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            className={`flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-4 text-lg font-bold ${
              open === i ? "bg-ink text-board" : "bg-rail text-ink hover:bg-panel"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={open !== i} className="grid gap-4 rounded-[var(--radius-card)] border border-frame p-4 sm:grid-cols-2">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
