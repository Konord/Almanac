import { Pager as PageArrows } from "@/components/pager";
import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react/dist/ssr";
import { Notice, ScreenHeader, Segmented } from "@/components/ui";
import { BATCHES } from "@/lib/meals";
import { MENU_TABS, type MealsTab } from "./menu-tabs";

/*
 * Pieces shared by the Meals screens: the header with the Meals tabs, the
 * picked-row look, the ×1/×2/×3 switch, a pop-up card that never scrolls,
 * and page arrows for long lists.
 */

export type { MealsTab } from "./menu-tabs";

/**
 * The Meals header: the big printed "Meals" with the tab's name on its
 * baseline, Menu | Dishes | Backups in the tab slot, no weather, and the
 * page's Add/Save at the far right (`children`).
 */
export function MealsHeader({
  tab,
  children,
  error,
  message,
}: {
  tab: MealsTab;
  children?: ReactNode;
  error?: string | null;
  message?: string | null;
}) {
  return (
    <>
      <ScreenHeader
        title="Meals"
        sub={MENU_TABS.find((t) => t.tab === tab)?.sub}
        tabs={<Segmented label="Meals" options={MENU_TABS.map((t) => ({ href: t.href, label: t.label, active: t.tab === tab }))} />}
        action={children}
      />
      {error ? <Notice tone="error">{error}</Notice> : message ? <Notice tone="success">{message}</Notice> : null}
    </>
  );
}

/** A row you pick in a column (a kind of meal, a meal, a dish): the picked one is ringed in ink. */
export function pickRowClass(active: boolean): string {
  return `flex min-h-16 w-full min-w-0 items-center gap-[0.65rem] rounded-[var(--radius)] px-3 text-left ${
    active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"
  }`;
}

/** A round grey icon button (rename, remove). */
export const roundIconClass =
  "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink disabled:opacity-35";

/**
 * ×1 ×2 ×3. Links (`href`) on server pages, buttons (`onPick`) in the
 * browser. `meal` is Cook mode's yellow track; the plain one is grey.
 */
export function BatchSwitch({
  value,
  href,
  onPick,
  tone = "plain",
  big = false,
}: {
  value: number;
  href?: (batches: number) => string;
  onPick?: (batches: number) => void;
  tone?: "plain" | "meal";
  big?: boolean;
}) {
  const item = (on: boolean) =>
    `flex h-12 min-w-[3.6rem] items-center justify-center rounded-[calc(var(--radius)-0.1rem)] px-2 font-extrabold tabular ${big ? "text-[1.5rem]" : "text-[1.35rem]"} ${
      on ? "bg-board text-ink shadow-raised" : tone === "meal" ? "text-meal-ink" : "text-ink-muted"
    }`;
  return (
    <div role="group" aria-label="Batches" className={`flex shrink-0 gap-1 rounded-[var(--radius)] p-1 ${tone === "meal" ? "bg-meal" : "bg-panel"}`}>
      {BATCHES.map((b) =>
        href ? (
          <Link key={b} href={href(b)} scroll={false} aria-current={b === value ? "true" : undefined} aria-label={`${b} batch${b === 1 ? "" : "es"}`} className={item(b === value)}>
            ×{b}
          </Link>
        ) : (
          <button key={b} type="button" aria-pressed={b === value} aria-label={`${b} batch${b === 1 ? "" : "es"}`} onClick={() => onPick?.(b)} className={item(b === value)}>
            ×{b}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * A card that pops up over the screen. It's sized to fit a landscape
 * screen and never scrolls: long things inside it use tabs or pages.
 */
export function Modal({
  title,
  icon,
  closeHref,
  children,
  wide = false,
  aside,
}: {
  title: ReactNode;
  icon?: ReactNode;
  closeHref: string;
  children: ReactNode;
  wide?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 lg:p-8">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.32)]" />
      <section
        role="dialog"
        aria-label={typeof title === "string" ? title : "Meal"}
        className={`relative flex max-h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-board shadow-[0_0_2.5rem_rgba(30,35,45,0.25)] ${
          wide ? "max-w-[96rem] lg:h-[52rem]" : "max-w-[60rem]"
        }`}
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-frame px-7 py-4">
          {icon}
          <h2 className="min-w-0 flex-1 truncate text-3xl font-extrabold text-ink">{title}</h2>
          {aside}
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink hover:bg-panel"
          >
            <X size="1.75rem" weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-7 py-5">{children}</div>
      </section>
    </div>
  );
}

/** ‹ 2 of 5 › arrows for a list shown a page at a time. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  return <PageArrows page={page} pages={pages} href={href} className="justify-center" />;
}

/** A page of a list, and how many pages there are. */
export function pageOf<T>(items: T[], page: number, perPage: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * perPage, (p + 1) * perPage), page: p, pages };
}

/** Builds a link to the same screen with some search params changed. */
export function linker(base: string, current: Record<string, string | null | undefined>) {
  return (changes: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | null | undefined> = { ...current, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };
}

export const ENERGY_LOOK = {
  normal: { label: "Normal", emoji: "🔋" },
  survival: { label: "Survival", emoji: "🛟" },
} as const;
