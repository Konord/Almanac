import { Suspense } from "react";
import Link from "next/link";
import { Notice, firstParam } from "@/components/ui";
import { CHIP_CLASS } from "@/lib/colours";
import { formatMinutes, profileLabel, type DayProfile } from "@/lib/day-profile";
import { requireHousehold, type Household } from "@/lib/household";
import { addDays, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { deviceView, itemsInView, loadCalendar, profilesFor, rangeOf } from "./calendar/data";
import { PROFILE_CLASS, ProfileTag } from "./calendar/profile-tag";
import type { CalendarItem, Layer, Member } from "./calendar/types";
import { ViewChooser } from "./calendar/view-chooser";
import { loadRoutines } from "./routines/data";
import { RoutinesGlance } from "./routines/glance";
import { eventsOnDay, isAllDayStyle, shortTime, weekdayLabel } from "./calendar/views";

/** How many days the "Coming up" strip shows after today. */
const COMING_UP_DAYS = 6;

/**
 * The Today screen: what kind of day it is, what's on, and a glance at the
 * week ahead. Chores, meals and weather join it in later phases.
 */
export default function Home(props: PageProps<"/">) {
  return (
    // On a landscape wall screen (lg and up) the page fills exactly one screen
    // and long lists scroll inside their own panels instead.
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-4 p-4 sm:p-6 lg:h-dvh lg:max-h-dvh lg:min-h-0 lg:overflow-hidden">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Today searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Today({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone, dayProfile } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);

  const days = Array.from({ length: COMING_UP_DAYS + 1 }, (_, i) => addDays(today, i));
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  const [{ layers, members, views, items }, routineData] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
  ]);
  const savedView = await deviceView(views);
  const shown = itemsInView(items, savedView);
  const profiles = profilesFor(days, items, layers, household);
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const noon = (day: LocalDate) => zonedToUtc(day, "12:00", timeZone);
  const longDate = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(now);
  const todayProfile = profiles.get(today);
  const todayItems = sortForDay(eventsOnDay(shown, today, timeZone), timeZone);
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-marker-blue pb-3">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h1 className="text-4xl font-semibold tracking-tight text-ink">{longDate}</h1>
          <p className="text-xl text-ink-muted">{household.name}</p>
        </div>
        <nav className="flex flex-wrap gap-2">
          <NavLink href="/calendar" primary>
            Calendar
          </NavLink>
          <NavLink href="/routines">Routines</NavLink>
          <NavLink href="/household">Household &amp; people</NavLink>
        </nav>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <ViewChooser views={views} current={savedView} returnTo="" returnPath="/" />

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
        <section className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          {todayProfile ? (
            <ProfileCard
              profile={todayProfile}
              label={profileLabel(todayProfile.kind, weekdayLabel(today, household, "long"))}
              household={household}
            />
          ) : null}

          <div className="flex flex-col rounded-[var(--radius)] border-2 border-frame bg-board p-5 lg:min-h-0 lg:flex-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-ink">Today&apos;s plan</h2>
              <Link
                href={`/calendar?view=week&date=${today}&add=${today}`}
                className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-marker-blue px-4 text-lg text-board"
              >
                + Add
              </Link>
            </div>
            {todayItems.length === 0 ? (
              <p className="py-6 text-center text-xl text-ink-muted">Nothing on the calendar today.</p>
            ) : (
              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <TodayList
                items={todayItems}
                now={now}
                today={today}
                household={household}
                layerById={layerById}
                memberById={memberById}
              />
              </div>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-col lg:min-h-0">
          <RoutinesGlance data={routineData} date={today} household={household} />
        </section>

        <section className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          <h2 className="text-2xl font-semibold text-ink">Coming up</h2>
          <ul className="flex flex-col gap-2">
            {days.slice(1).map((day) => {
              const profile = profiles.get(day);
              const dayItems = sortForDay(eventsOnDay(shown, day, timeZone), timeZone);
              return (
                <li key={day}>
                  <Link
                    href={`/calendar?view=week&date=${day}`}
                    className="flex min-h-[var(--touch-target)] flex-col justify-center gap-0.5 rounded-[var(--radius)] border-2 border-frame bg-board px-4 py-2 hover:bg-panel"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-lg font-semibold text-ink">
                        {new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "short", day: "numeric" }).format(noon(day))}
                      </span>
                      {profile ? <ProfileTag kind={profile.kind} /> : null}
                    </span>
                    <span className="truncate text-base text-ink-muted">
                      {dayItems.length === 0
                        ? "Nothing planned"
                        : dayItems
                            .slice(0, 2)
                            .map((e) => e.title)
                            .join(", ") + (dayItems.length > 2 ? ` and ${dayItems.length - 2} more` : "")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-ink-muted">
            Free and busy use the day from {clockTime(zonedToUtc(today, dayProfile.dayStarts, timeZone), household)} to{" "}
            {clockTime(zonedToUtc(today, dayProfile.dayEnds, timeZone), household)} (you can change this on{" "}
            <Link href="/household" className="text-marker-blue underline">
              Household &amp; people
            </Link>
            )
          </p>
        </section>
      </div>
    </>
  );
}

/** The big "Free Saturday" / "Busy evening" card. */
function ProfileCard({ profile, label, household }: { profile: DayProfile; label: string; household: Household }) {
  const { timeZone, dayProfile } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const time = (t: string) => clockTime(zonedToUtc(today, t, timeZone), household);
  // Times like "9 p.m." already end in a full stop, so don't add a second.
  const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);
  const detail =
    profile.kind === "busy_evening"
      ? `${formatMinutes(profile.eveningMinutes)} of plans after ${time(dayProfile.eveningStarts)}, and ${formatMinutes(profile.freeMinutes)} free overall`
      : profile.kind === "busy"
        ? `${formatMinutes(profile.busyMinutes)} of plans, leaving ${formatMinutes(profile.freeMinutes)} free`
        : profile.busyMinutes === 0
          ? `Nothing planned between ${time(dayProfile.dayStarts)} and ${time(dayProfile.dayEnds)}`
          : `${formatMinutes(profile.freeMinutes)} free between ${time(dayProfile.dayStarts)} and ${time(dayProfile.dayEnds)}`;

  return (
    <div className={`rounded-[var(--radius)] border-4 bg-board p-5 ${PROFILE_CLASS[profile.kind]}`}>
      <p className="text-5xl font-semibold tracking-tight">{label}</p>
      <p className="mt-2 text-xl text-ink">{sentence(detail)}</p>
    </div>
  );
}

function TodayList({
  items,
  now,
  today,
  household,
  layerById,
  memberById,
}: {
  items: CalendarItem[];
  now: Date;
  today: LocalDate;
  household: Household;
  layerById: Map<string, Layer>;
  memberById: Map<string, Member>;
}) {
  const { timeZone } = household.settings;
  // Where the "Now" line goes: before the first timed item that hasn't ended.
  const nowIndex = items.findIndex((e) => !isAllDayStyle(e, timeZone) && new Date(e.ends_at) > now);

  return (
    <ul className="flex flex-col">
      {items.map((e, i) => {
        const allDay = isAllDayStyle(e, timeZone);
        const ended = !allDay && new Date(e.ends_at) <= now;
        const layer = layerById.get(e.layer_id);
        const member = e.member_id ? memberById.get(e.member_id) : undefined;
        const href = `/calendar?view=week&date=${today}&edit=${e.series_id}${e.occurrence_date ? `&occ=${e.occurrence_date}` : ""}`;
        return (
          <li key={e.id}>
            {i === nowIndex ? <NowLine time={shortTime(now, household)} /> : null}
            <Link
              href={href}
              className={`flex min-h-[var(--touch-target)] items-center gap-4 border-t border-frame/70 py-3 first:border-t-0 ${ended ? "opacity-50" : ""}`}
            >
              <span className="w-24 shrink-0 text-lg text-ink-muted sm:w-32">
                {allDay ? "All day" : `${shortTime(new Date(e.starts_at), household)}–${shortTime(new Date(e.ends_at), household)}`}
              </span>
              <span className={`size-4 shrink-0 rounded-full ${(CHIP_CLASS[layer?.colour ?? ""] ?? CHIP_CLASS["marker-black"]).split(" ")[0]}`} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xl font-semibold text-ink">
                  {e.recurrence_rule ? <span aria-label="Repeats">↻ </span> : null}
                  {e.title}
                </span>
                <span className="truncate text-base text-ink-muted">
                  {[layer?.name, member?.name].filter(Boolean).join(" · ")}
                  {ended ? " · done" : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
      {nowIndex === -1 && items.some((e) => !isAllDayStyle(e, timeZone)) ? <NowLine time={shortTime(now, household)} /> : null}
    </ul>
  );
}

function NowLine({ time }: { time: string }) {
  return (
    <div className="flex items-center gap-3 py-1" aria-label={`Now, ${time}`}>
      <span className="text-sm font-semibold uppercase tracking-wide text-marker-red">Now · {time}</span>
      <span className="h-0.5 flex-1 bg-marker-red" />
    </div>
  );
}

/** A time for sentences, like "5 p.m." or "5:30 p.m." (in the household's locale). */
function clockTime(instant: Date, household: Household): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(instant).replace(":00", "");
}

/** All-day items first, then by start time. */
function sortForDay(items: CalendarItem[], timeZone: string): CalendarItem[] {
  return items.toSorted((a, b) => {
    const aAll = isAllDayStyle(a, timeZone) ? 0 : 1;
    const bAll = isAllDayStyle(b, timeZone) ? 0 : 1;
    return aAll - bAll || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
}

function NavLink({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-5 text-lg ${
        primary ? "bg-marker-blue text-board" : "border-2 border-frame bg-board text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
