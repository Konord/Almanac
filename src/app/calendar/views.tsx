import Link from "next/link";
import { Emoji } from "@/components/ui";
import { EVERYONE_COLOUR, soft } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import type { Household } from "@/lib/household";
import { layoutDay, monthOf } from "@/lib/calendar-layout";
import { addDays, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import type { DayProfile } from "@/lib/day-profile";
import { ProfileTag } from "./profile-tag";
import type { CalendarItem, Member } from "./types";
import type { QuickDefaults } from "./forms";
import { PlaceOnTimeline } from "@/components/place-on-timeline";

type ViewProps = {
  household: Household;
  days: LocalDate[];
  today: LocalDate;
  events: CalendarItem[];
  memberById: Map<string, Member>;
  /** Builds a link back to this page with some settings changed. */
  href: (changes: Record<string, string | null>) => string;
  /** Each day's free/busy profile. */
  profiles: Map<LocalDate, DayProfile>;
  /** Adding by placing: whether we're in adding mode, and the event being added. */
  adding?: Adding;
};

export type Adding = {
  placing: boolean;
  pending: QuickDefaults | null;
  /** Where tapping a day goes while adding. */
  addHref: (day: LocalDate, extra?: Record<string, string>) => string;
};

/** Each event takes its person's colour; events for nobody in particular are "everyone" orange. */
export function eventColour(event: CalendarItem, memberById: Map<string, Member>): string {
  return (event.member_id ? memberById.get(event.member_id)?.colour : undefined) ?? EVERYONE_COLOUR;
}

function dayBounds(day: LocalDate, timeZone: string) {
  return {
    start: zonedToUtc(day, "00:00", timeZone),
    end: zonedToUtc(addDays(day, 1), "00:00", timeZone),
  };
}

export function eventsOnDay(events: CalendarItem[], day: LocalDate, timeZone: string) {
  const { start, end } = dayBounds(day, timeZone);
  return events.filter((e) => new Date(e.starts_at) < end && new Date(e.ends_at) > start);
}

/** All-day events, and timed events that run past midnight, go in the top row. */
export function isAllDayStyle(event: CalendarItem, timeZone: string): boolean {
  if (event.all_day) return true;
  return (
    localDateOf(new Date(event.starts_at), timeZone) !==
    localDateOf(new Date(new Date(event.ends_at).getTime() - 1), timeZone)
  );
}

export function minutesIntoDay(instant: Date, timeZone: string): number {
  const [h, m] = localTimeOf(instant, timeZone).split(":").map(Number);
  return h * 60 + m;
}

export function shortTime(instant: Date, household: Household): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(instant)
    .replace(":00", "")
    .replace(/\s?([ap])\.?m\.?/i, "$1");
}

/** "9:30–12" style range, dropping the am/pm the way a wall calendar would. */
export function timeRange(event: CalendarItem, household: Household): string {
  const strip = (t: string) => t.replace(/[ap]$/, "");
  return `${strip(shortTime(new Date(event.starts_at), household))}–${strip(shortTime(new Date(event.ends_at), household))}`;
}

function weekdayLabel(day: LocalDate, household: Household, style: "short" | "long" = "short"): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: style }).format(zonedToUtc(day, "12:00", timeZone));
}

