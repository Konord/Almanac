import { Suspense } from "react";
import { firstParam } from "@/components/ui";
import { eventEmoji } from "@/lib/emoji";
import { requireHousehold } from "@/lib/household";
import { specialLabel } from "@/lib/holidays";
import { monthGridDays } from "@/lib/calendar-layout";
import { addDays, isLocalDate, localDateOf } from "@/lib/time";
import { shortClockTime } from "@/lib/time-text";
import { loadCalendar, rangeOf } from "../calendar/data";
import { eventColour, isAllDayStyle, isPointEvent, minutesIntoDay } from "../calendar/views";
import { loadSpecialDays } from "../holidays/data";
import { CalendarView, type PhoneEvent } from "./calendar-view";

/*
 * The phone's calendar, for checking the schedule when making plans: a
 * week strip that opens into the month, over an agenda of every day, or a
 * 3-day hour grid. ?date=2026-12-04 opens on another day.
 */

/** How many days the agenda runs on past the month shown. */
const AHEAD = 56;

export default function PhoneCalendarPage(props: PageProps<"/m">) {
  return (
    <Suspense fallback={<PhoneLoading />}>
      <PhoneCalendar searchParams={props.searchParams} />
    </Suspense>
  );
}

export function PhoneLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-4 p-4" role="status" aria-label="Loading">
      <span className="h-12 w-48 rounded-2xl bg-board/70" />
      <span className="h-24 rounded-[var(--radius-card)] bg-board/70" />
      <span className="h-64 rounded-[var(--radius-card)] bg-board/70" />
    </div>
  );
}

async function PhoneCalendar({ searchParams }: { searchParams: PageProps<"/m">["searchParams"] }) {
  const params = await searchParams;
  const household = await requireHousehold();
  const { timeZone, locale, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const asked = firstParam(params.date);
  const date = asked && isLocalDate(asked) ? asked : today;

  // The month around the date, and eight weeks on from it.
  const grid = monthGridDays(date, weekStartsOn);
  const from = grid[0];
  const to = [grid.at(-1)!, addDays(date, AHEAD)].sort().at(-1)!;
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  const [data, specials] = await Promise.all([loadCalendar(rangeStart, rangeEnd), loadSpecialDays(from, to)]);
  const memberById = new Map(data.members.map((m) => [m.id, m]));

  const events: PhoneEvent[] = data.items.map((e) => {
    const start = new Date(e.starts_at);
    const end = new Date(e.ends_at);
    const allDay = isAllDayStyle(e, timeZone);
    const point = isPointEvent(e);
    const lastDay = localDateOf(new Date(Math.max(start.getTime(), end.getTime() - 1)), timeZone);
    const time = (t: Date) => shortClockTime(t, locale, timeZone);
    return {
      key: `${e.series_id}-${e.occurrence_date ?? e.starts_at}`,
      href: `/m/event/${e.series_id}${e.occurrence_date ? `?occ=${e.occurrence_date}` : ""}`,
      title: e.title,
      emoji: eventEmoji(e.icon, e.title),
      colour: eventColour(e, memberById),
      colours: e.member_ids.flatMap((id) => memberById.get(id)?.colour ?? []),
      firstDay: localDateOf(start, timeZone),
      lastDay,
      allDay,
      timedAllDay: allDay && !e.all_day,
      startText: time(start),
      endText: point ? null : time(end),
      startMin: allDay ? 0 : minutesIntoDay(start, timeZone),
      endMin: allDay ? 24 * 60 : point ? minutesIntoDay(start, timeZone) : minutesIntoDay(end, timeZone) || 24 * 60,
      location: e.location,
      who: e.member_ids.flatMap((id) => memberById.get(id)?.name ?? []).join(", "),
      repeats: Boolean(e.recurrence_rule),
    };
  });
  for (const [day, list] of specials) {
    for (const s of list) {
      events.push({
        key: `special-${s.key}`,
        href: null,
        title: specialLabel(s),
        emoji: s.icon,
        colour: null,
        colours: [],
        firstDay: day,
        lastDay: day,
        allDay: true,
        timedAllDay: false,
        startText: "",
        endText: null,
        startMin: 0,
        endMin: 24 * 60,
        location: null,
        who: "",
        repeats: false,
      });
    }
  }
  events.sort((a, b) => a.firstDay.localeCompare(b.firstDay) || Number(b.allDay) - Number(a.allDay) || a.startMin - b.startMin);

  return (
    <CalendarView
      key={date}
      date={date}
      today={today}
      from={from}
      to={to}
      locale={locale}
      weekStartsOn={weekStartsOn}
      events={events}
    />
  );
}
