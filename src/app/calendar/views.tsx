import Link from "next/link";
import { Emoji, HandText } from "@/components/ui";
import { EVERYONE_COLOUR } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import type { Household } from "@/lib/household";
import { monthOf } from "@/lib/calendar-layout";
import { addDays, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import type { Break } from "@/lib/day-types";
import { specialLabel, type SpecialDay } from "@/lib/holidays";
import type { CalendarItem, Member } from "./types";
import type { QuickDefaults } from "./forms";
import { MonthFit } from "./month-fit";

export type ViewProps = {
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

/** The breaks on a day. */
function breaksOn(breaks: Break[] | undefined, day: LocalDate): Break[] {
  return (breaks ?? []).filter((b) => b.start_date <= day && day <= b.end_date);
}

/** Who a break is for, e.g. "Ava and Dad". */
function breakWho(b: Break, memberById: Map<string, Member>): string {
  const names = b.people.flatMap((p) => memberById.get(p.member_id)?.name ?? []);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
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

// ---------------------------------------------------------------------------
// Month view (Glance, SPEC "Month view variant 5" 5a, "Month view tap rule")
// ---------------------------------------------------------------------------

/** How many events a month cell lists before "+ N more" (fewer if they don't fit). */
export const MONTH_CELL_LIMIT = 4;
/** All-day things show as up to three stickers beside the date; any more are hidden (no "+N"). */
export const MONTH_STICKER_LIMIT = 3;

/** One sticker beside the date: an all-day thing, a birthday or days off. */
export type DaySticker = { key: string; emoji: string; title: string };

/**
 * A day's stickers (Month and Week), most official first: an event that
 * makes it a kind of day (PA day), days off, birthdays, then the family's
 * other all-day things. Callers show the first three; the rest are hidden.
 */
export function dayStickers(
  day: LocalDate,
  allDay: CalendarItem[],
  breaks: Break[] | undefined,
  special: SpecialDay[],
  memberById: Map<string, Member>,
): DaySticker[] {
  return [
    ...allDay.filter((e) => e.day_kind).map((e) => ({ key: e.id, emoji: eventEmoji(e.icon, e.title), title: e.title })),
    ...breaksOn(breaks, day).map((b) => ({ key: `break-${b.id}`, emoji: eventEmoji(b.icon, b.name), title: `${b.name}: ${breakWho(b, memberById)}` })),
    ...special.filter((x) => x.kind === "birthday").map((x) => ({ key: x.key, emoji: x.icon ?? "🎂", title: specialLabel(x) })),
    ...allDay.filter((e) => !e.day_kind).map((e) => ({ key: e.id, emoji: eventEmoji(e.icon, e.title), title: e.title })),
  ];
}

/**
 * Whose ink an event's title is written in: the person's (the first one's
 * when it's for two), everyone's orange for three or more, and plain dark
 * ink when it isn't anyone's.
 */
export function monthInk(event: CalendarItem, memberById: Map<string, Member>): string | null {
  const colours = event.member_ids.flatMap((id) => memberById.get(id)?.colour ?? []);
  if (colours.length === 0) return null;
  return colours.length > 2 ? EVERYONE_COLOUR : colours[0];
}

/**
 * The month grid, edge to edge (Connor's sketched cell, SPEC "variant 5a"):
 *
 *   - each day's top row is the printed date ("Nov 1" on the 1st of a
 *     month), then up to three emoji stickers for its all-day things;
 *   - then its timed events as rows: picture, and the title handwritten in
 *     the person's ink, no times, four at most then "+ N more" (fewer when
 *     the square is short; MonthFit works that out);
 *   - a holiday is a big picture filling the square, faded to 18% behind
 *     any events.
 *
 * Tapping anywhere in a day opens that day's agenda (or, while adding,
 * places the new event on it). Events are edited from the agenda.
 *
 * `mode` is the "Month shows" setting: the calendar month (5 or 6 rows) or
 * a rolling 5 weeks starting with this week.
 */
export function MonthView({
  household,
  days,
  today,
  events,
  memberById,
  anchor,
  adding,
  mode,
  breaks,
  specials,
  dayHref,
}: Omit<ViewProps, "href"> & { anchor: LocalDate; mode: "month" | "weeks"; dayHref: (day: LocalDate) => string }) {
  const { locale, timeZone } = household.settings;
  const month = monthOf(anchor);
  const rows = Math.ceil(days.length / 7);
  const noon = (day: LocalDate) => zonedToUtc(day, "12:00", timeZone);
  const shortMonth = (day: LocalDate) => new Intl.DateTimeFormat(locale, { timeZone, month: "short" }).format(noon(day));
  const longDay = (day: LocalDate) => new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(noon(day));

  return (
    <div className="flex min-h-[40rem] flex-col bg-board lg:min-h-0 lg:flex-1">
      <div className="grid shrink-0 grid-cols-7 border-b border-frame">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="truncate px-[0.55rem] pt-[0.35rem] pb-[0.3rem] text-[1.15rem] leading-[1.25] font-bold tracking-[0.08em] text-ink-muted uppercase">
            {weekdayLabel(day, household)}
          </div>
        ))}
      </div>
      <MonthFit className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(events, day, timeZone);
          const allDay = dayEvents.filter((e) => isAllDayStyle(e, timeZone));
          const timed = dayEvents
            .filter((e) => !isAllDayStyle(e, timeZone))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const special = specials?.get(day) ?? [];
          const holiday = special.find((x) => x.kind === "holiday");
          const stickers = dayStickers(day, allDay, breaks, special, memberById);
          const other = mode === "month" && monthOf(day) !== month;
          const isToday = day === today;
          // Days already gone are greyed out (Connor, 2026-11-16), like Week's past days.
          const past = day < today;
          // The 1st of a month (and, rolling, the first square) says which month.
          const label = day.endsWith("-01") || (mode === "weeks" && i === 0) ? `${shortMonth(day)} ${Number(day.slice(8))}` : String(Number(day.slice(8)));
          const wide = label.length > 2;
          const placing = Boolean(adding?.placing);
          const pendingHere = adding?.pending?.date === day;
          const lastRow = i >= days.length - 7;
          return (
            <Link
              key={day}
              href={placing && adding ? adding.addHref(day, { allday: "1" }) : dayHref(day)}
              scroll={false}
              data-month-cell
              aria-label={
                placing
                  ? `Add an event on ${longDay(day)}`
                  : `Open the agenda for ${longDay(day)}${holiday ? `, ${specialLabel(holiday)}` : ""}`
              }
              className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden border-frame px-[0.32rem] pt-[0.16rem] pb-[0.1rem] ${(i + 1) % 7 === 0 ? "" : "border-r"} ${
                lastRow ? "" : "border-b"
              } ${pendingHere ? "outline-3 -outline-offset-3 outline-accent" : ""} ${placing ? "hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-board))]" : ""}`}
              style={{
                background: isToday
                  ? "color-mix(in srgb, var(--color-now) 1.5%, var(--color-board))"
                  : past || other
                    ? "color-mix(in srgb, var(--color-rail) 60%, var(--color-board))"
                    : "var(--color-board)",
              }}
            >
              {holiday ? (
                // The picture fills 88% of the square below the date row (cqmin: the smaller of its width and height).
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[1.85rem] bottom-0 grid place-items-center overflow-hidden" style={{ containerType: "size" }}>
                  <Emoji emoji={holiday.icon} className={`size-[88cqmin] ${timed.length > 0 ? "opacity-[0.18]" : ""}`} />
                </span>
              ) : null}
              <span className="relative z-[1] flex min-h-[1.85rem] shrink-0 items-center gap-[0.15rem]">
                <span
                  className={`tabular flex h-[1.75rem] shrink-0 items-center justify-center text-[1.5rem] leading-none font-bold tracking-[-0.02em] ${
                    wide ? "px-[0.3rem]" : "min-w-[1.75rem] px-[0.15rem]"
                  } ${isToday ? `border-2 border-now-on-tint text-now-on-tint ${wide ? "rounded-[1rem]" : "rounded-full"}` : other || past ? "text-ink-muted" : "text-ink"}`}
                >
                  {label}
                </span>
                {stickers.length > 0 ? (
                  <span className="grid min-w-0 flex-1 grid-cols-3 items-center justify-items-center">
                    {stickers.slice(0, MONTH_STICKER_LIMIT).map((s) => (
                      <span key={s.key} title={s.title} className="pointer-events-none flex h-[1.9rem] min-w-0 items-center justify-center">
                        <Emoji emoji={s.emoji} className="size-[1.65rem]" />
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              <span className={`relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col gap-[0.08rem] pt-[0.06rem] ${past ? "opacity-55" : ""}`}>
                {timed.map((e, n) => (
                  <span key={e.id} data-month-ev hidden={n >= MONTH_CELL_LIMIT} className="flex min-w-0 shrink-0 items-center gap-[0.45rem] pr-[0.15rem]">
                    <span className="grid size-[1.6rem] shrink-0 place-items-center">
                      <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-[1.45rem]" />
                    </span>
                    <HandText colour={monthInk(e, memberById)} className="min-w-0 truncate text-[1.15rem] leading-[1.15] font-bold">
                      {e.title}
                    </HandText>
                  </span>
                ))}
                <span
                  data-month-more
                  hidden={timed.length <= MONTH_CELL_LIMIT}
                  className="tabular shrink-0 px-[0.15rem] pt-[0.02rem] text-[1.15rem] leading-[1.15] font-bold text-ink-soft"
                >
                  + {Math.max(0, timed.length - MONTH_CELL_LIMIT)} more
                </span>
              </span>
            </Link>
          );
        })}
      </MonthFit>
    </div>
  );
}

export { weekdayLabel };
