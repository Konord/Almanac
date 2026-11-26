import Link from "next/link";
import { Emoji, HandText } from "@/components/ui";
import { hand, strong } from "@/lib/colours";
import { eventEmoji, holidayWash } from "@/lib/emoji";
import { layoutDay } from "@/lib/calendar-layout";
import { minutesText } from "@/lib/time-text";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import type { CalendarItem } from "./types";
import { cardColours } from "../agenda/parts";
import {
  MONTH_STICKER_LIMIT,
  dayStickers,
  eventsOnDay,
  isAllDayStyle,
  isPointEvent,
  minutesIntoDay,
  monthInk,
  type ViewProps,
} from "./views";
import { DraggableEvent } from "@/components/draggable-event";
import { DrawLayer, PendingOutline, WeekScroller } from "./week-scroll";

/*
 * Week (docs/glance/SPEC.md "LOCKED style: week view", "Week view: LOCKED"
 * and, overriding both, "Connor's decisions — Nov 15 2026"):
 *
 *   - seven edge-to-edge day columns (five with the Daily List open);
 *   - each column's top is the printed weekday and date (today ringed in
 *     red) and a reserved row of up to three emoji stickers, so the hours
 *     line up across the week;
 *   - below, an hour grid that scrolls up and down (drag or swipe the
 *     empty grid). Hour labels sit on the lines inside the columns.
 *     Events are compact agenda cards placed by start time, as tall as they
 *     last (at least one card), side by side where they overlap. Tap one
 *     to change it; drag it to move it (another time or day), drag its
 *     bottom edge to change its length, or pull a side over more days
 *     (SPEC "Week event dragging restored — Connor, Nov 16 2026");
 *   - meals and list tasks with a time are cards on the grid too;
 *   - past days (and today's finished things) fade to 55%, keeping colours;
 *   - a holiday's big picture fills the column behind the hours;
 *   - no Now line (Connor, 2026-11-16): instead the hours move on by
 *     themselves through the day, so finished things slide off the top,
 *     until midnight reaches the bottom; the hour times show in the
 *     leftmost day only.
 */

/** One hour of the grid, in rem. */
export const HOUR_REM = 5.5;
/** The shortest a card is drawn (one compact card). */
const MIN_MINUTES = 60;
/** The space between neighbouring cards, in rem. */
const GAP_REM = 0.18;

/** A planned meal at its eating time. Tapping it opens Cooking Mode. */
export type WeekMeal = { id: string; name: string; icon: string; startMin: number; endMin: number; href: string; cooked: boolean };

/** A list task with a day and a time. */
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

function taskMinute(task: Pick<TaskPointItem, "at_time">): number {
  return Number(task.at_time!.slice(0, 2)) * 60 + Number(task.at_time!.slice(3, 5));
}