/** The hour label down the side, like "8 am". */
function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 || hour === 24 ? "am" : "pm"}`;
}

// ---------------------------------------------------------------------------
// The timeline (shared by the week view and the Today screen)
// ---------------------------------------------------------------------------

/**
 * Which hours the timeline shows: 8am to 9pm, stretched to fit anything
 * earlier or later. Everything is placed by percentage of this range, so
 * the timeline always fills exactly the space it's given.
 */
export function timelineRange(events: CalendarItem[], days: LocalDate[], timeZone: string) {
  let first = 8;
  let last = 21;
  for (const day of days) {
    for (const e of eventsOnDay(events, day, timeZone)) {
      if (isAllDayStyle(e, timeZone)) continue;
      first = Math.min(first, Math.floor(minutesIntoDay(new Date(e.starts_at), timeZone) / 60));
      last = Math.max(last, Math.ceil((minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60) / 60));
    }
  }
  return { first, last };
}

/** Hour lines and labels behind the timeline columns. */
export function HourLines({ first, last }: { first: number; last: number }) {
  const span = last - first;
  const stepHours = span > 10 ? 2 : 1;
  const hours: number[] = [];
  for (let h = Math.ceil(first / stepHours) * stepHours; h < last; h += stepHours) hours.push(h);
  return (
    <>
      {hours.map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute inset-x-0 border-t border-grid"
          style={{ top: `${((h - first) / span) * 100}%` }}
        >
          <span className="absolute -top-3.25 left-0 bg-board pr-2 text-lg leading-none font-bold text-ink-muted">
            {hourLabel(h)}
          </span>
        </div>
      ))}
    </>
  );
}

/** The red "now" line with its dot. */
export function NowLine({ percent, label }: { percent: number; label: string }) {
  if (percent < 0 || percent > 100) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 border-t-[3px] border-now"
      style={{ top: `${percent}%` }}
      aria-label={label}
    >
      <span className="absolute -top-2 -left-1.75 size-3.25 rounded-full bg-now" />
    </div>
  );
}

/** One pastel event block on a timeline. */
export function EventBlock({
  event,
  colour,
  household,
  href,
  style,
  big = false,
  narrow = false,
}: {
  event: CalendarItem;
  colour: string;
  household: Household;
  href: string;
  style: React.CSSProperties;
  big?: boolean;
  /** Squeezed in beside two or more others: just the picture and a clipped title. */
  narrow?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`absolute flex overflow-hidden text-left text-ink ${
        big ? "items-start gap-2 rounded-2xl px-2.5 py-2" : "flex-col gap-px rounded-[0.875rem] px-2 py-1.25"
      }`}
      style={{ ...style, background: soft(colour) }}
      title={`${event.title}, ${timeRange(event, household)}`}
    >
      {narrow ? (
        <>
          <Emoji emoji={eventEmoji(event.icon, event.title)} className="size-6" />
          <span className="truncate text-sm leading-[1.1] font-bold">{event.title}</span>
        </>
      ) : big ? (
        <>
          <Emoji emoji={eventEmoji(event.icon, event.title)} className="size-8.5" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xl leading-[1.1] font-bold">{event.title}</span>
            <span className="truncate text-sm font-semibold text-ink-soft">{timeRange(event, household)}</span>
          </span>
        </>
      ) : (
        <>
          <span className="flex w-full items-start gap-1.5">
            <Emoji emoji={eventEmoji(event.icon, event.title)} className="size-6" />
            <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-[1.1] font-bold">
              {event.recurrence_rule ? <span className="sr-only">Repeats: </span> : null}
              {event.title}
            </span>
          </span>
          <span className="truncate pl-7.5 text-sm leading-[1.1] font-semibold text-ink-soft">
            {timeRange(event, household)}
          </span>
        </>
      )}
    </Link>
  );
}

/** Lays out one day's timed events as blocks, side by side where they overlap. */
export function DayBlocks({
  events,
  day,
  first,
  last,
  household,
  memberById,
  linkFor,
  big = false,
  colourFor,
}: {
  events: CalendarItem[];
  day: LocalDate;
  first: number;
  last: number;
  household: Household;
  memberById: Map<string, Member>;
  linkFor: (e: CalendarItem) => string;
  big?: boolean;
  colourFor?: (e: CalendarItem) => string;
}) {
  const { timeZone } = household.settings;
  const dayEvents = eventsOnDay(events, day, timeZone).filter((e) => !isAllDayStyle(e, timeZone));
  const byId = new Map(dayEvents.map((e) => [e.id, e]));
  const placed = layoutDay(
    dayEvents.map((e) => ({
      id: e.id,
      startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
      endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
    })),
  );
  const span = (last - first) * 60;
  const gap = big ? "3px" : "2px";
  return (
    <>
      {placed.map((block) => {
        const event = byId.get(block.id)!;
        const top = ((block.startMin - first * 60) / span) * 100;
        const height = (Math.max(block.endMin - block.startMin, 30) / span) * 100;
        return (
          <EventBlock
            key={block.id}
            event={event}
            colour={colourFor ? colourFor(event) : eventColour(event, memberById)}
            household={household}
            href={linkFor(event)}
            big={big}
            narrow={!big && block.lanes >= 3}
            style={{
              top: `calc(${top}% + ${gap})`,
              height: `calc(${height}% - 2 * ${gap})`,
              left: `calc(${(block.lane / block.lanes) * 100}% + 4px)`,
              width: `calc(${100 / block.lanes}% - 8px)`,
            }}
          />
        );
      })}
    </>
  );
}

/** Where "now" sits on a timeline, as a percentage (outside 0–100 when off the timeline). */
export function nowPercent(now: Date, first: number, last: number, timeZone: string): number {
  return ((minutesIntoDay(now, timeZone) - first * 60) / ((last - first) * 60)) * 100;
}

/** A dashed outline where the event you're adding will go. */
export function PendingBlock({ pending, day, first, last }: { pending: QuickDefaults | null | undefined; day: LocalDate; first: number; last: number }) {
  if (!pending || pending.date !== day || pending.allDay || !pending.startTime) return null;
  const [h, m] = pending.startTime.split(":").map(Number);
  const span = (last - first) * 60;
  const top = ((h * 60 + m - first * 60) / span) * 100;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-1 z-10 rounded-[0.875rem] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_12%,white)]"
      style={{ top: `${top}%`, height: `${(pending.minutes / span) * 100}%` }}
    />
  );
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

export function WeekView({ household, days, today, events, memberById, href, profiles, adding }: ViewProps) {
  const { timeZone } = household.settings;
  const { first, last } = timelineRange(events, days, timeZone);
  const now = new Date();
  const editLink = (e: CalendarItem) => href({ edit: e.series_id, occ: e.occurrence_date, add: null, panel: null });
  // The row under the dates (all-day things now; dinner joins it later) only shows when it has something.
  const anyAllDay = days.some((day) => eventsOnDay(events, day, timeZone).some((e) => isAllDayStyle(e, timeZone)));

  return (
    // On a phone the week is wider than the screen, so it scrolls sideways.
    <div className="flex min-h-[40rem] flex-col max-lg:overflow-x-auto lg:min-h-0 lg:flex-1">
      <div className="flex flex-1 flex-col max-lg:min-w-[56rem] lg:min-h-0">
        {/* Day headings and all-day things */}
        <div className="flex shrink-0 pl-16.5">
          {days.map((day) => {
            const allDay = eventsOnDay(events, day, timeZone).filter((e) => isAllDayStyle(e, timeZone));
            const profile = profiles.get(day);
            return (
              <div key={day} className="flex min-w-0 flex-1 basis-0 flex-col gap-2 px-1">
                <Link
                  href={adding ? adding.addHref(day, { allday: "1" }) : href({ add: day, allday: "1", edit: null, panel: null })}
                  scroll={false}
                  title="Add an all-day event on this day"
                  className="flex h-12.5 items-center gap-2 rounded-xl pl-2.5 text-2xl font-bold text-ink hover:bg-rail lg:text-3xl"
                >
                  {weekdayLabel(day, household)}
                  <span
                    className={`flex h-11.5 min-w-11.5 items-center justify-center rounded-full px-2 ${day === today ? "bg-now text-white" : ""}`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {profile && profile.kind !== "free" ? (
                    <span className="hidden xl:inline">
                      <ProfileTag kind={profile.kind} />
                    </span>
                  ) : null}
                </Link>
                <div className={`h-10 items-center gap-1 ${anyAllDay ? "flex" : "hidden"}`}>
                  {allDay.slice(0, 1).map((e) => (
                    <Link
                      key={e.id}
                      href={editLink(e)}
                      scroll={false}
                      className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-sm font-bold text-ink"
                      style={{ background: soft(eventColour(e, memberById)) }}
                    >
                      <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-7" />
                      <span className="truncate">{e.title}</span>
                    </Link>
                  ))}
                  {allDay.length > 1 ? (
                    <span
                      className="shrink-0 rounded-xl bg-rail px-2 text-sm leading-10 font-bold text-ink-muted"
                      title={allDay
                        .slice(1)
                        .map((e) => e.title)
                        .join(", ")}
                    >
                      +{allDay.length - 1}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* The timeline */}
        <div className="relative mt-5 mb-1 flex min-h-0 flex-1 pl-16.5">
          <HourLines first={first} last={last} />
          {days.map((day) => (
            <div
              key={day}
              className={`relative min-w-0 flex-1 basis-0 border-l border-panel ${day === today ? "bg-[#FCFCFD]" : ""}`}
            >
              <DayBlocks
                events={events}
                day={day}
                first={first}
                last={last}
                household={household}
                memberById={memberById}
                linkFor={editLink}
              />
              {day === today ? (
                <NowLine percent={nowPercent(now, first, last, timeZone)} label={`Now, ${shortTime(now, household)}`} />
              ) : null}
              <PendingBlock pending={adding?.pending} day={day} first={first} last={last} />
              {adding?.placing ? (
                <PlaceOnTimeline
                  href={adding.addHref(day)}
                  first={first}
                  last={last}
                  defaultMinutes={household.settings.defaultEventMinutes}
                  label={`Add an event on ${weekdayLabel(day, household, "long")}`}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

/** How many things a month cell lists before "+ N more". */
const MONTH_CELL_LIMIT = 4;

export function MonthView({
  household,
  days,
  today,
  events,
  memberById,
  href,
  profiles,
  anchor,
  adding,
}: ViewProps & { anchor: LocalDate }) {
  const { timeZone } = household.settings;
  const month = monthOf(anchor);
  const weeks = days.length / 7;

  return (
    <div className="flex min-h-[40rem] flex-col lg:min-h-0 lg:flex-1">
      <div className="grid shrink-0 grid-cols-7">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-3 pb-2 text-xl font-bold text-ink-muted">
            {weekdayLabel(day, household)}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden rounded-[var(--radius-card)] border border-frame"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(events, day, timeZone).sort((a, b) => {
            const aAll = isAllDayStyle(a, timeZone) ? 0 : 1;
            const bAll = isAllDayStyle(b, timeZone) ? 0 : 1;
            return aAll - bAll || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
          });
          const shown = dayEvents.slice(0, MONTH_CELL_LIMIT);
          const more = dayEvents.length - shown.length;
          const inMonth = monthOf(day) === month;
          const profile = profiles.get(day);
          return (
            <div
              key={day}
              className={`relative flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden border-frame p-1.5 ${i % 7 === 0 ? "" : "border-l"} ${
                i >= 7 ? "border-t" : ""
              } ${inMonth ? "bg-board" : "bg-rail"} ${adding?.pending?.date === day ? "outline-3 -outline-offset-3 outline-accent" : ""}`}
            >
              {adding?.placing ? (
                <Link
                  href={adding.addHref(day, { allday: "1" })}
                  scroll={false}
                  aria-label={`Add an event on ${weekdayLabel(day, household, "long")} ${Number(day.slice(8))}`}
                  className="absolute inset-0 z-10 hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]"
                />
              ) : null}
              <div className="flex shrink-0 items-center justify-between gap-1">
                <Link
                  href={href({
                    view: "week",
                    date: day,
                    edit: null,
                    add: null,
                    panel: null,
                  })}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full px-1.5 text-xl font-bold ${
                    day === today ? "bg-now text-white" : inMonth ? "text-ink" : "text-ink-muted"
                  }`}
                  title="Open this week"
                >
                  {Number(day.slice(8))}
                </Link>
                {inMonth && profile && profile.kind !== "free" ? <ProfileTag kind={profile.kind} /> : null}
              </div>
              {shown.map((e) => (
                <Link
                  key={e.id}
                  href={href({
                    edit: e.series_id,
                    occ: e.occurrence_date,
                    add: null,
                    panel: null,
                  })}
                  scroll={false}
                  className="flex min-h-0 shrink items-center gap-1.5 overflow-hidden rounded-lg px-1.5 py-0.5 text-sm font-bold text-ink"
                  style={{ background: soft(eventColour(e, memberById)) }}
                >
                  <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-5.5" />
                  {isAllDayStyle(e, timeZone) ? null : (
                    <span className="shrink-0 font-semibold text-ink-soft">
                      {shortTime(new Date(e.starts_at), household)}
                    </span>
                  )}
                  <span className="truncate">{e.title}</span>
                </Link>
              ))}
              {more > 0 ? (
                <Link
                  href={href({
                    view: "week",
                    date: day,
                    edit: null,
                    add: null,
                    panel: null,
                  })}
                  className="shrink-0 px-1.5 text-sm font-bold text-ink-muted"
                >
                  + {more} more
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { weekdayLabel };
