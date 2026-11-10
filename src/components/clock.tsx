"use client";

import { useEffect, useState } from "react";
import { clockTime } from "@/lib/time-text";

/**
 * The header clock. The server draws the first time; after that this small
 * piece of browser code ticks it over every few seconds.
 */
export function Clock({ initial, locale, timeZone }: { initial: string; locale: string; timeZone: string }) {
  const [time, setTime] = useState(initial);
  useEffect(() => {
    const format = () =>
      clockTime(new Date(), locale, timeZone);
    const id = setInterval(() => setTime(format()), 10_000);
    return () => clearInterval(id);
  }, [locale, timeZone]);
  return (
    <span className="text-2xl whitespace-nowrap text-ink-muted lg:text-4xl" suppressHydrationWarning>
      {time}
    </span>
  );
}