/** One thing on the hour grid. */
type GridItem = {
  id: string;
  startMin: number;
  /** Where its card ends (at least one card tall). */
  endMin: number;
  past: boolean;
  /** Timed events (not point events) can be dragged: where they really are. */
  drag?: { eventId: string; occurrenceDate: string | null; start: number; minutes: number; href: string; title: string; background: string };
  draw: (box: { short: boolean; tall: boolean }) => React.ReactNode;
};

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
  dropWhenOpen = [],
}: ViewProps & {
  meals: Map<LocalDate, WeekMeal[]>;
  tasks?: TaskPointItem[];
  /** The days that fold away while the Daily List is out (so the others keep their width). */
  dropWhenOpen?: LocalDate[];
}) {
  const { timeZone, locale } = household.settings;
  const now = new Date();
  const nowMin = minutesIntoDay(now, timeZone);
  const editLink = (e: CalendarItem) => href({ edit: e.series_id, occ: e.occurrence_date, add: null, panel: null });
  const noon = (day: LocalDate) => zonedToUtc(day, "12:00", timeZone);
  const fmt = (day: LocalDate, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...o }).format(noon(day));
  const timeText = (minutes: number, short: boolean) => {
    const text = minutesText(minutes, locale);
    // The short form (9a, 12:30p) for cards squeezed in beside others.
    return short ? text.replace(/\s*([ap])\.?m\.?$/i, "$1") : text;
  };
  const placing = Boolean(adding?.placing || adding?.pending);

  const columns = days.map((day) => {
    const dayEvents = eventsOnDay(events, day, timeZone);
    const allDay = dayEvents.filter((e) => isAllDayStyle(e, timeZone));
    const special = specials?.get(day) ?? [];
    const pastDay = day < today;
    const isToday = day === today;
    const finished = (endMin: number) => pastDay || (isToday && endMin <= nowMin);
    const items: GridItem[] = [];

    for (const e of dayEvents.filter((x) => !isAllDayStyle(x, timeZone))) {
      const startMin = minutesIntoDay(new Date(e.starts_at), timeZone);
      const realEnd = isPointEvent(e) ? startMin : minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60;
      const colours = e.member_ids.flatMap((id) => memberById.get(id)?.colour ?? []);
      const { tint, bar } = colours.length > 0 ? cardColours(colours) : { tint: "var(--color-panel)", bar: "var(--color-check-border)" };
      const point = isPointEvent(e);
      const body = (box: { short: boolean; tall: boolean }) => (
        <>
          <span aria-hidden className="absolute inset-y-0 left-0 w-[0.35rem]" style={{ background: bar }} />
          <CardBody box={box} time={timeText(startMin, box.short)} emoji={<Emoji emoji={eventEmoji(e.icon, e.title)} className={emojiClass(box)} />}>
            <HandText colour={monthInk(e, memberById)} className={titleClass(box)}>
              {e.recurrence_rule ? <span className="sr-only">Repeats: </span> : null}
              {e.title}
            </HandText>
          </CardBody>
        </>
      );
      items.push({
        id: e.id,
        startMin,
        endMin: Math.max(realEnd, startMin + MIN_MINUTES),
        past: finished(point ? startMin + 1 : realEnd),
        // Like main, a point event (a time with no length) isn't dragged; tap it to change it.
        drag: point
          ? undefined
          : { eventId: e.series_id, occurrenceDate: e.occurrence_date, start: startMin, minutes: realEnd - startMin, href: editLink(e), title: `Edit event: ${e.title}`, background: tint },
        draw: (box) =>
          point ? (
            <Link href={editLink(e)} scroll={false} aria-label={`Edit event: ${e.title}`} className={cardClass(box)} style={{ background: tint }}>
              {body(box)}
            </Link>
          ) : (
            // Inside a DraggableEvent, which carries the tint, the tap and the drag.
            <span className={cardClass(box)}>{body(box)}</span>
          ),
      });
    }

    for (const m of meals.get(day) ?? []) {
      items.push({
        id: `meal-${m.id}`,
        startMin: m.startMin,
        endMin: Math.max(m.endMin, m.startMin + MIN_MINUTES),
        past: m.cooked || finished(m.endMin),
        draw: (box) => (
          <Link href={m.href} aria-label={`${m.name}: start cooking`} className={`${cardClass(box)} bg-meal`}>
            <CardBody box={box} time={timeText(m.startMin, box.short)} emoji={<Emoji emoji={m.icon} className={emojiClass(box)} />} meal>
              <span className={`font-hand text-meal-ink ${titleClass(box)}`}>{m.name}</span>
            </CardBody>
          </Link>
        ),
      });
    }

    for (const t of tasks.filter((x) => x.due_date === day)) {
      const startMin = taskMinute(t);
      const colour = t.assignee_id ? memberById.get(t.assignee_id)?.colour : undefined;
      const { tint, bar } = colour ? cardColours([colour]) : { tint: "var(--color-panel)", bar: "var(--color-check-border)" };
      // A list task opens its edit card on the Lists screen; a chore its link or its list.
      const taskHref = t.template_id ? (t.link ?? `/lists?list=${t.list_id}`) : `/lists?list=${t.list_id}&edit=${t.id}`;
      items.push({
        id: `task-${t.id}`,
        startMin,
        endMin: startMin + MIN_MINUTES,
        past: finished(startMin + 1),
        draw: (box) => (
          <Link href={taskHref} aria-label={`${t.title}${t.date_kind === "due" ? " (by then)" : ""}: open the list`} className={cardClass(box)} style={{ background: tint }}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-[0.35rem]" style={{ background: bar }} />
            <CardBody
              box={box}
              time={`${t.date_kind === "due" ? "by " : ""}${timeText(startMin, box.short || t.date_kind === "due")}`}
              emoji={<span aria-hidden className={`${box.short ? "size-[1.35rem]" : "size-[1.75rem] justify-self-center"} shrink-0 rounded-full border-[0.2rem] bg-board`} style={{ borderColor: colour ? strong(colour) : "var(--color-check-border)" }} />}
            >
              <span className={`font-hand ${titleClass(box)}`} style={{ color: hand(colour) }}>
                {t.title}
              </span>
            </CardBody>
          </Link>
        ),
      });
    }

    const holiday = special.find((x) => x.kind === "holiday");
    // Like Month: the holiday picture (flat, on its colour) fades to 38% when the day has events (meals and tasks don't count).
    const hasEvents = dayEvents.some((x) => !isAllDayStyle(x, timeZone));
    return {
      hasEvents,
      day,
      isToday,
      pastDay,
      items,
      holiday,
      stickers: dayStickers(day, allDay, breaks, special, memberById).slice(0, MONTH_STICKER_LIMIT),
    };
  });

  // Start near now when the week has today; otherwise near the week's first thing.
  const firstThing = Math.min(...columns.flatMap((c) => c.items.map((i) => i.startMin)), 8 * 60);
  const following = days.includes(today);
  const startMinute = following ? nowMin : firstThing;
  // Two sets of columns: all the days, and with the Daily List out (two days fold to nothing).
  // The grids pick one by the drawer's data-daily-open (.week-cols in globals.css), so it slides.
  const colVars = {
    "--cols-closed": days.map(() => "minmax(0, 1fr)").join(" "),
    "--cols-open": days.map((d) => (dropWhenOpen.includes(d) ? "minmax(0, 0fr)" : "minmax(0, 1fr)")).join(" "),
  } as React.CSSProperties;
  const drops = (day: LocalDate) => (dropWhenOpen.includes(day) ? "week-drop" : "");
  const wash = (c: { isToday: boolean; pastDay: boolean; holiday?: { icon: string } }) =>
    c.holiday && !c.pastDay
      ? holidayWash(c.holiday.icon)
      : c.isToday
      ? "color-mix(in srgb, var(--color-now) 1.5%, var(--color-board))"
      : c.pastDay
        ? "color-mix(in srgb, var(--color-rail) 60%, var(--color-board))"
        : "var(--color-board)";
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex min-h-[40rem] flex-col max-lg:overflow-x-auto lg:min-h-0 lg:flex-1" style={colVars}>
      <div className="flex min-h-0 flex-1 flex-col max-lg:min-w-[56rem]">
        {/*
          Day tops, one slim row: weekday and date, then the stickers (Connor,
          2026-11-26: the dates took a lot of room). A solid line under them
          stays put while the hours scroll.
        */}
        <div className="week-cols grid shrink-0 border-b-2 border-frame">
          {columns.map((c, i) => (
            <Link
              key={c.day}
              href={adding?.placing ? adding.addHref(c.day, { allday: "1" }) : c.isToday ? "/" : `/?date=${c.day}`}
              scroll={false}
              aria-label={
                adding?.placing
                  ? `Add an all-day event on ${fmt(c.day, { weekday: "long", month: "long", day: "numeric" })}`
                  : `Open ${fmt(c.day, { weekday: "long" })}'s agenda, ${fmt(c.day, { month: "long", day: "numeric" })}`
              }
              className={`flex h-[3.6rem] min-w-0 items-center gap-[0.55rem] px-[0.7rem] ${i < columns.length - 1 ? "border-r border-frame" : ""} ${drops(c.day)}`}
              style={{ background: wash(c) }}
            >
              <span className="text-[1.15rem] leading-none font-bold tracking-[0.08em] text-ink-muted uppercase">
                {fmt(c.day, { weekday: "short" })}
              </span>
              <span
                className={`tabular inline-flex shrink-0 items-center justify-center text-[1.9rem] leading-none font-extrabold tracking-[-0.03em] ${
                  c.isToday ? "size-[2.6rem] rounded-full bg-now-on-tint text-board" : c.pastDay ? "text-ink-muted" : "text-ink"
                }`}
              >
                {Number(c.day.slice(8))}
              </span>
              <span className="ml-auto flex min-w-0 items-center gap-[0.35rem] overflow-hidden">
                {c.stickers.map((s) => (
                  <span key={s.key} title={s.title} className="pointer-events-none flex">
                    <Emoji emoji={s.emoji} className="size-[1.75rem]" />
                  </span>
                ))}
              </span>
            </Link>
          ))}
        </div>

        <div className="relative min-h-0 flex-1">
          {/* Behind the hours: each day's wash and its holiday picture (they stay put while the hours scroll). */}
          <div aria-hidden className="week-cols pointer-events-none absolute inset-0 grid">
            {columns.map((c, i) => (
              <div key={c.day} className={`relative min-w-0 ${i < columns.length - 1 ? "border-r border-frame" : ""} ${drops(c.day)}`} style={{ background: wash(c) }}>
                {c.holiday ? (
                  <span className="absolute inset-0 grid place-items-center overflow-hidden" style={{ containerType: "size" }}>
                    <Emoji emoji={c.holiday.icon} flat className={`size-[94cqmin] ${c.hasEvents ? "opacity-[0.38]" : ""}`} />
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <WeekScroller key={days[0]} startMinute={startMinute} follow={following ? timeZone : null} label="Hours of the week. Drag or swipe to scroll.">
            <div className="week-cols relative grid" style={{ height: `${24 * HOUR_REM}rem` }}>
              {/*
                The hour lines and times, under the cards. The times sit at
                the left only, in the first day showing (Connor, 2026-11-16);
                a card there covers its own hours.
              */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-grid" style={{ top: `${h * HOUR_REM}rem` }}>
                    {h > 0 ? (
                      <span className="tabular absolute top-[0.15rem] left-[0.55rem] text-[1.125rem] leading-none font-semibold text-ink-muted">{timeText(h * 60, false)}</span>
                    ) : null}
                  </div>
                ))}
              </div>
              {columns.map((c) => {
                const placed = layoutDay(c.items.map((x) => ({ id: x.id, startMin: x.startMin, endMin: x.endMin })));
                const byId = new Map(c.items.map((x) => [x.id, x]));
                return (
                  // data-drop-day: the column a dragged card lands in (the whole day tall, so drags map onto the hours).
                  <div key={c.day} data-drop-day={c.day} className={`relative min-w-0 ${drops(c.day)}`}>
                    {placed.map((p) => {
                      const item = byId.get(p.id)!;
                      const short = p.lanes >= 2;
                      const tall = p.endMin - p.startMin > MIN_MINUTES;
                      const lane = {
                        left: `calc(${(p.lane / p.lanes) * 100}% + 0.4rem)`,
                        width: `calc(${100 / p.lanes}% - ${p.lane === p.lanes - 1 ? 0.8 : 0.5}rem)`,
                      };
                      const card = item.past ? <div className="flex size-full opacity-55">{item.draw({ short, tall })}</div> : item.draw({ short, tall });
                      if (item.drag) {
                        return (
                          <DraggableEvent
                            key={p.id}
                            href={item.drag.href}
                            eventId={item.drag.eventId}
                            occurrenceDate={item.drag.occurrenceDate}
                            day={c.day}
                            week={days}
                            start={item.drag.start}
                            minutes={item.drag.minutes}
                            hourRem={HOUR_REM}
                            minMinutes={MIN_MINUTES}
                            gapRem={GAP_REM}
                            title={item.drag.title}
                            className="absolute z-[1] flex rounded-[var(--radius)] outline-accent focus-visible:outline-2"
                            // A faded card sits on its day's wash (so hour lines don't show through); the tint fades with it.
                            style={{ ...lane, background: item.past ? wash(c) : item.drag.background }}
                          >
                            {item.past ? <div className="flex size-full rounded-[var(--radius)] opacity-55" style={{ background: item.drag.background }}>{item.draw({ short, tall })}</div> : card}
                          </DraggableEvent>
                        );
                      }
                      return (
                        <div
                          key={p.id}
                          // A faded card sits on its day's wash, so hour lines don't show through it.
                          className="absolute z-[1] flex rounded-[var(--radius)]"
                          style={{
                            background: item.past ? wash(c) : undefined,
                            top: `${(p.startMin / 60) * HOUR_REM + GAP_REM}rem`,
                            height: `${((p.endMin - p.startMin) / 60) * HOUR_REM - 2 * GAP_REM}rem`,
                            ...lane,
                          }}
                        >
                          {card}
                        </div>
                      );
                    })}
                    <PendingOutline day={c.day} minRem={(MIN_MINUTES / 60) * HOUR_REM} hourRem={HOUR_REM} />
                    {adding ? (
                      <DrawLayer
                        day={c.day}
                        href={adding.addHref(c.day)}
                        defaultMinutes={household.settings.defaultEventMinutes}
                        placing={placing}
                        label={`Add an event on ${fmt(c.day, { weekday: "long" })}`}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </WeekScroller>
        </div>
      </div>
    </div>
  );
}

/** The card itself fills the box it's placed in. */
function cardClass({ short }: { short: boolean; tall: boolean }): string {
  return `relative flex size-full min-w-0 overflow-clip rounded-[var(--radius)] ${short ? "pl-[0.65rem] pr-[0.35rem] py-[0.35rem]" : "pl-[0.85rem] pr-[0.5rem] py-[0.4rem]"}`;
}

function emojiClass({ short }: { short: boolean; tall: boolean }): string {
  return short ? "size-[1.5rem]" : "size-[2.15rem]";
}

/**
 * As many lines as the card has room for (UI audit H6, 2026-11-21): an
 * hour-long card has room for three under its height, or two when it is
 * squeezed beside another card (its time and picture take a line). A
 * longer card adds one more.
 */
function titleClass(box: { short: boolean; tall: boolean }): string {
  const lines = (box.short ? 2 : 3) + (box.tall ? 1 : 0);
  const clamp = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" }[lines];
  return `${clamp} min-w-0 text-[1.25rem] leading-[1.15] font-bold break-words hyphens-auto`;
}

/**
 * Inside a card: printed start time, picture, handwritten title (as many
 * lines as fit, see titleClass). Full width it's one row like the agenda; squeezed beside
 * others the time and picture go on a line above the title.
 */
function CardBody({
  box,
  time,
  emoji,
  meal = false,
  children,
}: {
  box: { short: boolean; tall: boolean };
  time: string;
  emoji: React.ReactNode;
  meal?: boolean;
  children: React.ReactNode;
}) {
  const timeClass = `tabular shrink-0 text-[1.25rem] leading-[1.05] font-extrabold tracking-[-0.02em] whitespace-nowrap ${meal ? "text-meal-ink" : "text-ink"}`;
  if (box.short) {
    return (
      <span className={`flex min-w-0 flex-1 flex-col gap-[0.15rem] ${box.tall ? "sticky top-[0.4rem] h-fit" : ""}`}>
        <span className="flex min-w-0 items-center gap-[0.3rem]">
          <span className={timeClass}>{time}</span>
          {emoji}
        </span>
        {children}
      </span>
    );
  }
  return (
    // A tall card's words stay in view while its top is scrolled off (overflow-clip on the card lets this stick).
    <span className={`grid min-w-0 flex-1 grid-cols-[auto_2.15rem_minmax(0,1fr)] gap-[0.4rem] ${box.tall ? "sticky top-[0.4rem] h-fit items-start pt-[0.2rem]" : "items-center"}`}>
      <span className={timeClass}>{time}</span>
      {emoji}
      {children}
    </span>
  );
}
