"use client";

import { useState, useTransition } from "react";
import { ArrowsClockwise, MapPin, NotePencil, Trash } from "@phosphor-icons/react";
import { EmojiPicker } from "@/components/emoji-picker";
import { LeaveDialog, useUnsavedChanges } from "@/components/unsaved-changes";
import { Switch } from "@/components/ui";
import { hand, soft, strong } from "@/lib/colours";
import type { RepeatEnd, RepeatFrequency } from "@/lib/recurrence";
import { dayOfWeek } from "@/lib/calendar-layout";
import { addDays, type LocalDate } from "@/lib/time";
import type { Member } from "../calendar/types";
import { deleteEvent, saveEvent, skipEventDate } from "./actions";
import { FieldLabel, PickField, chipClass, dateText, phoneInputClass, phonePrimaryClass, phoneSecondaryClass, timeText } from "./phone-ui";

/** Everything on the event card, as the phone keeps it until Save. */
export type EventDraft = {
  title: string;
  icon: string;
  memberIds: string[];
  allDay: boolean;
  startDate: LocalDate;
  startTime: string;
  endDate: LocalDate;
  endTime: string;
  frequency: RepeatFrequency;
  interval: number;
  weekdays: number[];
  end: RepeatEnd;
  until: string | null;
  count: number | null;
  location: string;
  notes: string;
  /** Kept as they were (set on the wall screen). */
  visibility: string;
  dayKind: string;
};

const REPEATS: { value: RepeatFrequency; label: string }[] = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The event's length in minutes, from its start to its end. */
function lengthOf(d: EventDraft): number {
  return daysBetween(d.startDate, d.endDate) * 1440 + toMinutes(d.endTime || d.startTime) - toMinutes(d.startTime);
}

