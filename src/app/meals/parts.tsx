import { Pager as PageArrows } from "@/components/pager";
import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react/dist/ssr";
import { Notice, ScreenHeader, Segmented } from "@/components/ui";
import { MENU_TABS, type MealsTab } from "./menu-tabs";

/*
 * Pieces shared by the Meals screens: the header with the Meals tabs, a
 * pop-up card that never scrolls, and page arrows for long lists.
 */

export type { MealsTab } from "./menu-tabs";
const TABS = MENU_TABS;

export function MealsHeader({
  title,
  tab,
  children,
  error,
  message,
}: {
  title: ReactNode;
  tab: MealsTab;
  children?: ReactNode;
  error?: string;
  message?: string;
}) {
  return (
    <>
      {/* The tabs sit straight after the title on every Menu Manager screen, so they never move. */}
      <ScreenHeader title={title}>
        <Segmented label="Meals" options={TABS.map((t) => ({ href: t.href, label: t.label, active: t.tab === tab }))} />
        {children ? <div className="flex items-center gap-4 lg:ml-auto">{children}</div> : null}
      </ScreenHeader>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
    </>
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
