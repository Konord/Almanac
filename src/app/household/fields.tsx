"use client";

import type { ReactNode } from "react";
import { fieldLabelClass } from "@/components/ui";

/*
 * Small building blocks for the Settings tabs, in the Glance look
 * (g-final-settings.html): a white card with a printed title, a muted
 * label above each field, and chips for a choice of many.
 */

/** A Settings card: white, rounded, a 1.75rem printed title (the mock's `.card` + `.h2`). */
export function SettingsCard({ title, aside, children, className = "" }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised lg:min-h-0 ${className}`}>
      <div className="mb-[0.35rem] flex min-h-[2.2rem] items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-[1.75rem] leading-tight font-bold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A labelled field (the mock's `.field`): muted label on top, the control under it. */
export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-[0.35rem] ${className}`}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </div>
  );
}

/** One tap choices as chips (the mock's `.boxes`), for when there are too many for a Toggle. */
export function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-[0.35rem]">
      <legend className={`mb-[0.35rem] ${fieldLabelClass}`}>{label}</legend>
      <div className="flex flex-wrap gap-[0.45rem]">
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={chipClass(o.value === value)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** An on/off chip (Today panel boxes, Choice). */
export function chipClass(on: boolean): string {
  return `flex min-h-12 items-center rounded-full border-2 px-4 text-[1.25rem] font-bold text-ink ${on ? "border-ink bg-rail" : "border-frame bg-board"}`;
}
