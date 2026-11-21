"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CaretDown, CaretLeft, CaretRight, CaretUp, MapPin, Plus } from "@phosphor-icons/react";
import { Emoji, HandText } from "@/components/ui";
import { soft, strong } from "@/lib/colours";
import { layoutDay, monthGridDays, startOfWeek } from "@/lib/calendar-layout";
import { addDays, type LocalDate } from "@/lib/time";
import { PhoneSeg, phonePrimaryClass, phoneSecondaryClass } from "./phone-ui";

/** One thing on the phone's calendar, worked out on the server (times already in words). */
export type PhoneEvent = {
  key: string;
  /** Where tapping it goes (null for holidays and birthdays). */
  href: string | null;
  title: string;
  emoji: string;
  /** Its (first) person's colour; null for a holiday. */
  colour: string | null;
  /** Everyone it's for, as colours (for the dots on the week strip). */
  colours: string[];
  firstDay: LocalDate;
  lastDay: LocalDate;
  /** In the all-day row: all day, or timed but running over several days. */
  allDay: boolean;
  timedAllDay: boolean;
  startText: string;
  endText: string | null;
  /** Minutes after midnight on its day (timed ones only). */
  startMin: number;
  endMin: number;
  location: string | null;
  who: string;
  repeats: boolean;
};

type Mode = "agenda" | "3day" | "month";

const MODE_KEY = "almanac-phone-calendar";
/** How tall one hour is on the 3-day grid. */
const HOUR_REM = 3.5;

/** A local date as a Date at noon UTC, for naming it (no time-zone slips). */
const asDate = (d: LocalDate) => new Date(`${d}T12:00:00Z`);

function fmt(d: LocalDate, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(asDate(d));
}

function onDay(e: PhoneEvent, d: LocalDate) {
  return e.firstDay <= d && d <= e.lastDay;
}

