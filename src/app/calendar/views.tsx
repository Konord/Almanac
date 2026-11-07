import Link from "next/link";
import { Emoji } from "@/components/ui";
import { EVERYONE_COLOUR, soft, strong } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import type { Household } from "@/lib/household";
import { fiveRowMonth, layoutDay, monthOf } from "@/lib/calendar-layout";
import { addDays, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import type { DayProfile } from "@/lib/day-profile";
import type { Break } from "@/lib/day-types";
import { ProfileTag } from "./profile-tag";
import type { CalendarItem, Member } from "./types";
import type { QuickDefaults } from "./forms";
import { PlaceOnTimeline } from "@/components/place-on-timeline";
import { DraggableEvent } from "@/components/draggable-event";
import { PendingBlock } from "@/components/pending-block";

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
  /** Breaks (holidays and the like) touching these days. */
  breaks?: Break[];
};

/** The breaks on a day. */
function breaksOn(breaks: Break[] | undefined, day: LocalDate): Break[] {
  return (breaks ?? []).filter((b) => b.start_date <= day && day <= b.end_date);
}

const BREAKS_HREF = "/routines/manage?tab=breaks";

/** Who a break is for, e.g. "Ava and Dad". */
function breakWho(b: Break, memberById: Map<string, Member>): string {
  const names = b.people.flatMap((p) => memberById.get(p.member_id)?.name ?? []);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A break's colour: the person's when it's for one person, otherwise everyone's. */
function breakColour(b: Break, memberById: Map<string, Member>): string {
  return b.people.length === 1 ? (memberById.get(b.people[0].member_id)?.colour ?? EVERYONE_COLOUR) : EVERYONE_COLOUR;
}

export type Adding = {
  placing: boolean;
  pending: QuickDefaults | null;
  /** Where tapping a day goes while adding. */
  addHref: (day: LocalDate, extra?: Record<string, string>) => string;
};

/**
 * Each event takes its (first) person's colour; events for nobody in particular
 * are "everyone" orange. On Today, pass the column's person so an event for
 * two people takes each one's colour in their own column.
 */
export function eventColour(event: CalendarItem, memberById: Map<string, Member>, column?: string): string {
  const id = column && event.member_ids.includes(column) ? column : event.member_ids.find((m) => memberById.has(m));
  return (id ? memberById.get(id)?.colour : undefined) ?? EVERYONE_COLOUR;
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
  drag,
  colours,
}: {
  event: CalendarItem;
  colour: string;
  household: Household;
  href: string;
  style: React.CSSProperties;
  /** Makes the block draggable on a timeline. */
  drag?: {
    day: LocalDate;
    /** On Today: the person columns, and which of them this bubble covers. */
    people?: { columns: string[]; run: string[]; gap: string };
    start: number;
    minutes: number;
    first: number;
    last: number;
  };
  /** A bubble shared by several people fades from one person's colour to the next. */
  colours?: string[];
  big?: boolean;
  /** Squeezed in beside two or more others: just the picture and a clipped title. */
  narrow?: boolean;
}) {
  const className = `absolute flex overflow-hidden text-left text-ink ${
    big ? "items-start gap-2 rounded-2xl px-2.5 py-2" : "flex-col gap-px rounded-[0.875rem] px-2 py-1.25"
  }`;
  const title = `${event.title}, ${timeRange(event, household)}`;
  const background = colours && colours.length > 1 ? `linear-gradient(to right, ${colours.map(soft).join(", ")})` : soft(colour);
  const content = (
    <>
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
    </>
  );
  if (drag) {
    // Drawn by a small browser-side component so it can follow your finger.
    const { top: _top, height: _height, ...rest } = style;
    void _top;
    void _height;
    return (
      <DraggableEvent
        href={href}
        eventId={event.series_id}
        occurrenceDate={event.occurrence_date}
        day={drag.day}
        people={drag.people}
        start={drag.start}
        minutes={drag.minutes}
        first={drag.first}
        last={drag.last}
        className={className}
        style={{ ...rest, background }}
        title={title}
      >
        {content}
      </DraggableEvent>
    );
  }
  return (
    <Link href={href} scroll={false} className={className} style={{ ...style, background }} title={title}>
      {content}
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
  draggable,
}: {
  /** Lets you drag the blocks to move or stretch them. */
  draggable?: object;
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
            drag={
              draggable
                ? { day, start: block.startMin, minutes: block.endMin - block.startMin, first, last }
                : undefined
            }
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

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

/** A day's dinner, shown under the date in the week view. */
export type Dinner = { name: string; icon: string; more: number };

export function WeekView({
  household,
  days,
  today,
  events,
  memberById,
  href,
  profiles,
  adding,
  dinners,
  breaks,
}: ViewProps & { dinners: Map<LocalDate, Dinner> }) {
  const { timeZone } = household.settings;
  const { first, last } = timelineRange(events, days, timeZone);
  const now = new Date();
  const editLink = (e: CalendarItem) => href({ edit: e.series_id, occ: e.occurrence_date, add: null, panel: null });
  // The rows under the dates (all-day things, then dinner) only show when they have something.
  const anyDinner = dinners.size > 0;
  const anyAllDay = days.some((day) => breaksOn(breaks, day).length > 0 || eventsOnDay(events, day, timeZone).some((e) => isAllDayStyle(e, timeZone)));

  return (
    // On a phone the week is wider than the screen, so it scrolls sideways.
    <div className="flex min-h-[40rem] flex-col max-lg:overflow-x-auto lg:min-h-0 lg:flex-1">
      <div className="flex flex-1 flex-col max-lg:min-w-[56rem] lg:min-h-0">
        {/* Day headings and all-day things */}
        <div className="flex shrink-0 pl-16.5">
          {days.map((day) => {
            const allDay = eventsOnDay(events, day, timeZone).filter((e) => isAllDayStyle(e, timeZone));
            const profile = profiles.get(day);
            const dinner = dinners.get(day);
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
                  {breaksOn(breaks, day)
                    .slice(0, 1)
                    .map((b) => (
                      <Link
                        key={b.id}
                        href={BREAKS_HREF}
                        title={`${b.name}: ${breakWho(b, memberById)}`}
                        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 border-dashed px-2 text-sm font-bold text-ink"
                        style={{ background: soft(breakColour(b, memberById)), borderColor: strong(breakColour(b, memberById)) }}
                      >
                        <Emoji emoji={eventEmoji(b.icon, b.name)} className="size-7" />
                        <span className="truncate">{b.name}</span>
                      </Link>
                    ))}
                  {allDay.slice(0, breaksOn(breaks, day).length > 0 ? 0 : 1).map((e) => (
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
                  {allDay.length + breaksOn(breaks, day).length > 1 ? (
                    <span
                      className="shrink-0 rounded-xl bg-rail px-2 text-sm leading-10 font-bold text-ink-muted"
                      title={[...breaksOn(breaks, day).map((b) => b.name), ...allDay.map((e) => e.title)].slice(1).join(", ")}
                    >
                      +{allDay.length + breaksOn(breaks, day).length - 1}
                    </span>
                  ) : null}
                </div>
                {anyDinner ? (
                  <Link
                    href={`/meals?week=${day}`}
                    className={`flex h-9 min-w-0 items-center gap-1.5 rounded-xl px-2 text-base font-bold ${
                      dinner ? "bg-meal text-meal-ink" : "text-ink-muted"
                    }`}
                    title={dinner ? `Dinner: ${dinner.name}` : "No dinner planned"}
                  >
                    {dinner ? (
                      <>
                        <Emoji emoji={dinner.icon} className="size-6.5" />
                        <span className="min-w-0 truncate">{dinner.name}</span>
                        {dinner.more > 0 ? <span className="ml-auto shrink-0 text-sm opacity-75">+{dinner.more}</span> : null}
                      </>
                    ) : (
                      <span className="truncate pl-0.5 text-sm">No dinner yet</span>
                    )}
                  </Link>
                ) : null}
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
              data-drop-day={day}
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
                draggable={{}}
              />
              {day === today ? (
                <NowLine percent={nowPercent(now, first, last, timeZone)} label={`Now, ${shortTime(now, household)}`} />
              ) : null}
              <PendingBlock day={day} first={first} last={last} />
              {adding?.placing || adding?.pending ? (
                <PlaceOnTimeline
                  moveTo={adding.pending ? { day } : undefined}
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

/** How many timed events a month cell lists before "+ N more". */
const MONTH_CELL_LIMIT = 4;
/** How many stickers fit beside the date number. */
const MONTH_STICKER_LIMIT = 4;
/** In a square shared by two days ("23/30"), each half lists this many. */
const SHARED_CELL_LIMIT = 1;
const SHARED_STICKER_LIMIT = 2;

/**
 * The month grid, used two ways:
 * - "month": a calendar month, always 5 rows. A month that needs a 6th week
 *   puts its last days in the same squares as the week before ("23/30").
 * - "weeks": a rolling 5 weeks starting with this week, like the kitchen
 *   whiteboard. Days already gone are crossed out.
 */
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
  mode,
  breaks,
}: ViewProps & { anchor: LocalDate; mode: "month" | "weeks" }) {
  const { locale, timeZone } = household.settings;
  const month = monthOf(anchor);
  const { cells, shared } = mode === "month" ? fiveRowMonth(days) : { cells: days, shared: new Map<LocalDate, LocalDate>() };
  const weeks = cells.length / 7;
  const shortMonth = (day: LocalDate) =>
    new Intl.DateTimeFormat(locale, { timeZone, month: "short" }).format(zonedToUtc(day, "12:00", timeZone));

  // One day's part of a square: the date and stickers, then timed events.
  const dayContent = (day: LocalDate, half: boolean) => {
    // Connor's sketch (2026-11-05): all-day things are stickers beside the date;
    // timed events are lines of picture, title in the person's colour, and time.
    const dayEvents = eventsOnDay(events, day, timeZone);
    const stickers = dayEvents.filter((e) => isAllDayStyle(e, timeZone));
    const timed = dayEvents
      .filter((e) => !isAllDayStyle(e, timeZone))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const shownStickers = stickers.slice(0, half ? SHARED_STICKER_LIMIT : MONTH_STICKER_LIMIT);
    const shown = timed.slice(0, half ? SHARED_CELL_LIMIT : MONTH_CELL_LIMIT);
    const more = timed.length - shown.length + stickers.length - shownStickers.length;
    const editHref = (e: CalendarItem) => href({ edit: e.series_id, occ: e.occurrence_date, add: null, panel: null });
    const inMonth = mode === "weeks" || monthOf(day) === month;
    const past = mode === "weeks" && day < today;
    const profile = profiles.get(day);
    const weekHref = href({ view: "week", date: day, edit: null, add: null, panel: null });
    // In the rolling view, the 1st of a month (and the first square) says which month.
    const label = mode === "weeks" && (day.endsWith("-01") || day === cells[0]) ? `${shortMonth(day)} ${Number(day.slice(8))}` : String(Number(day.slice(8)));
    return (
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden ${past ? "opacity-45" : ""}`}>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={weekHref}
            className={`flex h-9 min-w-9 items-center justify-center rounded-full px-1.5 text-xl font-bold whitespace-nowrap ${
              day === today ? "bg-now text-white" : inMonth ? "text-ink" : "text-ink-muted"
            } ${past ? "line-through decoration-2" : ""}`}
            title="Open this week"
          >
            {label}
          </Link>
          {breaksOn(breaks, day)
            .slice(0, 1)
            .map((b) => (
              <Link
                key={b.id}
                href={BREAKS_HREF}
                title={`${b.name}: ${breakWho(b, memberById)}`}
                aria-label={`${b.name}, a break for ${breakWho(b, memberById)}`}
                className="shrink-0 rounded-lg border-2 border-dashed p-px"
                style={{ background: soft(breakColour(b, memberById)), borderColor: strong(breakColour(b, memberById)) }}
              >
                <Emoji emoji={eventEmoji(b.icon, b.name)} className="size-7" />
              </Link>
            ))}
          {shownStickers.map((e) => (
            <Link key={e.id} href={editHref(e)} scroll={false} title={e.title} aria-label={`${e.title}, all day`} className="shrink-0">
              <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-8" />
            </Link>
          ))}
          {inMonth && !past && profile && profile.kind !== "free" ? (
            <span className="ml-auto">
              <ProfileTag kind={profile.kind} />
            </span>
          ) : null}
        </div>
        {shown.map((e) => (
          <Link
            key={e.id}
            href={editHref(e)}
            scroll={false}
            title={`${e.title}, ${timeRange(e, household)}`}
            className="flex min-h-0 shrink items-center gap-1.5 overflow-hidden px-1 text-base font-bold"
          >
            <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-6" />
            <span className="min-w-0 truncate" style={{ color: strong(eventColour(e, memberById)) }}>
              {e.title}
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink-soft">{shortTime(new Date(e.starts_at), household)}</span>
          </Link>
        ))}
        {more > 0 ? (
          <Link href={weekHref} className="shrink-0 px-1.5 text-sm font-bold text-ink-muted">
            + {more} more
          </Link>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-[40rem] flex-col lg:min-h-0 lg:flex-1">
      <div className="grid shrink-0 grid-cols-7">
        {cells.slice(0, 7).map((day) => (
          <div key={day} className="px-3 pb-2 text-xl font-bold text-ink-muted">
            {weekdayLabel(day, household)}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden rounded-[var(--radius-card)] border border-frame"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {cells.map((day, i) => {
          const second = shared.get(day);
          const inMonth = mode === "weeks" || monthOf(day) === month;
          const pendingHere = adding?.pending?.date === day || (second !== undefined && adding?.pending?.date === second);
          const addLink = (d: LocalDate, className: string) =>
            adding?.placing ? (
              <Link
                href={adding.addHref(d, { allday: "1" })}
                scroll={false}
                aria-label={`Add an event on ${weekdayLabel(d, household, "long")} ${Number(d.slice(8))}`}
                className={`absolute z-10 hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] ${className}`}
              />
            ) : null;
          return (
            <div
              key={day}
              className={`relative flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden border-frame p-1.5 ${i % 7 === 0 ? "" : "border-l"} ${
                i >= 7 ? "border-t" : ""
              } ${inMonth ? "bg-board" : "bg-rail"} ${pendingHere ? "outline-3 -outline-offset-3 outline-accent" : ""}`}
            >
              {second ? (
                <>
                  {addLink(day, "inset-x-0 top-0 h-1/2")}
                  {addLink(second, "inset-x-0 bottom-0 h-1/2")}
                  {dayContent(day, true)}
                  {/* A thin line between the two days sharing the square. */}
                  <div className="shrink-0 border-t border-dashed border-frame" aria-hidden />
                  {dayContent(second, true)}
                </>
              ) : (
                <>
                  {addLink(day, "inset-0")}
                  {dayContent(day, false)}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { weekdayLabel };
