"use client";

import { useState, type ReactNode } from "react";
import { Pager } from "./pager";

/**
 * A list in the Today panel, a page at a time (nothing scrolls).
 *
 * The rows are made on the server (their tick buttons are server actions) and
 * handed over already split into pages; this part only remembers which page
 * is showing and draws the arrows. The box's heading opens the full screen,
 * so there's no link down here (Connor, 2026-11-11).
 */
export function PanelPages({ pages }: { pages: ReactNode[] }) {
  const [wanted, setPage] = useState(0);
  // Ticking a row can leave fewer pages than before: stay on the last one.
  const page = Math.min(wanted, Math.max(0, pages.length - 1));
  return (
    <>
      {pages[page] ?? null}
      <Pager page={page} pages={pages.length} onPage={setPage} className="mt-auto justify-end pt-1" />
    </>
  );
}
