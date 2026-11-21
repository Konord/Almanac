"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, CalendarBlank, Clock, Minus, Plus } from "@phosphor-icons/react";
import { wallTime } from "@/lib/time-text";

/*
 * Day, time and number fields for the touchscreen (UI audit H4, 2026-11-21).
 *
 * The browser's own date and time boxes are made for a keyboard and a
 * mouse: they show "11/20/2026" and "10:00 PM" (not Almanac's "Fri, Nov 20"
 * and "10 pm"), and their little spinners are fiddly by finger. These show
 * the value in Almanac's words on a big button; a tap opens a panel of big
 * targets (Today / Tomorrow and a month of days; hours, am/pm and minutes).
 * Numbers are a − / + stepper. Nothing needs a keyboard.
 *
 * Each one can sit in a plain form: with a `name`, it carries a hidden
 * input with the same value the browser's box would have sent
 * (YYYY-MM-DD, HH:MM, or the number), so server actions don't change.
 * Use `value` + `onChange` (controlled) or `defaultValue` (uncontrolled).
 */

const fieldClass =
  "flex min-h-[var(--touch-target)] w-full min-w-0 items-center justify-between gap-3 rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-left text-[1.5rem] font-bold text-ink disabled:opacity-40";

const cellBase = "flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] text-[1.25rem] font-bold tabular";
const cellOn = "bg-ink text-board";
const cellOff = "bg-rail text-ink";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysTo(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function asUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const isDate = (v: string | undefined | null): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string | undefined | null): v is string => typeof v === "string" && /^\d{2}:\d{2}/.test(v);

/** "Today", "Tomorrow", or "Fri, Nov 20" (with the year when it isn't this year). */
export function dayText(date: string, locale = "en-CA"): string {
  const today = todayLocal();
  if (date === today) return "Today";
  if (date === addDaysTo(today, 1)) return "Tomorrow";
  if (date === addDaysTo(today, -1)) return "Yesterday";
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: "UTC" })
    .format(asUtc(date))
    .replace(/\./g, "");
}

/**
 * A panel that opens next to the button that opened it: below it if there
 * is room, otherwise above, and never off the screen. A tap outside
 * closes it. Drawn in a portal so a sheet's clipping can't cut it off.
 */
