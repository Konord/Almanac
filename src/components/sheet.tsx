import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react/dist/ssr";

/**
 * A panel that slides over the right side of the screen, for adding and
 * editing things without leaving the screen. Its contents scroll inside it,
 * so the screen underneath never has to. Tapping outside closes it.
 */
export function Sheet({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.28)]" scroll={false} />
      <section
        role="dialog"
        aria-label={title}
        className="relative flex h-full w-full max-w-[52rem] flex-col bg-board shadow-[0_0_2.5rem_rgba(30,35,45,0.25)]"
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-frame px-8 py-5">
          <h2 className="min-w-0 flex-1 truncate text-3xl font-extrabold text-ink">{title}</h2>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink hover:bg-panel"
          >
            <X size="1.75rem" weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">{children}</div>
      </section>
    </div>
  );
}
