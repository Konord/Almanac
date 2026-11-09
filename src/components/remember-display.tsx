"use client";

import { useEffect } from "react";

/*
 * Which calendar display this screen showed last (Agenda, Week or Month),
 * so the menu's Calendar button brings you back to it (Connor, 2026-11-09).
 * Kept in a cookie, so each device (the wall, a phone) remembers its own.
 */

export type Display = "agenda" | "week" | "month";
export const DISPLAY_COOKIE = "almanac-display";

/** Notes the display being shown. Draws nothing. */
export function RememberDisplay({ display }: { display: Display }) {
  useEffect(() => {
    document.cookie = `${DISPLAY_COOKIE}=${display}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, [display]);
  return null;
}

/** Where the Calendar button goes: the display this screen showed last. */
export function lastDisplayHref(): string {
  const saved = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${DISPLAY_COOKIE}=`))
    ?.split("=")[1];
  if (saved === "agenda") return "/";
  if (saved === "month") return "/calendar?view=month";
  return "/calendar?view=week";
}
