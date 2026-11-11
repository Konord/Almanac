"use client";

import { emojiImage } from "@/lib/emoji";
import { DownSince } from "./down-since";
import { useLauncher } from "./launcher-store";

/**
 * The heads-up on the Today panel when a server app stops answering
 * (2026-11-11). It sits beside the clock so it takes no room from the
 * lists, shows only on the kitchen screen (where the launcher helper
 * runs), and goes away by itself when the app answers again.
 */
export function AppAlerts() {
  const { apps, locale, timeZone } = useLauncher();
  const down = apps.filter((a) => a.up === false);
  if (down.length === 0) return null;
  const first = down[0];
  const warning = emojiImage("⚠️");
  return (
    <div role="status" className="ml-auto flex min-w-0 items-center gap-2.5 rounded-[1.125rem] border-2 border-danger/30 bg-board px-3 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- small local picture */}
      {warning ? <img src={warning} alt="" aria-hidden className="size-9 shrink-0" /> : null}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-lg font-extrabold text-ink">
          {down.length === 1 ? `${first.name} isn't answering` : `${down.length} apps aren't answering`}
        </span>
        {down.length === 1 && first.downSince ? (
          <DownSince since={first.downSince} locale={locale} timeZone={timeZone} />
        ) : (
          <span className="truncate text-lg font-bold text-danger">{down.map((a) => a.name).join(", ")}</span>
        )}
      </span>
    </div>
  );
}
