"use client";

import { downText } from "@/lib/launcher";

/** "Down since 9:40 am" in the danger colour, for the tray and the Today panel. */
export function DownSince({ since, locale, timeZone, short = false }: { since: string; locale: string; timeZone: string; short?: boolean }) {
  return (
    <span className={`font-bold text-danger ${short ? "-mt-1.5 text-base" : "text-lg"}`}>
      {downText(since, new Date(), locale, timeZone)}
    </span>
  );
}
