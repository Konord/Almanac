"use client";

import { useState, type ReactNode } from "react";

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
