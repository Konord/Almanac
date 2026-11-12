import Link from "next/link";
import { Emoji } from "@/components/ui";
import { EVERYONE_COLOUR, soft, strong } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import type { Household } from "@/lib/household";
import { fiveRowMonth, layoutBars, layoutDay, monthOf } from "@/lib/calendar-layout";
import { addDays, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import type { Break } from "@/lib/day-types";
import { specialLabel, type SpecialDay } from "@/lib/holidays";
import type { CalendarItem, Member } from "./types";
import type { QuickDefaults } from "./forms";
import { PlaceOnTimeline } from "@/components/place-on-timeline";
import { DraggableEvent } from "@/components/draggable-event";
import { DraggableMeal } from "@/components/draggable-meal";
import { StretchBar } from "@/components/stretch-bar";
import { PendingBlock } from "@/components/pending-block";

type ViewProps = {
  household: Household;
  days: LocalDate[];
  today: LocalDate;
  events: CalendarItem[];
  memberById: Map<string, Member>;
  /** Builds a link back to this page with some settings changed. */
  href: (changes: Record<string, string | null>) => string;
  /** Adding by placing: whether we're in adding mode, and the event being added. */
  adding?: Adding;
  /** Breaks (summer, a sick day) touching these days. */
  breaks?: Break[];
  /** Holidays and birthdays, by date. */
  specials?: Map<LocalDate, SpecialDay[]>;
};

const HOLIDAYS_HREF = "/holidays";
/** Holidays and birthdays each have their own colour, so they stand out from events. */
const HOLIDAY_COLOUR = "purple";
const BIRTHDAY_COLOUR = "pink";

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

/** An event shared by two or more people: each one's colour, so it fades from one to the next. */
function sharedColours(event: CalendarItem, memberById: Map<string, Member>): string[] | undefined {
  const colours = event.member_ids.map((id) => memberById.get(id)?.colour).filter((c): c is string => Boolean(c));
  return colours.length > 1 ? colours : undefined;
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

/**
 * A point event: a time with no length ("Homework due 9am"). It shows as a
 * dot with a time, never makes anyone busy and never pushes routines.
 */
export function isPointEvent(event: Pick<CalendarItem, "all_day" | "starts_at" | "ends_at">): boolean {
  return !event.all_day && new Date(event.starts_at).getTime() === new Date(event.ends_at).getTime();
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
  if (isPointEvent(event)) return shortTime(new Date(event.starts_at), household);
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
    /** On the week view: the week's days, so its sides stretch it over more days. */
    week?: LocalDate[];
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
        week={drag.week}
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
  /** Lets you drag the blocks to move or stretch them (and, given the week's days, over more days). */
  draggable?: { week?: LocalDate[] };
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
  const onDay = eventsOnDay(events, day, timeZone).filter((e) => !isAllDayStyle(e, timeZone));
  const dayEvents = onDay.filter((e) => !isPointEvent(e));
  const points = onDay.filter(isPointEvent);
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
            colours={colourFor ? undefined : sharedColours(event, memberById)}
            household={household}
            href={linkFor(event)}
            big={big}
            narrow={!big && block.lanes >= 3}
            drag={
              draggable
                ? { day, start: block.startMin, minutes: block.endMin - block.startMin, first, last, week: draggable.week }
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
      {points.map((event) => {
        const minute = minutesIntoDay(new Date(event.starts_at), timeZone);
        if (minute < first * 60 || minute > last * 60) return null;
        return (
          <EventPoint
            key={event.id}
            event={event}
            colour={colourFor ? colourFor(event) : eventColour(event, memberById)}
            household={household}
            href={linkFor(event)}
            top={((minute - first * 60) / span) * 100}
            box={{ left: "4px", width: "calc(100% - 8px)" }}
            big={big}
          />
        );
      })}
    </>
  );
}

/** A point event on a timeline: a dot on the line at its time, its picture and title beside it. */
export function EventPoint({
  event,
  colour,
  household,
  href,
  top,
  box,
  big = false,
}: {
  event: CalendarItem;
  colour: string;
  household: Household;
  href: string;
  /** Where its time sits, as a percentage down the timeline. */
  top: number;
  box: { left: string; width: string };
  big?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      title={`${event.title}, ${shortTime(new Date(event.starts_at), household)}`}
      className={`pointer-events-auto absolute z-[2] flex -translate-y-1/2 items-center gap-1.5 overflow-hidden ${big ? "h-9" : "h-7"}`}
      style={{ top: `${top}%`, ...box }}
    >
      <span className="size-3.5 shrink-0 rounded-full" style={{ background: strong(colour) }} aria-hidden />
      <span className={`flex min-w-0 items-center gap-1.5 rounded-lg bg-board/90 px-1.5 font-bold text-ink ${big ? "text-lg" : "text-sm"}`}>
        <Emoji emoji={eventEmoji(event.icon, event.title)} className={big ? "size-7" : "size-5"} />
        <span className="min-w-0 truncate">{event.title}</span>
        <span className="shrink-0 font-semibold text-ink-soft">{shortTime(new Date(event.starts_at), household)}</span>
      </span>
    </Link>
  );
}

/** A list task with a day and a time on a timeline: a hollow dot, its words in handwriting. */
export type TaskPointItem = {
  id: string;
  list_id: string;
  title: string;
  due_date: LocalDate | null;
  at_time: string | null;
  date_kind: "due" | "start";
  assignee_id: string | null;
  link: string | null;
  template_id: string | null;
};

/** Minutes into the day of a task's "09:30" time. */
export function taskMinute(task: Pick<TaskPointItem, "at_time">): number {
  return Number(task.at_time!.slice(0, 2)) * 60 + Number(task.at_time!.slice(3, 5));
}

export function TodoPoint({
  todo,
  top,
  box,
  colour,
  big = true,
}: {
  todo: TaskPointItem;
  top: number;
  box: { left: string; width: string };
  colour: string;
  big?: boolean;
}) {
  // A list task opens its edit card on the Lists screen; a chore its link or its list.
  const href = todo.template_id ? (todo.link ?? `/lists?list=${todo.list_id}`) : `/lists?list=${todo.list_id}&edit=${todo.id}`;
  return (
    <Link
      href={href}
      title={todo.date_kind === "due" ? `${todo.title} (by then)` : todo.title}
      className={`pointer-events-auto absolute z-[2] flex -translate-y-1/2 items-center gap-1.5 overflow-hidden ${big ? "h-8" : "h-7"}`}
      style={{ top: `${top}%`, ...box }}
    >
      <span className="size-3.5 shrink-0 rounded-full border-[3px] bg-board" style={{ borderColor: strong(colour) }} aria-hidden />
      <span className={`min-w-0 truncate rounded-lg bg-board/90 px-1.5 font-hand leading-none text-ink ${big ? "text-xl" : "text-lg"}`}>
        {todo.title}
      </span>
    </Link>
  );
}

/** Where "now" sits on a timeline, as a percentage (outside 0–100 when off the timeline). */
export function nowPercent(now: Date, first: number, last: number, timeZone: string): number {
  return ((minutesIntoDay(now, timeZone) - first * 60) / ((last - first) * 60)) * 100;
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

/**
 * A holiday or birthday on the week view: a ribbon in its own colour with
 * notched ends, above the day's all-day things.
 */
export function Ribbon({ special, more = 0, big = false }: { special: SpecialDay; more?: number; big?: boolean }) {
  const colour = special.kind === "holiday" ? HOLIDAY_COLOUR : BIRTHDAY_COLOUR;
  const notch = big ? "1rem" : "0.625rem";
  return (
    <Link
      href={HOLIDAYS_HREF}
      title={specialLabel(special)}
      className={`flex min-w-0 flex-1 items-center justify-center gap-2 font-extrabold text-white ${big ? "h-14 px-8 text-2xl" : "h-10 px-4 text-sm"}`}
      style={{
        background: strong(colour),
        clipPath: `polygon(0 0, 100% 0, calc(100% - ${notch}) 50%, 100% 100%, 0 100%, ${notch} 50%)`,
      }}
    >
      <Emoji emoji={special.icon} className={big ? "size-10" : "size-7"} />
      <span className="truncate">{specialLabel(special)}</span>
      {more > 0 ? <span className="shrink-0 opacity-80">+{more}</span> : null}
    </Link>
  );
}

/** How many rows of all-day bars fit above the week's timeline. */
const ALL_DAY_LANES = 2;

type AllDayBar = {
  id: string;
  first: number;
  last: number;
  lane: number;
  label: string;
  title: string;
  emoji: string;
  colour: string;
  href: string;
  /** Breaks have a dashed edge, so they don't look like events. */
  dashed: boolean;
  /** Its first start time, for a timed event over several days. */
  time: string | null;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Events (not breaks) can be stretched over more days. */
  stretch?: { eventId: string; occurrenceDate: string | null };
};

/**
 * The week's all-day row: breaks, all-day events and timed events that run
 * past midnight, each one bar across the days it covers (a trip from
 * Thursday to Sunday is one bar, not four). Up to two rows; anything more
 * shows as "+ N" on its days.
 */
function allDayBars({
  days,
  events,
  breaks,
  household,
  memberById,
  editLink,
}: {
  days: LocalDate[];
  events: CalendarItem[];
  breaks: Break[] | undefined;
  household: Household;
  memberById: Map<string, Member>;
  editLink: (e: CalendarItem) => string;
}): { bars: AllDayBar[]; lanes: number; hidden: number[]; hiddenNames: string[] } {
  const { timeZone } = household.settings;
  const columnOf = (day: LocalDate) => (day < days[0] ? 0 : day > days[days.length - 1] ? days.length - 1 : days.indexOf(day));
  type Item = Omit<AllDayBar, "lane" | "first" | "last"> & { from: LocalDate; to: LocalDate };
  const items: Item[] = [];
  for (const b of breaks ?? []) {
    if (b.end_date < days[0] || b.start_date > days[days.length - 1]) continue;
    const who = breakWho(b, memberById);
    items.push({
      id: `break-${b.id}`,
      from: b.start_date,
      to: b.end_date,
      label: b.name,
      title: who ? `${b.name}: ${who}` : b.name,
      emoji: eventEmoji(b.icon, b.name),
      colour: breakColour(b, memberById),
      href: BREAKS_HREF,
      dashed: true,
      time: null,
      continuesBefore: false,
      continuesAfter: false,
    });
  }
  for (const e of events) {
    if (!isAllDayStyle(e, timeZone)) continue;
    const from = localDateOf(new Date(e.starts_at), timeZone);
    // All-day events end at midnight after their last day.
    const to = localDateOf(new Date(new Date(e.ends_at).getTime() - 1), timeZone);
    if (to < days[0] || from > days[days.length - 1]) continue;
    const time = e.all_day ? null : shortTime(new Date(e.starts_at), household);
    items.push({
      id: e.id,
      from,
      to,
      label: e.title,
      title: e.all_day ? e.title : `${e.title}, ${time} until ${shortTime(new Date(e.ends_at), household)}`,
      emoji: eventEmoji(e.icon, e.title),
      colour: eventColour(e, memberById),
      href: editLink(e),
      dashed: false,
      time: from >= days[0] ? time : null,
      stretch: { eventId: e.series_id, occurrenceDate: e.occurrence_date },
      continuesBefore: false,
      continuesAfter: false,
    });
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const { placed, hidden } = layoutBars(
    items.map((item) => ({ id: item.id, first: columnOf(item.from), last: columnOf(item.to) })),
    days.length,
    ALL_DAY_LANES,
  );
  const bars = placed.map((p) => {
    const item = byId.get(p.id)!;
    return {
      ...item,
      ...p,
      continuesBefore: item.from < days[0],
      continuesAfter: item.to > days[days.length - 1],
    };
  });
  const shown = new Set(placed.map((p) => p.id));
  const hiddenNames = days.map((day) =>
    items
      .filter((item) => !shown.has(item.id) && item.from <= day && day <= item.to)
      .map((item) => item.label)
      .join(", "),
  );
  return { bars, lanes: placed.reduce((n, p) => Math.max(n, p.lane + 1), 0), hidden, hiddenNames };
}


/**
 * A meal on the week view: a butter-yellow block at its eating time, like an
 * event (Connor, 2026-11-10). Tapping it opens Cooking Mode.
 */
export type WeekMeal = { id: string; name: string; icon: string; startMin: number; endMin: number; href: string; cooked: boolean };

export function WeekView({
  household,
  days,
  today,
  events,
  memberById,
  href,
  adding,
  meals,
  breaks,
  specials,
  tasks = [],
}: ViewProps & {
  /** Each day's planned meals, placed at their eating times. */
  meals: Map<LocalDate, WeekMeal[]>;
  /** List tasks with a day and a time this week, shown as points. */
  tasks?: TaskPointItem[];
}) {
  const { timeZone } = household.settings;
  const range = timelineRange(events, days, timeZone);
  // Stretch the timeline to take in an early or late task.
  // Stretch it for a meal too.
  const allMeals = [...meals.values()].flat();
  const first = Math.min(range.first, ...tasks.map((t) => Math.floor(taskMinute(t) / 60)), ...allMeals.map((m) => Math.floor(m.startMin / 60)));
  const last = Math.max(range.last, ...tasks.map((t) => Math.ceil((taskMinute(t) + 1) / 60)), ...allMeals.map((m) => Math.min(24, Math.ceil(m.endMin / 60))));
  const now = new Date();
  const editLink = (e: CalendarItem) => href({ edit: e.series_id, occ: e.occurrence_date, add: null, panel: null });
  // The row under the dates (all-day things) only shows when it has something.
  const allDayRow = allDayBars({ days, events, breaks, household, memberById, editLink });

  return (
    // On a phone the week is wider than the screen, so it scrolls sideways.
    <div className="flex min-h-[40rem] flex-col max-lg:overflow-x-auto lg:min-h-0 lg:flex-1">
      <div className="flex flex-1 flex-col max-lg:min-w-[56rem] lg:min-h-0">
        {/* Day headings */}
        <div className="grid shrink-0 grid-cols-7 pl-16.5">
          {days.map((day, i) => {
            return (
              <div key={day} className="flex min-w-0 px-1">
                <Link
                  href={adding ? adding.addHref(day, { allday: "1" }) : href({ add: day, allday: "1", edit: null, panel: null })}
                  scroll={false}
                  className="flex h-12.5 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl pl-2.5 text-2xl font-bold whitespace-nowrap text-ink hover:bg-rail lg:text-3xl"
                >
                  {weekdayLabel(day, household)}
                  <span
                    className={`flex h-11.5 min-w-11.5 items-center justify-center rounded-full px-2 ${day === today ? "bg-now text-white" : ""}`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {allDayRow.hidden[i] > 0 ? (
                    <span className="shrink-0 rounded-lg bg-rail px-1.5 text-sm font-bold text-ink-muted" title={allDayRow.hiddenNames[i]}>
                      +{allDayRow.hidden[i]}
                    </span>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Holidays and birthdays: a ribbon across the top of the day */}
        {days.some((day) => specials?.get(day)?.length) ? (
          <div className="mt-2 grid shrink-0 grid-cols-7 pl-16.5">
            {days.map((day) => {
              const here = specials?.get(day) ?? [];
              const first = here[0];
              return (
                <div key={day} className="flex min-w-0 px-1">
                  {first ? <Ribbon special={first} more={here.length - 1} /> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* All-day things, and things over several days, as bars across their days */}
        {allDayRow.lanes > 0 ? (
          <div
            className="mt-2 grid shrink-0 grid-cols-7 gap-y-1 pl-16.5"
            style={{ gridTemplateRows: `repeat(${allDayRow.lanes}, 2.5rem)` }}
          >
            {allDayRow.bars.map((bar) => {
              const look = `flex h-10 min-w-0 flex-1 items-center gap-2 px-2.5 text-sm font-bold text-ink ${bar.dashed ? "border-2 border-dashed" : ""} ${
                bar.continuesBefore ? "rounded-l-sm" : "rounded-l-xl"
              } ${bar.continuesAfter ? "rounded-r-sm" : "rounded-r-xl"}`;
              const look2 = { background: soft(bar.colour), borderColor: bar.dashed ? strong(bar.colour) : undefined };
              const content = (
                <>
                  <Emoji emoji={bar.emoji} className="size-7" />
                  <span className="truncate">{bar.label}</span>
                  {bar.time ? <span className="ml-auto shrink-0 font-semibold text-ink-soft">{bar.time}</span> : null}
                </>
              );
              // Events that start and end this week can be stretched over more (or fewer) days.
              return bar.stretch && !bar.continuesBefore && !bar.continuesAfter ? (
                <StretchBar
                  key={bar.id}
                  href={bar.href}
                  eventId={bar.stretch.eventId}
                  occurrenceDate={bar.stretch.occurrenceDate}
                  week={days}
                  first={bar.first}
                  last={bar.last}
                  lane={bar.lane}
                  title={bar.title}
                  className={look}
                  style={look2}
                >
                  {content}
                </StretchBar>
              ) : (
                <div key={bar.id} className="flex min-w-0 px-1" style={{ gridColumn: `${bar.first + 1} / ${bar.last + 2}`, gridRow: bar.lane + 1 }}>
                  <Link href={bar.href} scroll={false} title={bar.title} className={look} style={look2}>
                    {content}
                  </Link>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* The timeline */}
        <div className="relative mt-5 mb-1 flex min-h-0 flex-1 pl-16.5">
          <HourLines first={first} last={last} />
          {days.map((day) => (
            <div
              key={day}
              data-drop-day={day}
              className={`relative min-w-0 flex-1 basis-0 border-l border-panel ${day === today ? "bg-[#FCFCFD]" : ""}`}
            >
              {/* Meals sit under the events: they move out of the way of family plans, so they rarely overlap. */}
              {(meals.get(day) ?? []).map((m) => (
                <WeekMealBlock key={m.id} meal={m} first={first} last={last} household={household} day={day} />
              ))}
              <DayBlocks
                events={events}
                day={day}
                first={first}
                last={last}
                household={household}
                memberById={memberById}
                linkFor={editLink}
                draggable={{ week: days }}
              />
              {tasks
                .filter((t) => t.due_date === day)
                .map((t) => (
                  <TodoPoint
                    key={t.id}
                    todo={t}
                    top={((taskMinute(t) - first * 60) / ((last - first) * 60)) * 100}
                    box={{ left: "4px", width: "calc(100% - 8px)" }}
                    colour={(t.assignee_id ? memberById.get(t.assignee_id)?.colour : undefined) ?? EVERYONE_COLOUR}
                    big={false}
                  />
                ))}
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

/** A meal on the week's timeline: picture, name and eating time. Tap to start cooking. */
function WeekMealBlock({ meal, first, last, household, day }: { meal: WeekMeal; first: number; last: number; household: Household; day: LocalDate }) {
  const span = (last - first) * 60;
  const top = ((meal.startMin - first * 60) / span) * 100;
  const height = (Math.max(20, meal.endMin - meal.startMin) / span) * 100;
  const hh = String(Math.floor(meal.startMin / 60) % 24).padStart(2, "0");
  const mm = String(meal.startMin % 60).padStart(2, "0");
  const time = shortTime(zonedToUtc(day, `${hh}:${mm}`, household.settings.timeZone), household);
  const look = `absolute flex min-h-0 items-center gap-1.5 overflow-hidden rounded-xl bg-meal px-2 text-meal-ink ${meal.cooked ? "opacity-60" : ""}`;
  const body = (
    <>
      <Emoji emoji={meal.icon} className="size-6.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-hand text-lg leading-none">{meal.name}</span>
    </>
  );
  if (meal.cooked) {
    return (
      <Link href={meal.href} title={`${meal.name}, ${time} (cooked)`} className={look} style={{ top: `${top}%`, height: `${height}%`, left: "4px", width: "calc(100% - 8px)" }}>
        {body}
      </Link>
    );
  }
  // Dragging moves just this day's meal: to another time, or another day.
  return (
    <DraggableMeal
      mealId={meal.id}
      href={meal.href}
      day={day}
      start={meal.startMin}
      minutes={Math.max(20, meal.endMin - meal.startMin)}
      first={first}
      last={last}
      className={look}
      style={{ left: "4px", width: "calc(100% - 8px)" }}
    >
      {body}
    </DraggableMeal>
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
  anchor,
  adding,
  mode,
  breaks,
  specials,
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
    const weekHref = href({ view: "week", date: day, edit: null, add: null, panel: null });
    // In the rolling view, the 1st of a month (and the first square) says which month.
    const label = mode === "weeks" && (day.endsWith("-01") || day === cells[0]) ? `${shortMonth(day)} ${Number(day.slice(8))}` : String(Number(day.slice(8)));
    // A holiday's picture fills an empty square. On a busy day it shrinks to a
    // sticker beside the date, so it never sits on top of the events (2026-11-10).
    const holiday = specials?.get(day)?.find((x) => x.kind === "holiday");
    const birthdays = specials?.get(day)?.filter((x) => x.kind === "birthday") ?? [];
    const busy = dayEvents.length > 0 || breaksOn(breaks, day).length > 0;
    return (
      <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden ${past ? "opacity-45" : ""}`}>
        {holiday && !busy ? (
          <Link
            href={HOLIDAYS_HREF}
            title={specialLabel(holiday)}
            aria-label={`${specialLabel(holiday)}, a holiday`}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            <Emoji emoji={holiday.icon} className="aspect-square max-h-full min-h-0 flex-1 pt-9 pb-1" />
            {half ? null : (
              <span className="max-w-full shrink-0 truncate px-1 text-sm font-extrabold" style={{ color: strong(HOLIDAY_COLOUR) }}>
                {holiday.name}
              </span>
            )}
          </Link>
        ) : null}
        <div className="relative flex shrink-0 items-center gap-1">
          <Link
            href={weekHref}
            className={`flex h-9 min-w-9 items-center justify-center rounded-full px-1.5 text-xl font-bold whitespace-nowrap ${
              day === today ? "bg-now text-white" : inMonth ? "text-ink" : "text-ink-muted"
            }`}
          >
            {label}
          </Link>
          {holiday && busy ? (
            <Link
              href={HOLIDAYS_HREF}
              title={specialLabel(holiday)}
              aria-label={`${specialLabel(holiday)}, a holiday`}
              className="shrink-0 rounded-lg p-px"
              style={{ background: soft(HOLIDAY_COLOUR), boxShadow: `inset 0 0 0 2px ${strong(HOLIDAY_COLOUR)}` }}
            >
              <Emoji emoji={holiday.icon} className="size-7" />
            </Link>
          ) : null}
          {breaksOn(breaks, day)
            .slice(0, 1)
            .map((b) => (
              <Link
                key={b.id}
                href={BREAKS_HREF}
                title={`${b.name}: ${breakWho(b, memberById)}`}
                aria-label={`${b.name}, days off for ${breakWho(b, memberById)}`}
                className="shrink-0 rounded-lg border-2 border-dashed p-px"
                style={{ background: soft(breakColour(b, memberById)), borderColor: strong(breakColour(b, memberById)) }}
              >
                <Emoji emoji={eventEmoji(b.icon, b.name)} className="size-7" />
              </Link>
            ))}
          {birthdays.slice(0, 1).map((b) => (
            <Link
              key={b.key}
              href={HOLIDAYS_HREF}
              title={specialLabel(b)}
              aria-label={specialLabel(b)}
              className="shrink-0 rounded-lg p-px"
              style={{ background: soft(BIRTHDAY_COLOUR), boxShadow: `inset 0 0 0 2px ${strong(BIRTHDAY_COLOUR)}` }}
            >
              <Emoji emoji={b.icon} className="size-7" />
            </Link>
          ))}
          {shownStickers.map((e) => (
            <Link key={e.id} href={editHref(e)} scroll={false} title={e.title} aria-label={`${e.title}, all day`} className="shrink-0">
              <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-8" />
            </Link>
          ))}
        </div>
        {shown.map((e) => (
          <Link
            key={e.id}
            href={editHref(e)}
            scroll={false}
            title={`${e.title}, ${timeRange(e, household)}`}
            className="relative flex min-h-0 shrink items-center gap-1 overflow-hidden px-0.5 text-base font-bold"
          >
            <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-5.5" />
            <span className="min-w-0 truncate" style={{ color: strong(eventColour(e, memberById)) }}>
              {e.title}
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink-soft">{shortTime(new Date(e.starts_at), household)}</span>
          </Link>
        ))}
        {more > 0 ? (
          <Link href={weekHref} className="relative shrink-0 px-1.5 text-sm font-bold text-ink-muted">
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
