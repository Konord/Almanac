"use client";

import { useSyncExternalStore } from "react";

/*
 * The event you're in the middle of adding, shared between the quick-add
 * card and the dashed outline on the timeline. Move the outline and the
 * card's day, time and length follow; change the card and the outline moves.
 */

export type PendingEvent = {
  date: string;
  /** Minutes since midnight, or null for no time yet. */
  start: number | null;
  minutes: number;
  allDay: boolean;
  /** Who it's for: "everyone" or a member id. */
  member: string;
};

let current: PendingEvent | null = null;
const listeners = new Set<() => void>();

export function setPending(next: PendingEvent | null) {
  current = next;
  for (const l of listeners) l();
}

export function updatePending(changes: Partial<PendingEvent>) {
  if (current) setPending({ ...current, ...changes });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The event being added, or null when nothing is being added. */
export function usePending(): PendingEvent | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