function Popover({ anchor: anchorRef, onClose, children, label }: { anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; label: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !panel.current) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const margin = 12;
    const below = a.bottom + 8;
    const above = a.top - 8 - p.height;
    const top = below + p.height <= innerHeight - margin ? below : Math.max(margin, above);
    const left = Math.min(Math.max(margin, a.left), innerWidth - p.width - margin);
    setPlace({ left, top });
  }, [anchorRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onPointerDown={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-label={label}
        className="fixed z-[81] flex flex-col gap-3 rounded-[1.5rem] bg-board p-4 shadow-[0_0_0_2px_var(--color-frame),0_18px_40px_rgba(20,30,50,0.18)]"
        style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/** Keeps a value either given (controlled) or our own (uncontrolled). */
function useValue<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void): [T, (v: T) => void, (el: HTMLInputElement | null) => void | (() => void)] {
  const [own, setOwn] = useState<T>(defaultValue);
  const current = value !== undefined ? value : own;
  const first = useRef(defaultValue);
  // A form that is cleared (React clears a form after its action runs, and
  // a Reset button does too) puts the field back to where it started.
  const watchForm = useCallback((el: HTMLInputElement | null) => {
    const form = el?.form;
    if (!form) return;
    const reset = () => setOwn(first.current);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);
  return [
    current,
    (v: T) => {
      if (value === undefined) setOwn(v);
      onChange?.(v);
    },
    watchForm,
  ];
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

export function DayField({
  name,
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  disabled,
  required,
  allowEmpty = false,
  emptyText = "Pick a day",
  "aria-label": ariaLabel,
  className = "",
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (date: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  /** Offer "No date" (for a field that may be left blank). */
  allowEmpty?: boolean;
  emptyText?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [date, setDate, watchForm] = useValue(value, defaultValue, onChange);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const shown = isDate(date) ? date : todayLocal();
  const [month, setMonth] = useState(shown.slice(0, 7));

  const pick = (d: string) => {
    setDate(d);
    setOpen(false);
  };
  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);

  return (
    <>
      {name ? <input ref={watchForm} type="hidden" name={name} value={date} required={required} /> : null}
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${isDate(date) ? dayText(date) : emptyText}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMonth((isDate(date) ? date : todayLocal()).slice(0, 7));
          setOpen(true);
        }}
        className={`${fieldClass} ${className}`}
      >
        <span className={`truncate ${isDate(date) ? "" : "text-ink-muted"}`}>{isDate(date) ? dayText(date) : emptyText}</span>
        <CalendarBlank size="1.4rem" className="shrink-0 text-ink-muted" aria-hidden />
      </button>
      {open ? (
        <Popover anchor={button} onClose={() => setOpen(false)} label={ariaLabel ?? "Pick a day"}>
          <div className="flex gap-2">
            {[
              { label: "Today", d: todayLocal() },
              { label: "Tomorrow", d: addDaysTo(todayLocal(), 1) },
            ].map((q) => (
              <button key={q.label} type="button" disabled={!allowed(q.d)} onClick={() => pick(q.d)} className={`${cellBase} flex-1 px-4 disabled:opacity-30 ${date === q.d ? cellOn : cellOff}`}>
                {q.label}
              </button>
            ))}
            {allowEmpty ? (
              <button type="button" onClick={() => pick("")} className={`${cellBase} flex-1 px-4 ${date === "" ? cellOn : cellOff}`}>
                No date
              </button>
            ) : null}
          </div>
          <MonthGrid month={month} setMonth={setMonth} selected={date} allowed={allowed} onPick={pick} />
        </Popover>
      ) : null}
    </>
  );
}

function MonthGrid({
  month,
  setMonth,
  selected,
  allowed,
  onPick,
}: {
  month: string;
  setMonth: (m: string) => void;
  selected: string;
  allowed: (d: string) => boolean;
  onPick: (d: string) => void;
}) {
  const first = `${month}-01`;
  const startDow = asUtc(first).getUTCDay();
  const gridStart = addDaysTo(first, -startDow);
  const days = Array.from({ length: 42 }, (_, i) => addDaysTo(gridStart, i));
  // Drop a last row that is all next month.
  const rows = days.slice(35).every((d) => d.slice(0, 7) !== month) ? 5 : 6;
  const today = todayLocal();
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`);
  };
  const title = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(asUtc(first));
  const arrow = "flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => shift(-1)} className={arrow} aria-label="Month before">
          <CaretLeft size="1.4rem" weight="bold" aria-hidden />
        </button>
        <span className="text-[1.35rem] font-bold text-ink">{title}</span>
        <button type="button" onClick={() => shift(1)} className={arrow} aria-label="Month after">
          <CaretRight size="1.4rem" weight="bold" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-center text-[1.125rem] font-bold text-ink-muted">
            {d}
          </span>
        ))}
        {days.slice(0, rows * 7).map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const on = d === selected;
          return (
            <button
              key={d}
              type="button"
              disabled={!allowed(d)}
              onClick={() => onPick(d)}
              aria-label={dayText(d)}
              aria-pressed={on}
              className={`${cellBase} disabled:opacity-25 ${on ? cellOn : d === today ? "border-2 border-now-on-tint text-now-on-tint" : inMonth ? "text-ink" : "text-ink-muted"}`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function TimeField({
  name,
  value,
  defaultValue = "",
  onChange,
  step = 15,
  disabled,
  required,
  allowEmpty = false,
  emptyText = "Pick a time",
  locale = "en-CA",
  "aria-label": ariaLabel,
  className = "",
  defaultOpen = false,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (time: string) => void;
  /** Minutes between the minute choices: 15 (00, 15, 30, 45) or 5. */
  step?: 5 | 15;
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  emptyText?: string;
  locale?: string;
  "aria-label"?: string;
  className?: string;
  /** Open the panel straight away (for a field that appears when you ask to pick a time). */
  defaultOpen?: boolean;
}) {
  const [time, setTime, watchForm] = useValue(value, defaultValue, onChange);
  const [open, setOpen] = useState(defaultOpen);
  const button = useRef<HTMLButtonElement>(null);
  const has = isTime(time);
  const [h, m] = has ? time.slice(0, 5).split(":").map(Number) : [9, 0];
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const set = (hour24: number, minute: number) => setTime(`${pad(hour24)}:${pad(minute)}`);
  const minutes = Array.from({ length: 60 / step }, (_, i) => i * step);
  // A minute that isn't on the steps (from an older entry) still shows as picked nowhere, and stays until changed.

  return (
    <>
      {name ? <input ref={watchForm} type="hidden" name={name} value={has ? time.slice(0, 5) : ""} required={required} /> : null}
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${has ? wallTime(time, locale) : emptyText}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`${fieldClass} ${className}`}
      >
        <span className={`tabular truncate ${has ? "" : "text-ink-muted"}`}>{has ? wallTime(time, locale) : emptyText}</span>
        <Clock size="1.4rem" className="shrink-0 text-ink-muted" aria-hidden />
      </button>
      {open ? (
        <Popover anchor={button} onClose={() => setOpen(false)} label={ariaLabel ?? "Pick a time"}>
          <div className="flex gap-2">
            {(["am", "pm"] as const).map((half) => (
              <button
                key={half}
                type="button"
                aria-pressed={pm === (half === "pm")}
                onClick={() => set((h % 12) + (half === "pm" ? 12 : 0), m)}
                className={`${cellBase} flex-1 px-4 ${pm === (half === "pm") ? cellOn : cellOff}`}
              >
                {half}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-1" role="group" aria-label="Hour">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => (
              <button
                key={hour}
                type="button"
                aria-pressed={has && hour === h12}
                onClick={() => set((hour % 12) + (pm ? 12 : 0), m)}
                className={`${cellBase} ${has && hour === h12 ? cellOn : cellOff}`}
              >
                {hour}
              </button>
            ))}
          </div>
          <div className={`grid gap-1 ${step === 15 ? "grid-cols-4" : "grid-cols-6"}`} role="group" aria-label="Minutes">
            {minutes.map((minute) => (
              <button
                key={minute}
                type="button"
                aria-pressed={has && minute === m}
                onClick={() => {
                  set(h, minute);
                  setOpen(false);
                }}
                className={`${cellBase} ${has && minute === m ? cellOn : cellOff}`}
              >
                :{pad(minute)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {allowEmpty ? (
              <button
                type="button"
                onClick={() => {
                  setTime("");
                  setOpen(false);
                }}
                className={`${cellBase} flex-1 px-4 ${cellOff}`}
              >
                No time
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className={`${cellBase} flex-1 bg-primary px-4 text-primary-ink`}>
              Done
            </button>
          </div>
        </Popover>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

/** − 30 + : a number without a keyboard. Blank is allowed when `allowEmpty` (shown as "—"). */
export function NumberStepper({
  name,
  value,
  defaultValue,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  disabled,
  allowEmpty = false,
  "aria-label": ariaLabel,
  className = "",
}: {
  name?: string;
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  const [n, setN, watchForm] = useValue<number | null>(value, defaultValue ?? (allowEmpty ? null : min), onChange);
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const down = () => (n === null ? undefined : allowEmpty && n - step < min ? setN(null) : setN(clamp(n - step)));
  const up = () => setN(n === null ? min : clamp(n + step));
  const round = "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30";
  return (
    <div role="group" aria-label={ariaLabel} className={`flex min-h-[var(--touch-target)] min-w-0 items-center gap-2 ${className}`}>
      {name ? <input ref={watchForm} type="hidden" name={name} value={n === null ? "" : String(n)} /> : null}
      {/* First in the page so that a <label> around the stepper points at
          this (which does nothing) and not at the − button; shown in the middle. */}
      <output className="tabular order-2 min-w-[3.5rem] text-center text-[1.5rem] font-bold whitespace-nowrap text-ink" aria-live="polite">
        {n === null ? "—" : n}
        {n !== null && unit ? <span className="ml-1 text-[1.25rem] text-ink-muted">{unit}</span> : null}
      </output>
      <button type="button" onClick={down} disabled={disabled || n === null || (!allowEmpty && n <= min)} className={`${round} order-1`} aria-label={`Less${ariaLabel ? ` ${ariaLabel}` : ""}`}>
        <Minus size="1.3rem" weight="bold" aria-hidden />
      </button>
      <button type="button" onClick={up} disabled={disabled || (n !== null && n >= max)} className={`${round} order-3`} aria-label={`More${ariaLabel ? ` ${ariaLabel}` : ""}`}>
        <Plus size="1.3rem" weight="bold" aria-hidden />
      </button>
    </div>
  );
}
