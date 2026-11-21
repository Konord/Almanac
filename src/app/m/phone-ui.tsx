"use client";

import type { ReactNode } from "react";
import type { LocalDate } from "@/lib/time";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Basket, CalendarBlank, CheckSquare, Plus } from "@phosphor-icons/react";

/*
 * Small pieces shared by the phone pages, in the Glance look: the grey
 * rail behind white rounded cards, the big printed title, ink-black main
 * buttons, and theme colours only.
 */

const TABS = [
  { href: "/m", label: "Calendar", icon: CalendarBlank, match: (p: string) => p === "/m" || p.startsWith("/m/event") },
  { href: "/m/add", label: "Add", icon: Plus, match: (p: string) => p.startsWith("/m/add") },
  { href: "/m/groceries", label: "Groceries", icon: Basket, match: (p: string) => p.startsWith("/m/groceries") },
  { href: "/m/lists", label: "Lists", icon: CheckSquare, match: (p: string) => p.startsWith("/m/lists") },
] as const;

/** The tabs along the bottom of every phone page, with this page's lit. */
export function PhoneNavHere() {
  return <PhoneNav path={usePathname()} />;
}

export function PhoneNav({ path }: { path: string }) {
  return (
    <nav
      aria-label="Almanac"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-frame bg-board px-2 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))]"
    >
      {TABS.map((t) => {
        const on = t.match(path);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] text-[0.95rem] ${
              on ? "bg-panel font-bold text-ink" : "font-semibold text-ink-muted"
            }`}
          >
            <Icon size="1.6rem" weight={on ? "fill" : "regular"} aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The top of a phone page: a big printed title (and a quieter line beside it), with an action at the right. */
export function PhoneHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex min-h-[4.5rem] items-center gap-3 px-4 pt-3 pb-2">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="shrink-0 text-[2.4rem] leading-none font-extrabold tracking-[-0.045em] text-title">{title}</h1>
        {sub ? <span className="tabular min-w-0 truncate text-[1.15rem] leading-none font-bold text-title-soft">{sub}</span> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** A white rounded card on the rail. */
export function PhoneCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[var(--radius-card)] bg-board shadow-raised ${className}`}>{children}</section>;
}

/** A switch of a few choices (Event | To-do | Chore): grey track, the picked one raised in white. */
export function PhoneSeg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[calc(var(--radius)+0.3rem)] bg-panel p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-[var(--radius)] px-2 text-[1.1rem] whitespace-nowrap ${
            value === o.value ? "bg-tab-on font-bold text-tab-on-ink shadow-raised" : "font-semibold text-ink-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A typed-in field on the phone: big bold text in a grey frame. */
export const phoneInputClass =
  "min-h-12 w-full min-w-0 rounded-[var(--radius)] border-2 border-frame bg-board px-3.5 text-[1.15rem] font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-muted focus:border-ink";

/** A small grey label above a field. */
export const phoneLabelClass = "text-[0.95rem] font-bold text-ink-muted";

/** The ink-black main button. */
export const phonePrimaryClass =
  "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] bg-primary px-5 text-[1.1rem] font-bold whitespace-nowrap text-primary-ink disabled:opacity-60";

/** A grey second-rank button. */
export const phoneSecondaryClass =
  "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] bg-panel px-4 text-[1.1rem] font-bold whitespace-nowrap text-ink disabled:opacity-50";

/** A round choice chip (a weekday, a tag): ink-framed when picked. */
export function chipClass(on: boolean): string {
  return `inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border-2 px-4 text-[1.05rem] font-bold ${
    on ? "border-ink bg-rail text-ink" : "border-frame bg-board text-ink-soft"
  }`;
}

export function dateText(d: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
}
export function timeText(t: string, locale: string): string {
  if (!t) return "–";
  const [h, m] = t.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", hour: "numeric", minute: "2-digit" })
    .format(new Date(Date.UTC(2026, 0, 1, h, m)))
    .replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

/**
 * A date or time, shown in words ("Sat, Nov 21", "6:00 pm"); tapping it
 * opens the phone's own picker (the real input sits on top, unseen).
 */
export function PickField({
  type,
  label,
  value,
  text,
  min,
  narrow = false,
  className = "",
  onChange,
}: {
  className?: string;
  type: "date" | "time";
  label: string;
  value: string;
  text: string;
  min?: string;
  narrow?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`${phoneInputClass} tabular relative flex items-center justify-center whitespace-nowrap focus-within:border-ink ${narrow ? "w-[7.25rem]" : ""} ${className}`}>
      <span aria-hidden>{text}</span>
      <input
        type={type}
        value={value}
        min={min}
        aria-label={label}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Some browsers only open it from the input itself; that's fine.
          }
        }}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={phoneLabelClass}>{children}</span>;
}
