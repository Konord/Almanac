"use client";

import { ShoppingCart } from "@phosphor-icons/react";
import { GroceryView } from "../groceries/view";
import { CloseButton } from "./parts";

/*
 * The grocery list, opened from the review's header (Connor shops right
 * after the review). It's the live list: saving the week puts the menu's
 * ingredients on it, and you cross off what you already have. Looking at
 * it before saving is fine but not needed.
 */
export function GrocerySheet({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(30,35,45,0.38)]" role="dialog" aria-label="Grocery list" onClick={onClose}>
      <div className="absolute inset-x-[3.75rem] inset-y-[2.5rem] flex flex-col gap-4 overflow-hidden rounded-[1.875rem] bg-board p-7 shadow-2xl max-lg:inset-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-4">
          <ShoppingCart size="2.5rem" className="text-meal-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-3xl font-extrabold text-ink">Grocery list</h2>
            <p className="text-base text-ink-muted">
              {dirty ? "Save the week to put your meal changes on the list. " : ""}Tap what you already have to cross it off. Changes save as you go.
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <GroceryView rows={10} columns={5} />
      </div>
    </div>
  );
}
