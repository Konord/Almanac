"use client";

import { useRef, useState, type PointerEvent } from "react";
import { updatePending, usePending } from "@/components/pending-store";
import { clock, toMinutes } from "@/components/timeline-drag";
import { endOf, MAX_EVENT_MINUTES, setEnd, setLength, setStart, type When } from "@/lib/event-times";
import { lengthLabel } from "@/lib/quick-times";
import { addDays, isLocalDate, isLocalTime } from "@/lib/time";

/*
 * When an event happens, on the add and edit cards: the day, the start, a
 * length dial and the end, all kept in step (see src/lib/event-times.ts).
 * Change the start and the end follows; change the end and the length
 * follows; set the end and then the length, and the start follows.
 * A different end day makes an event that runs over several days.
 *
 * While adding, the day, start and length are shared with the dashed
 * outline on the timeline, so dragging the outline moves these too.
 *
 * Sends startDate, startTime, endDate, endTime, minutes and allDay with the form.
 */

type Core = { date: string; start: number | null; length: number; allDay: boolean };

/** Where a timed event starts when it had no time yet (e.g. switching All day off). */
const USUAL_START = 9 * 60;
const STEP = 15;

export function WhenFields({
  date,
  startTime,
  minutes,
  allDay,
  endDate,
  adding = false,
}: {
  date: string;
  startTime?: string;
  minutes: number;
  allDay: boolean;
  /** Last day of an all-day event over several days. */
  endDate?: string;
  /** Adding a new event: keep the dashed outline on the timeline in step. */
  adding?: boolean;
}) {
  const pending = usePending();
  const [own, setOwn] = useState<Core>({
    date,
    start: startTime && isLocalTime(startTime) ? toMinutes(startTime) : null,
    length: minutes,
    allDay,
  });
  const [anchor, setAnchor] = useState<When["anchor"]>("start");
  const [lastDay, setLastDay] = useState(endDate && endDate >= date ? endDate : date);

  const shared = adding && pending !== null;
  const core: Core = shared ? { date: pending.date, start: pending.start, length: pending.minutes, allDay: pending.allDay } : own;
  const write = (next: Core) => {
    if (shared) updatePending({ date: next.date, start: next.start, minutes: next.length, allDay: next.allDay });
    else setOwn(next);
  };

  const when: When = { date: core.date, start: core.start ?? USUAL_START, length: core.length, anchor };
  const end = endOf(when);
  const apply = (next: When) => {
    setAnchor(next.anchor);
    // An all-day event's last day moves along with its first.
    if (next.date !== core.date) setLastDay((d) => shiftBy(d, core.date, next.date));
    write({ ...core, date: next.date, start: next.start, length: next.length });
  };

  const changeDate = (value: string) => isLocalDate(value) && apply(setStart(when, value, when.start));
  const changeStart = (value: string) => isLocalTime(value) && apply(setStart(when, when.date, toMinutes(value)));
  const changeEndTime = (value: string) => isLocalTime(value) && apply(setEnd(when, { date: end.date, minute: toMinutes(value) }));
  const changeEndDate = (value: string) => isLocalDate(value) && apply(setEnd(when, { date: value, minute: end.minute }));
  const changeLength = (value: number) => apply(setLength(when, value));
  // Switching All day keeps the days it covers: Thu to Sun all day becomes Thu 9am to Sun 10am, and back.
  const toggleAllDay = (on: boolean) => {
    if (on) {
      setLastDay(end.date);
      write({ ...core, allDay: true });
      return;
    }
    const days = Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${core.date}T00:00:00Z`)) / 86_400_000);
    const length = days > 0 ? days * 24 * 60 + 60 : core.length === 0 ? 60 : core.length;
    write({ ...core, allDay: false, start: core.start ?? USUAL_START, length });
  };

  const point = core.length === 0;
  const timeFields = !core.allDay;

  return (
    <div className="grid gap-4">
      {/* What the form sends. */}
      <input type="hidden" name="startDate" value={core.date} />
      <input type="hidden" name="startTime" value={timeFields ? clock(when.start) : ""} />
      <input type="hidden" name="endDate" value={timeFields ? end.date : lastDay} />
      <input type="hidden" name="endTime" value={timeFields ? clock(end.minute) : ""} />
      <input type="hidden" name="minutes" value={core.length} />

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Labelled label={core.allDay && lastDay !== core.date ? "First day" : "Day"}>
          <input type="date" value={core.date} onChange={(e) => changeDate(e.target.value)} required className={inputClass} />
        </Labelled>
        {timeFields ? (
          <Labelled label="Starts at">
            <input type="time" step={STEP * 60} value={clock(when.start)} onChange={(e) => changeStart(e.target.value)} className={inputClass} />
          </Labelled>
        ) : (
          <Labelled label="Last day">
            <input
              type="date"
              value={lastDay}
              min={core.date}
              onChange={(e) => isLocalDate(e.target.value) && setLastDay(e.target.value < core.date ? core.date : e.target.value)}
              className={inputClass}
            />
          </Labelled>
        )}
        <label className="flex min-h-[var(--touch-target)] shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <input type="checkbox" name="allDay" checked={core.allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="size-5 accent-ink" />
          All day
        </label>
      </div>

      {timeFields ? (
        <div className="grid grid-cols-[auto_1fr] items-center gap-6">
          <LengthDial minutes={core.length} onChange={changeLength} />
          <div className="grid content-center gap-3">
            <Labelled label={point ? "A point in time (no end)" : "Ends at"}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  step={STEP * 60}
                  value={clock(end.minute)}
                  disabled={point}
                  onChange={(e) => changeEndTime(e.target.value)}
                  aria-label="End time"
                  className={`${inputClass} disabled:opacity-40`}
                />
                <input
                  type="date"
                  value={end.date}
                  min={core.date}
                  disabled={point}
                  onChange={(e) => changeEndDate(e.target.value)}
                  aria-label="End day"
                  className={`${inputClass} disabled:opacity-40`}
                />
              </div>
            </Labelled>
            <button
              type="button"
              onClick={() => changeLength(point ? 60 : 0)}
              aria-pressed={point}
              title="A time with no length, like Homework due 9am"
              className={`flex min-h-[var(--touch-target)] w-fit items-center rounded-full border-2 px-4 text-lg text-ink ${
                point ? "border-ink bg-rail font-bold" : "border-frame bg-board"
              }`}
            >
              No length
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Just a length (the dial and No length), for templates, which have no
 * date. Sends "minutes" with the form.
 */
export function LengthInput({ initial }: { initial: number }) {
  const [minutes, setMinutes] = useState(initial);
  const point = minutes === 0;
  return (
    <div className="flex items-center gap-6">
      <input type="hidden" name="minutes" value={minutes} />
      <LengthDial minutes={minutes} onChange={(m) => setMinutes(Math.min(m, 24 * 60))} />
      <button
        type="button"
        onClick={() => setMinutes(point ? 60 : 0)}
        aria-pressed={point}
        title="A time with no length, like Homework due 9am"
        className={`flex min-h-[var(--touch-target)] items-center rounded-full border-2 px-4 text-lg text-ink ${
          point ? "border-ink bg-rail font-bold" : "border-frame bg-board"
        }`}
      >
        No length
      </button>
    </div>
  );
}

/** Moves a date by the same number of days another date moved. */
function shiftBy(day: string, from: string, to: string): string {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return addDays(day, days);
}

const inputClass =
  "min-h-[var(--touch-target)] w-full min-w-0 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-base font-bold text-ink">{label}</span>
      {children}
    </label>
  );
}

/** Two decimal places, so the server and browser draw the dial identically. */
const round = (n: number) => Math.round(n * 100) / 100;

/** One trip round the dial is 12 hours, like a clock face. */
const TURN = 12 * 60;

/**
 * The length dial: drag round the ring like a clock hand (round to 2 for
 * two hours; keep going past the top for longer), or nudge it with the
 * − and + buttons, 15 minutes at a time.
 */
export function LengthDial({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const ring = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const point = minutes === 0;
  const inTurn = minutes % TURN;
  const turns = Math.floor(minutes / TURN);
  // The arc for this trip round; a full ring underneath for each 12 hours already done.
  const fraction = inTurn / TURN;
  const angle = fraction * 2 * Math.PI;
  const knob = { x: round(50 + 40 * Math.sin(angle)), y: round(50 - 40 * Math.cos(angle)) };
  const arc =
    fraction === 0
      ? ""
      : `M 50 10 A 40 40 0 ${fraction > 0.5 ? 1 : 0} 1 ${knob.x.toFixed(2)} ${knob.y.toFixed(2)}`;

  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = ring.current?.getBoundingClientRect();
    if (!box) return;
    const x = e.clientX - (box.left + box.width / 2);
    const y = e.clientY - (box.top + box.height / 2);
    let turn = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1;
    let next = Math.round((turn * TURN) / STEP) * STEP;
    if (next === TURN) next = 0;
    // Crossing the top adds (or takes off) 12 hours.
    let whole = turns;
    if (inTurn > TURN * 0.75 && next < TURN * 0.25) whole += 1;
    if (inTurn < TURN * 0.25 && next > TURN * 0.75) whole -= 1;
    if (whole < 0) {
      whole = 0;
      next = STEP;
    }
    turn = whole * TURN + next;
    onChange(Math.min(Math.max(turn, STEP), Math.max(2 * TURN, Math.min(minutes, MAX_EVENT_MINUTES))));
  };

  const nudge = (by: number) => onChange(Math.min(Math.max(minutes + by, STEP), MAX_EVENT_MINUTES));
  const button =
    "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full border-2 border-frame bg-board text-xl font-bold text-ink";

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Length">
      <button type="button" onClick={() => nudge(-STEP)} className={button} aria-label="15 minutes shorter">
        −
      </button>
      <div className="relative size-40">
        <svg
          ref={ring}
          viewBox="0 0 100 100"
          className="size-full touch-none select-none"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          role="slider"
          aria-label="Length"
          aria-valuemin={0}
          aria-valuemax={MAX_EVENT_MINUTES}
          aria-valuenow={minutes}
          aria-valuetext={point ? "No length" : lengthLabel(minutes)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") nudge(STEP);
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") nudge(-STEP);
          }}
        >
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-rail)" strokeWidth="12" />
          {turns > 0 ? <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-accent)" strokeOpacity="0.35" strokeWidth="12" /> : null}
          {Array.from({ length: 12 }, (_, h) => {
            const a = (h / 12) * 2 * Math.PI;
            return (
              <line
                key={h}
                x1={round(50 + 31 * Math.sin(a))}
                y1={round(50 - 31 * Math.cos(a))}
                x2={round(50 + 28 * Math.sin(a))}
                y2={round(50 - 28 * Math.cos(a))}
                stroke="var(--color-frame)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
          {arc && !point ? <path d={arc} fill="none" stroke="var(--color-accent)" strokeWidth="12" strokeLinecap="round" /> : null}
          {point ? null : <circle cx={knob.x} cy={knob.y} r="8" fill="var(--color-board)" stroke="var(--color-accent)" strokeWidth="3" />}
        </svg>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-tight" aria-hidden>
          <span className={`font-extrabold text-ink ${minutes >= 24 * 60 ? "max-w-24 text-lg" : "text-2xl"}`}>{point ? "No" : lengthLabel(minutes)}</span>
          <span className="text-sm font-bold text-ink-muted">{point ? "length" : "long"}</span>
        </span>
      </div>
      <button type="button" onClick={() => nudge(STEP)} className={button} aria-label="15 minutes longer">
        +
      </button>
    </div>
  );
}
