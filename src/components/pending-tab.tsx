"use client";

import { useLinkStatus } from "next/link";

/*
 * Inside a tab link (Agenda | Week | Month, Menu | Dishes | Backups…): the
 * moment it is tapped, the tab takes the selected look, before the next
 * page has arrived (UI audit H2, 2026-11-21). Always drawn, only its
 * opacity changes, so nothing shifts.
 */
export function PendingTab() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-[var(--radius)] bg-tab-on shadow-raised transition-opacity duration-100 ${pending ? "opacity-100" : "opacity-0"}`}
    />
  );
}
