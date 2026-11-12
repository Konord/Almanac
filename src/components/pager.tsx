import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

/**
 * The one page control used everywhere (Connor, 2026-11-11): a round arrow
 * on each side of "1 of 4". The arrow you can't use fades instead of
 * disappearing, so nothing jumps around as you page.
 *
 * Give it `onPage` inside an interactive (client) part of a screen, or
 * `href` on a server-drawn screen where each page has its own address.
 * Nothing shows when there is only one page.
 */
export function Pager({
  page,
  pages,
  onPage,
  href,
  className = "",
}: {
  /** The page showing, counting from 0. */
  page: number;
  pages: number;
  onPage?: (page: number) => void;
  href?: (page: number) => string;
  className?: string;
}) {
  if (pages <= 1) return null;
  const arrow = "flex size-12 shrink-0 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30";
  const side = (to: number, label: string, icon: React.ReactNode) => {
    const can = to >= 0 && to < pages;
    if (href) {
      return can ? (
        <Link href={href(to)} scroll={false} aria-label={label} className={arrow}>
          {icon}
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden>
          {icon}
        </span>
      );
    }
    return (
      <button type="button" aria-label={label} disabled={!can} onClick={() => onPage?.(to)} className={arrow}>
        {icon}
      </button>
    );
  };
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      {side(page - 1, "Previous page", <CaretLeft size="1.25rem" weight="bold" aria-hidden />)}
      <span className="min-w-16 text-center text-base font-bold text-ink-muted tabular-nums" aria-live="polite">
        {page + 1} of {pages}
      </span>
      {side(page + 1, "Next page", <CaretRight size="1.25rem" weight="bold" aria-hidden />)}
    </div>
  );
}