function same(a: EventDraft, b: EventDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function EventForm({
  members,
  initial,
  eventId,
  occurrence,
  locale,
  back,
}: {
  members: Member[];
  initial: EventDraft;
  /** Saving an existing event (every date, for a repeating one). */
  eventId?: string;
  /** The date tapped, for a repeating event ("Skip this date"). */
  occurrence?: LocalDate;
  locale: string;
  /** Where to go after saving or deleting. */
  back: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "skip" | null>(null);
  const [pending, start] = useTransition();
  const dirty = !same(draft, saved);
  const unsaved = useUnsavedChanges(dirty, () => setDraft(saved));
  const set = (change: Partial<EventDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
  };

  // Moving the start moves the end with it, so the length stays the same.
  const setStartDate = (startDate: LocalDate) => {
    if (!startDate) return;
    set({ startDate, endDate: addDays(startDate, Math.max(0, daysBetween(draft.startDate, draft.endDate))) });
  };
  const setStartTime = (startTime: string) => {
    if (!startTime) return;
    const length = Math.max(0, lengthOf(draft));
    const end = toMinutes(startTime) + length;
    set({ startTime, endTime: fromMinutes(end), endDate: addDays(draft.startDate, Math.floor(end / 1440)) });
  };

  const save = (then?: string | null) => {
    setError(null);
    const f = new FormData();
    if (eventId) f.set("id", eventId);
    f.set("title", draft.title);
    f.set("icon", draft.icon);
    for (const id of draft.memberIds) f.append("memberIds", id);
    if (draft.allDay) f.set("allDay", "on");
    f.set("startDate", draft.startDate);
    f.set("endDate", draft.endDate < draft.startDate ? draft.startDate : draft.endDate);
    f.set("startTime", draft.allDay ? "" : draft.startTime);
    f.set("endTime", draft.allDay ? "" : draft.endTime);
    f.set("repeatFrequency", draft.frequency);
    f.set("repeatInterval", String(draft.interval));
    f.set("repeatEnd", draft.end);
    f.set("repeatUntil", draft.until ?? "");
    f.set("repeatCount", draft.count ? String(draft.count) : "");
    for (const d of draft.weekdays) f.append("repeatWeekdays", String(d));
    f.set("location", draft.location);
    f.set("notes", draft.notes);
    f.set("visibility", draft.visibility);
    f.set("dayKind", draft.dayKind);
    start(async () => {
      const result = await saveEvent(f);
      if (!result.ok) {
        setError(result.error);
        unsaved.stay();
        return;
      }
      if (eventId) {
        setSaved(draft);
        unsaved.saved(then ?? back);
      } else {
        // Back to the calendar, on the day it was added to (a fresh card for next time).
        setSaved(initial);
        setDraft(initial);
        unsaved.saved(then ?? `/m?date=${draft.startDate}`);
      }
    });
  };

  const remove = () =>
    start(async () => {
      const result = confirm === "skip" && occurrence ? await skipEventDate(eventId!, occurrence, draft.title) : await deleteEvent(eventId!, saved.title);
      if (!result.ok) {
        setError(result.error);
        setConfirm(null);
        return;
      }
      setDraft(saved);
      unsaved.saved(back);
    });

  const repeating = saved.frequency !== "none";
  const weekdayName = (d: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 15 + d)));

  return (
    <div className="flex flex-col gap-3 px-3">
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-board px-4 py-4 shadow-raised">
        {/* What and who */}
        <div className="flex items-end gap-2.5">
          <EmojiPicker
            initial={draft.icon}
            key={draft.icon || "guess"}
            nameText={draft.title}
            fieldName=""
            fullScreen
            bare
            onChange={(icon) => set({ icon })}
            className="size-12"
          />
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <FieldLabel>Event</FieldLabel>
            <input
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="What's happening?"
              autoFocus={!eventId}
              enterKeyHint="done"
              className={`${phoneInputClass} font-hand text-[1.3rem]`}
              style={{ color: hand(members.find((m) => m.id === draft.memberIds[0])?.colour) }}
            />
          </label>
        </div>

        {members.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Who</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const on = draft.memberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ memberIds: on ? draft.memberIds.filter((id) => id !== m.id) : [...draft.memberIds, m.id] })}
                    className={`inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 px-3.5 text-[1.05rem] font-bold ${on ? "" : "border-frame bg-board text-ink"}`}
                    style={on ? { borderColor: strong(m.colour), background: soft(m.colour), color: hand(m.colour) } : undefined}
                  >
                    <span aria-hidden className="size-3 rounded-full" style={{ background: strong(m.colour) }} />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* When */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-board px-4 py-3 shadow-raised">
        <Switch on={draft.allDay} onChange={(allDay) => set({ allDay })}>
          <span className="text-[1.1rem]">All day</span>
        </Switch>
        <div className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-2">
          <FieldLabel>Starts</FieldLabel>
          <PickField type="date" label="Start date" value={draft.startDate} text={dateText(draft.startDate, locale)} onChange={setStartDate} />
          {draft.allDay ? <span /> : <PickField type="time" label="Start time" value={draft.startTime} text={timeText(draft.startTime, locale)} onChange={setStartTime} narrow />}
          <FieldLabel>Ends</FieldLabel>
          <PickField type="date" label="End date" value={draft.endDate} min={draft.startDate} text={dateText(draft.endDate, locale)} onChange={(endDate) => set({ endDate })} />
          {draft.allDay ? <span /> : <PickField type="time" label="End time" value={draft.endTime} text={timeText(draft.endTime, locale)} onChange={(endTime) => set({ endTime })} narrow />}
        </div>
      </div>

      {/* Repeats */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-board px-4 py-3 shadow-raised">
        <span className="flex items-center gap-1.5">
          <ArrowsClockwise size="1.1rem" weight="bold" className="text-ink-muted" aria-hidden />
          <FieldLabel>Repeats</FieldLabel>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {REPEATS.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={draft.frequency === r.value}
              onClick={() =>
                set({
                  frequency: r.value,
                  interval: r.value === saved.frequency ? saved.interval : 1,
                  weekdays: r.value === "weekly" ? (draft.weekdays.length ? draft.weekdays : [dayOfWeek(draft.startDate)]) : [],
                })
              }
              className={`${chipClass(draft.frequency === r.value)} px-3.5`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {draft.frequency === "weekly" ? (
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="On">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
              const on = draft.weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ weekdays: on ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d].sort() })}
                  className={`${chipClass(on)} px-0`}
                >
                  {weekdayName(d)}
                </button>
              );
            })}
          </div>
        ) : null}
        {eventId && repeating ? <p className="text-[0.95rem] font-semibold text-ink-muted">Changes here change every date.</p> : null}
      </div>

      {/* Where and notes */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-board px-4 py-3 shadow-raised">
        <label className="flex items-center gap-2">
          <MapPin size="1.3rem" weight="bold" className="shrink-0 text-ink-muted" aria-hidden />
          <input value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Where" aria-label="Where" className={phoneInputClass} />
        </label>
        <label className="flex items-start gap-2">
          <NotePencil size="1.3rem" weight="bold" className="mt-3 shrink-0 text-ink-muted" aria-hidden />
          <textarea
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Notes"
            aria-label="Notes"
            rows={2}
            className={`${phoneInputClass} min-h-20 py-2.5 font-semibold`}
          />
        </label>
      </div>

      {/* The one Save, at the bottom where a thumb reaches it (on an event, once something changes). */}
      <div hidden={Boolean(eventId) && !dirty && !error} className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 -mx-3 flex flex-col gap-2 bg-rail/95 px-3 py-2">
      {error ? (
          <p role="alert" className="rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-4 py-3 text-[1.05rem] font-bold text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
        {dirty ? (
          <button type="button" onClick={() => setDraft(saved)} disabled={pending} className={phoneSecondaryClass}>
            Undo
          </button>
        ) : null}
        <button type="button" onClick={() => save()} disabled={pending || (!dirty && Boolean(eventId))} className={`${phonePrimaryClass} flex-1`}>
          {pending ? "Saving…" : eventId ? (dirty ? "Save" : "Saved") : "Add event"}
        </button>
        </div>
      </div>

      {eventId ? (
        <div className="flex flex-col gap-2 pt-2 pb-4">
          {confirm ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-board p-4 shadow-raised">
              <p className="text-[1.1rem] font-bold text-ink">{confirm === "skip" ? "Skip this date? The other dates stay." : repeating ? "Delete every date of this event?" : "Delete this event?"}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirm(null)} className={`${phoneSecondaryClass} flex-1`}>
                  Keep it
                </button>
                <button type="button" onClick={remove} disabled={pending} className={`${phonePrimaryClass} flex-1 bg-danger`}>
                  {confirm === "skip" ? "Skip" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {repeating && occurrence ? (
                <button type="button" onClick={() => setConfirm("skip")} className={`${phoneSecondaryClass} flex-1`}>
                  Skip this date
                </button>
              ) : null}
              <button type="button" onClick={() => setConfirm("delete")} className={`${phoneSecondaryClass} flex-1 text-danger`}>
                <Trash size="1.2rem" weight="bold" aria-hidden />
                Delete
              </button>
            </div>
          )}
        </div>
      ) : null}

      {unsaved.leaving ? (
        <LeaveDialog what="this event" saving={pending} onSave={() => save(unsaved.leaving)} onStay={unsaved.stay} onLeave={unsaved.leaveWithoutSaving} />
      ) : null}
    </div>
  );
}
