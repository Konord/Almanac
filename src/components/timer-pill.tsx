"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { stopTimer, timeLeft, useAlarm, useNow, useTimers } from "./timer-store";

/**
 * Running kitchen timers, in the bottom-right corner of every screen (the bottom centre is the menu handle), so a
 * timer started in Cooking mode is still seen (and heard) elsewhere.
 */
export function TimerPill() {
  const timers = useTimers();
  const now = useNow(timers.length > 0);
  const path = usePathname();
  useAlarm(timers, now);
  if (timers.length === 0 || now === 0 || path.startsWith("/meals/cook")) return null;
  return (
    <div className="fixed right-6 bottom-5 z-30 flex flex-col items-end gap-2">
      {timers.slice(0, 3).map((t) => {
        const done = t.endsAt <= now;
        return (
          <div
            key={t.id}
            className={`flex min-h-[var(--touch-target)] items-center gap-3 rounded-full pr-1.5 pl-5 text-lg font-bold shadow-[0_0.25rem_1rem_rgba(30,35,45,0.2)] ${
              done ? "animate-pulse bg-now text-white" : "bg-meal text-meal-ink"
            }`}
          >
            {t.mealId ? (
              <Link href={`/meals/cook/${t.mealId}`} className="flex items-center gap-3">
                <span>⏲️ {t.label}</span>
                <span className="tabular-nums">{done ? "Done!" : timeLeft(t, now)}</span>
              </Link>
            ) : (
              <>
                <span>⏲️ {t.label}</span>
                <span className="tabular-nums">{done ? "Done!" : timeLeft(t, now)}</span>
              </>
            )}
            <button type="button" aria-label="Stop timer" onClick={() => stopTimer(t.id)} className="flex size-11 items-center justify-center rounded-full bg-board/50">
              <X size="1.25rem" weight="bold" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
