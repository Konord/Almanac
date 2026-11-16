"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** The most events a month square lists (MONTH_CELL_LIMIT in views.tsx). */
const LIMIT = 4;

/*
 * Fitting each month square (the mock's fit(), SPEC "Month view variant 5").
 * The server lists every timed event in a square, with all but the first
 * four hidden and "+ N more" under them. Here, a square that's still too
 * short hides its last rows one by one, counting them into "+ N more",
 * until nothing spills out. It runs again whenever the grid changes size
 * (the Daily List opening or closing, a different screen) and when the
 * fonts arrive.
 *
 * The holiday pictures size themselves in CSS (88% of the square below
 * the date row, see MonthView), so they need nothing here.
 *
 * Parts are found by their data-* names: data-month-cell,
 * data-month-ev and data-month-more.
 */
export function MonthFit({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  // Bumped by the size watcher, so a resize lays out again.
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (grid) grid.querySelectorAll<HTMLElement>("[data-month-cell]").forEach(fitCell);
  });

  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const watcher = new ResizeObserver(() => setSize((n) => n + 1));
    watcher.observe(grid);
    void document.fonts?.ready.then(() => setSize((n) => n + 1));
    return () => watcher.disconnect();
  }, []);

  return (
    <div ref={ref} data-size={size} className={className} style={style}>
      {children}
    </div>
  );
}

function fitCell(cell: HTMLElement) {
  const rows = [...cell.querySelectorAll<HTMLElement>("[data-month-ev]")];
  const more = cell.querySelector<HTMLElement>("[data-month-more]");
  rows.forEach((row, i) => (row.hidden = i >= LIMIT));
  let hidden = Math.max(0, rows.length - LIMIT);
  const paint = () => {
    if (!more) return;
    more.hidden = hidden === 0;
    more.textContent = `+ ${hidden} more`;
  };
  paint();
  const overflows = () => cell.scrollHeight > cell.clientHeight + 1;
  while (overflows()) {
    const last = rows.filter((row) => !row.hidden).at(-1);
    if (!last) break;
    last.hidden = true;
    hidden += 1;
    paint();
  }
}
