import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react/dist/ssr";

/**
 * A panel that slides over the right side of the screen, for adding and
 * editing things without leaving the screen. Its contents scroll inside it,
 * so the screen underneath never has to. Tapping outside closes it.
 */
export function Sheet({
  title,
  closeHref,
  children,
  narrow = false,
  side = "right",
  floating = false,
  scrim = true,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
  /** A slimmer panel that leaves most of the screen showing, e.g. for quick add. */
  narrow?: boolean;
  /** Which edge it slides in from; the left keeps the end of the week in view. */
  side?: "left" | "right";
  /**
   * The Glance card (the event sheet, g-final-event.html `.sheet`): a white
   * card floating near one edge, as tall as its contents and never taller
   * than the screen. Its contents must fit (nothing scrolls).
   */
  floating?: boolean;
  /** Floating only: dim the screen behind it (a tap there closes it). Off where the screen behind stays usable. */
  scrim?: boolean;
}) {
  if (floating) {
    return (
      <div className="pointer-events-none fixed inset-0 z-40">
        {scrim ? <Link href={closeHref} aria-label="Close" scroll={false} className="pointer-events-auto absolute inset-0 bg-[rgb(35_38_43/0.18)]" /> : null}
        <section
          role="dialog"
          aria-label={title}
          className={`pointer-events-auto absolute top-1/2 flex max-h-[calc(100dvh-2rem)] w-[50rem] max-w-[calc(100vw-1rem)] -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-[var(--radius-dialog)] bg-board px-[1.65rem] pt-6 pb-[1.4rem] shadow-dialog ${
            side === "left" ? "left-2 lg:left-12" : "right-2 lg:right-12"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-4">
            <h2 className="min-w-0 truncate text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
            <Link
              href={closeHref}
              scroll={false}
              aria-label="Close"
              className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink"
            >
              <X size="1.5rem" weight="bold" aria-hidden />
            </Link>
          </div>
          {children}
        </section>
      </div>
    );
  }
  return (
    <div className={`fixed inset-0 z-40 flex ${side === "left" ? "justify-start" : "justify-end"} ${narrow ? "pointer-events-none" : ""}`}>
      {/* The slim panel leaves the screen behind it usable (e.g. to drag the new event), so it has no dimmed backdrop. */}
      {narrow ? null : <Link href={closeHref} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.28)]" scroll={false} />}
      <section
        role="dialog"
        aria-label={title}
        className={`pointer-events-auto relative flex h-full w-full ${narrow ? "max-w-[46rem]" : "max-w-[52rem]"} flex-col bg-board shadow-[0_0_2.5rem_rgba(30,35,45,0.25)]`}
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
        <div className={`min-h-0 flex-1 px-8 py-6 ${narrow ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      </section>
    </div>
  );
}
