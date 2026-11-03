import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requireHousehold } from "@/lib/household";

/**
 * The home screen. Still mostly a blank whiteboard: the real Today screen
 * arrives in Phase 2. It now uses the household's own name, time zone and
 * locale from the database.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col gap-8 p-8 sm:p-12">
      <Suspense fallback={<HeaderFrame name="Almanac" date="" />}>
        <Header />
      </Suspense>

      <section className="flex flex-1 items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-frame bg-panel/40 p-8">
        <div className="max-w-md text-center">
          <p className="text-3xl text-ink">The board is ready.</p>
          <p className="mt-3 text-lg text-ink-muted">
            Chores and meals will appear here as each phase is built. The Today view arrives with the calendar.
          </p>
          <div className="mt-8 flex justify-center gap-3" aria-label="Marker colours">
            <span className="size-10 rounded-full bg-marker-black" title="Black marker" />
            <span className="size-10 rounded-full bg-marker-blue" title="Blue marker" />
            <span className="size-10 rounded-full bg-marker-red" title="Red marker" />
            <span className="size-10 rounded-full bg-marker-green" title="Green marker" />
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/calendar"
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-marker-blue px-5 text-lg text-board"
            >
              Calendar
            </Link>
            <Link
              href="/household"
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] border-2 border-frame bg-board px-5 text-lg text-ink"
            >
              Household &amp; people
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * The household name and today's date in its time zone. connection() makes
 * Next.js work the date out when the page is opened, not once at build time.
 */
async function Header() {
  await connection();
  const household = await requireHousehold();
  const { locale, timeZone } = household.settings;
  const today = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return <HeaderFrame name={household.name} date={today} />;
}

function HeaderFrame({ name, date }: { name: string; date: string }) {
  return (
    <header className="flex items-baseline justify-between gap-4 border-b-4 border-marker-blue pb-4">
      <h1 className="text-5xl font-semibold tracking-tight text-ink">{name}</h1>
      <p className="text-2xl text-ink-muted">{date || " "}</p>
    </header>
  );
}
