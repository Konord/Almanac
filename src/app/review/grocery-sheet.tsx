"use client";

import { GroceryView } from "../groceries/view";

/*
 * The grocery list on the Planner's Groceries tab (Connor shops right
 * after planning). It takes the week's place, like the Week and Chores
 * tabs do, instead of opening over it (Connor, 2026-11-26). It's the live
 * list: saving the week puts the menu's ingredients on it, and you cross
 * off what you already have.
 */
export function GroceryPanel({ dirty }: { dirty: boolean }) {
  return (
    <section aria-label="Grocery list" className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-[var(--radius-card)] bg-board p-7 shadow-raised">
      {dirty ? <p className="shrink-0 text-[1.25rem] font-bold text-ink-muted">Save the week to put your meal changes on the list.</p> : null}
      <GroceryView rows={10} columns={5} />
    </section>
  );
}