export function CalendarView({
  date,
  today,
  from,
  to,
  locale,
  weekStartsOn,
  events,
}: {
  date: LocalDate;
  today: LocalDate;
  /** The days loaded from the server. */
  from: LocalDate;
  to: LocalDate;
  locale: string;
  weekStartsOn: 0 | 1;
  events: PhoneEvent[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("agenda");
  const [focus, setFocus] = useState<LocalDate>(date);
  const [monthOpen, setMonthOpen] = useState(false);
  const scrollToRef = useRef<LocalDate | null>(date);
  const viewRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // How tall the part that stays put is (the month makes it taller), for what sits under it.
  useEffect(() => {
    const top = topRef.current;
    const view = viewRef.current;
    if (!top || !view) return;
    const set = () => view.style.setProperty("--phone-top", `${top.getBoundingClientRect().height}px`);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(top);
    return () => watch.disconnect();
  }, []);

  // Each phone remembers Agenda or 3 Day.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after the first paint (no storage on the server)
      if (saved === "3day" || saved === "month") setMode(saved);
    } catch {
      // Private browsing: always Agenda.
    }
  }, []);
  const pickMode = (m: Mode) => {
    setMode(m);
    scrollToRef.current = focus;
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      // Not remembered.
    }
  };

  /** Moves to a day: here when it's loaded, otherwise loads the days around it. */
  const goTo = (d: LocalDate) => {
    const grid = mode === "month" ? monthGridDays(d, weekStartsOn) : [d];
    if (d < from || d > to || (mode === "3day" && addDays(d, 2) > to) || grid[0] < from || grid.at(-1)! > to) {
      router.push(`/m?date=${d}`);
      return;
    }
    scrollToRef.current = d;
    setFocus(d);
  };

  const days = useMemo(() => {
    const out: LocalDate[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<LocalDate, PhoneEvent[]>();
    for (const d of days) map.set(d, events.filter((e) => onDay(e, d)));
    return map;
  }, [days, events]);

  const month = fmt(focus, locale, { month: "long" });
  const year = fmt(focus, locale, { year: "numeric" });

  return (
    <div ref={viewRef} className="flex flex-1 flex-col">
      {/* The top stays put while the days scroll under it. */}
      <div ref={topRef} data-phone-sticky className="sticky top-0 z-20 bg-rail">
        <header className="flex min-h-[4.5rem] items-center gap-2 px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={() => mode !== "month" && setMonthOpen((o) => !o)}
            aria-expanded={mode === "month" ? undefined : monthOpen}
            className="flex min-h-12 min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <h1 className="truncate text-[clamp(1.6rem,7.6vw,2rem)] leading-none font-extrabold tracking-[-0.045em] text-title">{month}</h1>
            <span className="tabular hidden shrink-0 text-[1.1rem] leading-none font-bold text-title-soft min-[360px]:inline">{year}</span>
            {mode === "month" ? null : monthOpen ? <CaretUp size="1.2rem" weight="bold" className="self-center text-ink-muted" aria-hidden /> : <CaretDown size="1.2rem" weight="bold" className="self-center text-ink-muted" aria-hidden />}
          </button>
          {focus !== today ? (
            <button type="button" onClick={() => goTo(today)} className={phoneSecondaryClass}>
              Today
            </button>
          ) : null}
          <Link href={`/m/add?date=${focus}`} className={`${phonePrimaryClass} px-4`} aria-label="Add an event">
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Add
          </Link>
        </header>
        <div className="px-3 pb-2" hidden={mode === "month"}>
          {monthOpen ? (
            <MonthGrid
              focus={focus}
              today={today}
              locale={locale}
              weekStartsOn={weekStartsOn}
              byDay={byDay}
              events={events}
              onPick={(d) => {
                setMonthOpen(false);
                goTo(d);
              }}
            />
          ) : (
            <WeekStrip focus={focus} today={today} locale={locale} weekStartsOn={weekStartsOn} byDay={byDay} events={events} onPick={goTo} />
          )}
        </div>
        <div className="border-b border-frame px-4 pb-2">
          <PhoneSeg
            label="View"
            value={mode}
            onChange={pickMode}
            options={[
              { value: "agenda", label: "Agenda" },
              { value: "3day", label: "3 Day" },
              { value: "month", label: "Month" },
            ]}
          />
        </div>
      </div>

      {mode === "month" ? (
        <MonthView
          focus={focus}
          today={today}
          locale={locale}
          weekStartsOn={weekStartsOn}
          byDay={byDay}
          onPick={setFocus}
          onMonth={(n) => {
            const [y, m] = focus.split("-").map(Number);
            goTo(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10));
          }}
        />
      ) : mode === "agenda" ? (
        <Agenda days={days} byDay={byDay} today={today} locale={locale} to={to} scrollToRef={scrollToRef} onFocus={setFocus} onMore={() => router.push(`/m?date=${addDays(to, 1)}`)} />
      ) : (
        <ThreeDay start={focus} today={today} locale={locale} byDay={byDay} scrollToRef={scrollToRef} onMove={(n) => goTo(addDays(focus, n))} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The week strip and the month it opens into
// ---------------------------------------------------------------------------

/** Up to three dots under a day: the colours of the people with things on. */
function DayDots({ list }: { list: PhoneEvent[] }) {
  const colours = [...new Set(list.flatMap((e) => (e.colours.length ? e.colours : e.colour ? [e.colour] : ["orange"])))].slice(0, 3);
  return (
    <span className="flex h-2 items-center justify-center gap-0.5" aria-hidden>
      {colours.map((c) => (
        <span key={c} className="size-1.5 rounded-full" style={{ background: strong(c) }} />
      ))}
    </span>
  );
}

function dayCount(list: PhoneEvent[]): string {
  const n = list.filter((e) => e.href).length;
  return n === 0 ? "nothing on" : n === 1 ? "1 thing on" : `${n} things on`;
}

/** Swipes left and right on an element: next or back. */
function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

function DayButton({
  day,
  focus,
  today,
  locale,
  list,
  faint = false,
  onPick,
}: {
  day: LocalDate;
  focus: LocalDate;
  today: LocalDate;
  locale: string;
  list: PhoneEvent[];
  faint?: boolean;
  onPick: (d: LocalDate) => void;
}) {
  const on = day === focus;
  return (
    <button
      type="button"
      onClick={() => onPick(day)}
      aria-label={`${fmt(day, locale, { weekday: "long", month: "long", day: "numeric" })}, ${dayCount(list)}`}
      aria-pressed={on}
      className="flex min-h-12 flex-col items-center justify-center gap-0.5"
    >
      <span
        className={`tabular flex size-9 items-center justify-center rounded-full text-[1.15rem] leading-none font-bold ${
          on ? "bg-primary text-primary-ink" : day === today ? "text-accent" : faint ? "text-ink-muted" : "text-ink"
        }`}
      >
        {Number(day.slice(8))}
      </span>
      <DayDots list={list} />
    </button>
  );
}

function Weekdays({ start, locale }: { start: LocalDate; locale: string }) {
  return (
    <div className="grid grid-cols-7" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="text-center text-[0.9rem] font-bold text-ink-muted uppercase">
          {fmt(addDays(start, i), locale, { weekday: "narrow" })}
        </span>
      ))}
    </div>
  );
}

