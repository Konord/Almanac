"use client";

import { useEffect, useRef, useState } from "react";
import { conversions, type Measures } from "@/lib/units";

/*
 * An amount on a recipe ("1 cup"), made to stand out. Units are never
 * converted on the recipe; tapping one shows what it is in other units
 * (1 cup = 250 ml · 16 tbsp), using the household's kitchen measures.
 */
export function UnitPill({ amount, unit, text, measures, size = "lg" }: { amount: number | null; unit: string | null; text: string; measures: Measures; size?: "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const other = conversions(amount, unit, measures);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const look = `${size === "lg" ? "text-xl" : "text-lg"} font-extrabold text-ink`;
  if (other.length === 0) return <span className={`${look} mr-1.5`}>{text}</span>;
  // A span, not a button: it sits inside rows that are buttons themselves.
  return (
    <span ref={box} className="relative mr-1.5 inline-flex shrink-0">
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${text}: show in other units`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`${look} inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-[color-mix(in_srgb,var(--color-meal)_55%,white)] px-2 underline decoration-meal-ink/40 decoration-dotted underline-offset-4`}
      >
        {text}
      </span>
      {open ? (
        <span role="status" className="absolute top-full left-0 z-20 mt-1 flex w-max flex-col gap-0.5 rounded-xl border-2 border-meal bg-board px-3.5 py-2 text-lg font-bold text-ink shadow-[0_8px_24px_rgba(35,38,43,0.18)]">
          {other.map((c) => (
            <span key={c.unit}>= {c.text}</span>
          ))}
          <span className="text-sm font-normal text-ink-muted">{measures === "canadian" ? "Canadian measures (1 cup = 250 ml)" : "US measures (1 cup = 237 ml)"}</span>
        </span>
      ) : null}
    </span>
  );
}
