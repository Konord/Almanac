/**
 * The home screen. For now it's a blank whiteboard that proves the app,
 * the theme and the time zone all work. The real Today screen arrives in
 * Phase 2.
 */

import { Suspense } from "react";
import { connection } from "next/server";

// Placeholder until household settings exist (Phase 1, step 2).
const HOUSEHOLD_TIME_ZONE = "America/Toronto";
const HOUSEHOLD_LOCALE = "en-CA";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col gap-8 p-8 sm:p-12">
      <header className="flex items-baseline justify-between gap-4 border-b-4 border-marker-blue pb-4">
        <h1 className="text-5xl font-semibold tracking-tight text-ink">Almanac</h1>
        <Suspense fallback={<p className="text-2xl text-ink-muted">&nbsp;</p>}>
          <TodayDate />
        </Suspense>
      </header>

      <section className="flex flex-1 items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-frame bg-panel/40 p-8">
        <div className="max-w-md text-center">
          <p className="text-3xl text-ink">The board is ready.</p>
          <p className="mt-3 text-lg text-ink-muted">
            Calendar, chores and meals will appear here as each phase is built.
          </p>
          <div className="mt-8 flex justify-center gap-3" aria-label="Marker colours">
            <span className="size-10 rounded-full bg-marker-black" title="Black marker" />
            <span className="size-10 rounded-full bg-marker-blue" title="Blue marker" />
            <span className="size-10 rounded-full bg-marker-red" title="Red marker" />
            <span className="size-10 rounded-full bg-marker-green" title="Green marker" />
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Today's date in the household's time zone. connection() tells Next.js to
 * work this out when someone opens the page, not once at build time, so it
 * never shows a stale date.
 */
async function TodayDate() {
  await connection();
  const today = new Intl.DateTimeFormat(HOUSEHOLD_LOCALE, {
    timeZone: HOUSEHOLD_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return <p className="text-2xl text-ink-muted">{today}</p>;
}