type StripProps = {
  focus: LocalDate;
  today: LocalDate;
  locale: string;
  weekStartsOn: 0 | 1;
  byDay: Map<LocalDate, PhoneEvent[]>;
  events: PhoneEvent[];
  onPick: (d: LocalDate) => void;
};

/** Events on a day that may be outside what's in `byDay` (a week strip at the edge of what's loaded). */
function listFor(byDay: Map<LocalDate, PhoneEvent[]>, events: PhoneEvent[], d: LocalDate) {
  return byDay.get(d) ?? events.filter((e) => onDay(e, d));
}

function WeekStrip({ focus, today, locale, weekStartsOn, byDay, events, onPick }: StripProps) {
  const start = startOfWeek(focus, weekStartsOn);
  const swipe = useSwipe((dir) => onPick(addDays(focus, dir * 7)));
  return (
    <div {...swipe} className="flex flex-col gap-0.5">
      <Weekdays start={start} locale={locale} />
      <div className="grid grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => (
          <DayButton key={d} day={d} focus={focus} today={today} locale={locale} list={listFor(byDay, events, d)} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ focus, today, locale, weekStartsOn, byDay, events, onPick }: StripProps) {
  const [shown, setShown] = useState(focus.slice(0, 7) + "-01");
  const grid = monthGridDays(shown, weekStartsOn);
  const step = (n: number) => {
    const [y, m] = shown.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + n, 1));
    setShown(next.toISOString().slice(0, 10));
  };
  const swipe = useSwipe(step);
  return (
    <div {...swipe} className="flex flex-col gap-0.5 rounded-[var(--radius-card)] bg-board px-1 pt-1 pb-1 shadow-raised">
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={() => step(-1)} aria-label="Last month" className="flex size-12 items-center justify-center rounded-full text-ink">
          <CaretLeft size="1.3rem" weight="bold" aria-hidden />
        </button>
        <span className="text-[1.15rem] font-bold text-ink">{fmt(shown, locale, { month: "long", year: "numeric" })}</span>
        <button type="button" onClick={() => step(1)} aria-label="Next month" className="flex size-12 items-center justify-center rounded-full text-ink">
          <CaretRight size="1.3rem" weight="bold" aria-hidden />
        </button>
      </div>
      <Weekdays start={grid[0]} locale={locale} />
      <div className="grid grid-cols-7">
        {grid.map((d) => (
          <DayButton key={d} day={d} focus={focus} today={today} locale={locale} list={listFor(byDay, events, d)} faint={d.slice(0, 7) !== shown.slice(0, 7)} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agenda: every day in order, with what's on
// ---------------------------------------------------------------------------

function timeLabel(e: PhoneEvent, day: LocalDate): { top: string; bottom: string | null } {
  if (!e.allDay) return { top: e.startText, bottom: e.endText };
  if (e.timedAllDay) {
    if (day === e.firstDay) return { top: e.startText, bottom: null };
    if (day === e.lastDay) return { top: "Until", bottom: e.endText };
  }
  return { top: "All day", bottom: null };
}

function EventRow({ e, day }: { e: PhoneEvent; day: LocalDate }) {
  const t = timeLabel(e, day);
  const body = (
    <>
      <span className="tabular flex w-[4.4rem] shrink-0 flex-col pt-0.5 text-[0.95rem] leading-tight font-bold text-ink-soft">
        <span>{t.top}</span>
        {t.bottom ? <span className="font-semibold text-ink-muted">{t.bottom}</span> : null}
      </span>
      <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: e.colour ? strong(e.colour) : "var(--color-frame)" }} aria-hidden />
      <Emoji emoji={e.emoji} className="size-8" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <HandText colour={e.colour} className="text-[1.2rem] leading-snug font-semibold [overflow-wrap:anywhere]">
          {e.title}
        </HandText>
        {e.location || e.who ? (
          <span className="flex min-w-0 items-center gap-1 text-[0.95rem] font-semibold text-ink-muted">
            {e.location ? (
              <>
                <MapPin size="1rem" weight="bold" aria-hidden className="shrink-0" />
                <span className="truncate">{e.location}</span>
              </>
            ) : null}
            {e.location && e.who ? <span aria-hidden>·</span> : null}
            {e.who ? <span className="truncate">{e.who}</span> : null}
          </span>
        ) : null}
      </span>
      {e.repeats ? <ArrowsClockwise size="1rem" weight="bold" className="mt-1 shrink-0 text-ink-muted" aria-label="Repeats" /> : null}
    </>
  );
  const cls = "flex min-h-14 items-start gap-2.5 px-4 py-2.5";
  return e.href ? (
    <Link href={e.href} className={`${cls} active:bg-rail`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Agenda({
  days,
  byDay,
  today,
  locale,
  to,
  scrollToRef,
  onFocus,
  onMore,
}: {
  days: LocalDate[];
  byDay: Map<LocalDate, PhoneEvent[]>;
  today: LocalDate;
  locale: string;
  to: LocalDate;
  scrollToRef: React.RefObject<LocalDate | null>;
  onFocus: (d: LocalDate) => void;
  onMore: () => void;
}) {
  const refs = useRef(new Map<LocalDate, HTMLElement>());
  const jumping = useRef(false);

  // Tapping a day on the strip scrolls the agenda to it.
  useEffect(() => {
    const d = scrollToRef.current;
    if (!d) return;
    scrollToRef.current = null;
    const el = refs.current.get(d);
    if (!el) return;
    jumping.current = true;
    const top = document.querySelector("[data-phone-sticky]")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - top - 8 });
    const t = window.setTimeout(() => (jumping.current = false), 150);
    return () => window.clearTimeout(t);
  });

  // Scrolling the agenda moves the strip along with it.
  useEffect(() => {
    const onScroll = () => {
      if (jumping.current) return;
      const top = (document.querySelector("[data-phone-sticky]")?.getBoundingClientRect().bottom ?? 0) + 12;
      let current: LocalDate | null = null;
      for (const d of days) {
        const el = refs.current.get(d);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= top) current = d;
        else break;
      }
      if (current) onFocus(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [days, onFocus]);

  return (
    <div className="flex flex-col gap-3 px-3 pt-3" data-phone-agenda>
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        const past = d < today;
        return (
          <section
            key={d}
            ref={(el) => {
              if (el) refs.current.set(d, el);
              else refs.current.delete(d);
            }}
          >
            <h2 className={`flex items-baseline gap-2 px-1 pb-1.5 text-[1.05rem] font-bold ${d === today ? "text-accent" : past ? "text-ink-muted" : "text-ink-soft"}`}>
              {d === today ? <span className="uppercase">Today</span> : d === addDays(today, 1) ? <span className="uppercase">Tomorrow</span> : null}
              <span>{fmt(d, locale, { weekday: "long", month: "long", day: "numeric" })}</span>
            </h2>
            {list.length === 0 ? (
              <p className="px-1 pb-1 text-[1rem] font-semibold text-ink-muted">Nothing planned</p>
            ) : (
              <div className={`divide-y divide-frame overflow-hidden rounded-[var(--radius-card)] bg-board shadow-raised ${past ? "opacity-70" : ""}`}>
                {list.map((e) => (
                  <EventRow key={e.key} e={e} day={d} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <button type="button" onClick={onMore} className={`${phoneSecondaryClass} my-3`}>
        Later than {fmt(to, locale, { month: "short", day: "numeric" })}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 Day: an hour grid for three days, to see when there's room
// ---------------------------------------------------------------------------

function hourLabel(h: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, h)))
    .replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

function ThreeDay({
  start,
  today,
  locale,
  byDay,
  scrollToRef,
  onMove,
}: {
  start: LocalDate;
  today: LocalDate;
  locale: string;
  byDay: Map<LocalDate, PhoneEvent[]>;
  scrollToRef: React.RefObject<LocalDate | null>;
  onMove: (n: number) => void;
}) {
  const days = [start, addDays(start, 1), addDays(start, 2)];
  const gridRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipe((dir) => onMove(dir * 3));

  // Opens on the morning (or the hour before now, today).
  useEffect(() => {
    if (!scrollToRef.current) return;
    scrollToRef.current = null;
    const el = gridRef.current;
    if (!el) return;
    const now = new Date();
    const hour = days.includes(today) ? Math.max(0, now.getHours() - 1) : 7;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const sticky = document.querySelector("[data-phone-sticky]")?.getBoundingClientRect().height ?? 0;
    const head = el.previousElementSibling?.getBoundingClientRect().height ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY + hour * HOUR_REM * rem;
    window.scrollTo({ top: top - sticky - head });
  });

  const allDay = days.map((d) => (byDay.get(d) ?? []).filter((e) => e.allDay));
  const hasAllDay = allDay.some((l) => l.length > 0);

  return (
    <div {...swipe} className="flex flex-col pt-2">
      <div className="sticky top-[var(--phone-top)] z-10 flex items-stretch border-b border-frame bg-rail pr-2">
        <div className="flex w-12 shrink-0 flex-col items-center justify-center">
          <button type="button" onClick={() => onMove(-3)} aria-label="Earlier days" className="flex size-12 items-center justify-center text-ink">
            <CaretLeft size="1.2rem" weight="bold" aria-hidden />
          </button>
        </div>
        {days.map((d, i) => (
          <div key={d} className="flex min-w-0 flex-1 flex-col gap-1 px-0.5 pb-1.5">
            <span className={`text-center text-[1rem] font-bold ${d === today ? "text-accent" : "text-ink-soft"}`}>
              {fmt(d, locale, { weekday: "short" })} {Number(d.slice(8))}
            </span>
            {hasAllDay
              ? allDay[i].slice(0, 3).map((e) =>
                  e.href ? (
                    <Link key={e.key} href={e.href} className="flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[0.9rem] font-bold" style={{ background: soft(e.colour) }}>
                      <Emoji emoji={e.emoji} className="size-5" />
                      <HandText colour={e.colour} className="truncate">
                        {e.title}
                      </HandText>
                    </Link>
                  ) : (
                    <span key={e.key} className="flex min-h-8 items-center gap-1 rounded-md bg-panel px-1.5 text-[0.9rem] font-bold text-ink">
                      <Emoji emoji={e.emoji} className="size-5" />
                      <span className="truncate">{e.title}</span>
                    </span>
                  ),
                )
              : null}
            {allDay[i].length > 3 ? <span className="text-center text-[0.85rem] font-bold text-ink-muted">+{allDay[i].length - 3} more</span> : null}
          </div>
        ))}
        <button type="button" onClick={() => onMove(3)} aria-label="Later days" className="-mr-2 flex w-9 shrink-0 items-start justify-center pt-0 text-ink">
          <CaretRight size="1.2rem" weight="bold" aria-hidden className="mt-0.5" />
        </button>
      </div>

      <div ref={gridRef} className="relative flex pr-2" style={{ height: `${24 * HOUR_REM}rem` }}>
        <div className="w-12 shrink-0">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="tabular absolute left-0 w-12 pr-1 text-right text-[0.8rem] font-bold text-ink-muted" style={{ top: `calc(${h * HOUR_REM}rem - 0.5rem)` }}>
              {h === 0 ? "" : hourLabel(h, locale)}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const timed = (byDay.get(d) ?? []).filter((e) => !e.allDay);
          const placed = layoutDay(timed.map((e) => ({ id: e.key, startMin: e.startMin, endMin: e.endMin })));
          return (
            <div key={d} className={`relative min-w-0 flex-1 border-l border-frame ${d === today ? "bg-board/60" : ""}`}>
              {Array.from({ length: 24 }, (_, h) => (
                <Link
                  key={h}
                  href={`/m/add?date=${d}&time=${String(h).padStart(2, "0")}:00`}
                  aria-label={`Add at ${hourLabel(h, locale)}, ${fmt(d, locale, { weekday: "long" })}`}
                  className="absolute inset-x-0 border-t border-frame"
                  style={{ top: `${h * HOUR_REM}rem`, height: `${HOUR_REM}rem` }}
                />
              ))}
              {placed.map((p) => {
                const e = timed.find((x) => x.key === p.id)!;
                const height = Math.max(p.endMin - p.startMin, 30) / 60;
                return (
                  <Link
                    key={e.key}
                    href={e.href ?? "#"}
                    className="absolute flex flex-col overflow-hidden rounded-md border-l-4 px-1 py-0.5 text-[0.85rem] leading-tight font-bold"
                    style={{
                      top: `${(p.startMin / 60) * HOUR_REM}rem`,
                      height: `calc(${height * HOUR_REM}rem - 2px)`,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / p.lanes}% - 4px)`,
                      background: soft(e.colour),
                      borderColor: strong(e.colour),
                    }}
                  >
                    <HandText colour={e.colour} className="line-clamp-3 [overflow-wrap:anywhere]">
                      {e.title}
                    </HandText>
                    <span className="tabular truncate font-semibold text-ink-soft">{e.startText}</span>
                  </Link>
                );
              })}
              {d === today ? <NowLine /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The red Now line across today's column. */
function NowLine() {
  const [minute, setMinute] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setMinute(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (minute === null) return null;
  return <span aria-hidden className="pointer-events-none absolute inset-x-0 h-0.5 bg-now" style={{ top: `${(minute / 60) * HOUR_REM}rem` }} />;
}

// ---------------------------------------------------------------------------
// Month: the whole month with what's on each day, and the picked day below
// ---------------------------------------------------------------------------

/** How many events a day square names before "+N". */
const MONTH_CHIPS = 3;

function MonthView({
  focus,
  today,
  locale,
  weekStartsOn,
  byDay,
  onPick,
  onMonth,
}: {
  focus: LocalDate;
  today: LocalDate;
  locale: string;
  weekStartsOn: 0 | 1;
  byDay: Map<LocalDate, PhoneEvent[]>;
  onPick: (d: LocalDate) => void;
  onMonth: (n: 1 | -1) => void;
}) {
  const grid = monthGridDays(focus, weekStartsOn);
  const swipe = useSwipe(onMonth);
  const picked = byDay.get(focus) ?? [];
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div {...swipe} className="flex flex-col">
        <div className="flex items-center justify-between px-2">
          <button type="button" onClick={() => onMonth(-1)} aria-label="Last month" className="flex size-12 items-center justify-center rounded-full text-ink">
            <CaretLeft size="1.3rem" weight="bold" aria-hidden />
          </button>
          <span className="text-[1.15rem] font-bold text-ink">{fmt(focus, locale, { month: "long", year: "numeric" })}</span>
          <button type="button" onClick={() => onMonth(1)} aria-label="Next month" className="flex size-12 items-center justify-center rounded-full text-ink">
            <CaretRight size="1.3rem" weight="bold" aria-hidden />
          </button>
        </div>
        <div className="px-1">
          <Weekdays start={grid[0]} locale={locale} />
        </div>
        <div className="grid grid-cols-7 border-t border-frame bg-board">
          {grid.map((d) => {
            const list = byDay.get(d) ?? [];
            const other = d.slice(0, 7) !== focus.slice(0, 7);
            const on = d === focus;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPick(d)}
                aria-pressed={on}
                aria-label={`${fmt(d, locale, { weekday: "long", month: "long", day: "numeric" })}, ${dayCount(list)}`}
                className={`flex min-h-[5.75rem] min-w-0 flex-col items-stretch gap-0.5 border-r border-b border-frame px-0.5 pt-1 pb-1 text-left ${
                  other || d < today ? "bg-rail" : ""
                } ${on ? "outline-2 -outline-offset-2 outline-ink" : ""}`}
              >
                <span
                  className={`tabular mx-auto flex size-7 items-center justify-center rounded-full text-[1rem] leading-none font-bold ${
                    d === today ? "bg-primary text-primary-ink" : other ? "text-ink-muted" : "text-ink"
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                {list.slice(0, list.length > MONTH_CHIPS ? MONTH_CHIPS - 1 : MONTH_CHIPS).map((e) => (
                  <span
                    key={e.key}
                    className="block truncate rounded-[0.3rem] px-1 text-[0.75rem] leading-[1.15rem] font-bold"
                    style={{ background: e.colour ? soft(e.colour) : "var(--color-panel)" }}
                  >
                    <HandText colour={e.colour}>{e.title}</HandText>
                  </span>
                ))}
                {list.length > MONTH_CHIPS ? (
                  <span className="px-1 text-[0.75rem] leading-[1.15rem] font-bold text-ink-muted">+{list.length - (MONTH_CHIPS - 1)}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className="px-3">
        <h2 className={`flex items-baseline gap-2 px-1 pb-1.5 text-[1.05rem] font-bold ${focus === today ? "text-accent" : "text-ink-soft"}`}>
          {focus === today ? <span className="uppercase">Today</span> : null}
          <span>{fmt(focus, locale, { weekday: "long", month: "long", day: "numeric" })}</span>
        </h2>
        {picked.length === 0 ? (
          <p className="px-1 pb-1 text-[1rem] font-semibold text-ink-muted">Nothing planned</p>
        ) : (
          <div className="divide-y divide-frame overflow-hidden rounded-[var(--radius-card)] bg-board shadow-raised">
            {picked.map((e) => (
              <EventRow key={e.key} e={e} day={focus} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
