"use client";

import type { ReactNode } from "react";

/** One tap choices (a controlled version of the Chips in ui.tsx). */
export function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[var(--touch-target)] items-center rounded-full border-2 px-4 text-lg text-ink ${o.value === value ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

