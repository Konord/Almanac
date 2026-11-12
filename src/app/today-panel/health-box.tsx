"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "@phosphor-icons/react";
import { Pager } from "@/components/pager";
import { Avatar, Emoji } from "@/components/ui";
import { soft, strong } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import { agoText, doseStatus, readingText } from "@/lib/health";
import { shortClockTime } from "@/lib/time-text";
import { logHealth } from "../habits/actions";
import type { HealthLog, HealthMember, HealthTracker } from "../habits/health-data";

/*
 * The Today panel's Health box (2026-11-12). It shows each tracker as a
 * tile: medicine with each person's last dose and when the next is
 * allowed, readings and notes with the latest one. Tapping a tile opens a
 * small form to log, starting on the last person and medicine used.
 *
 * A dose that's too soon or over the day's most only turns the button
 * orange ("Log it anyway"); it always logs. Almanac never suggests a dose.
 */

/** Person rows that fit on one page of tiles. */
const ROWS_PER_PAGE = 9;
const WHEN = [
  { label: "Now", minutes: 0 },
  { label: "15 min ago", minutes: 15 },
  { label: "30 min ago", minutes: 30 },
];

const pictureOf = (t: Pick<HealthTracker, "icon" | "kind" | "name">) => t.icon || eventEmoji(null, t.name, t.kind === "medicine" ? "💊" : t.kind === "number" ? "🌡" : "🤒");
const unitText = (unit: string | null) => (unit ? ` ${unit}` : "");

export function HealthBox({
  trackers,
  members,
  logs,
  now: nowIso,
  dayStart: dayStartIso,
  locale,
  timeZone,
}: {
  trackers: HealthTracker[];
  members: HealthMember[];
  /** Recent entries (the last day or two), newest first. */
  logs: HealthLog[];
  now: string;
  dayStart: string;
  locale: string;
  timeZone: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const now = new Date(nowIso);
  const dayStart = new Date(dayStartIso);
  const time = (d: Date | string) => shortClockTime(new Date(d), locale, timeZone);
  const people = (t: HealthTracker) => members.filter((m) => t.member_ids.includes(m.id));

  const tracker = trackers.find((t) => t.id === open);
  if (tracker) {
    return <LogForm key={tracker.id} tracker={tracker} people={people(tracker)} logs={logs} now={now} dayStart={dayStart} time={time} onClose={() => setOpen(null)} />;
  }

  // Tiles, a page at a time, so the box never scrolls.
  const pages: HealthTracker[][] = [];
  let rows = 0;
  for (const t of trackers) {
    const n = 1 + people(t).length;
    if (pages.length === 0 || rows + n > ROWS_PER_PAGE) {
      pages.push([]);
      rows = 0;
    }
    pages[pages.length - 1].push(t);
    rows += n;
  }
  const shown = Math.min(page, Math.max(0, pages.length - 1));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 py-1">
      {(pages[shown] ?? []).map((t, i) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setOpen(t.id)}
          className={`flex flex-col gap-1 rounded-2xl px-3 py-2 text-left ${i === 0 ? "border-2 border-frame" : "bg-rail"}`}
        >
          <span className="flex items-center gap-2.5">
            <Emoji emoji={pictureOf(t)} className="size-9" />
            <span className="min-w-0 flex-1 truncate text-xl font-extrabold text-ink">{t.name}</span>
            <span className="flex min-h-10 items-center rounded-full bg-ink px-4 text-base font-bold text-board">+ Log</span>
          </span>
          {people(t).map((m) => {
            const mine = logs.filter((l) => l.tracker_id === t.id && l.member_id === m.id && new Date(l.logged_at) <= now);
            const latest = mine[0];
            let what = "";
            let right: { text: string; colour: string } | null = null;
            if (t.kind === "medicine") {
              if (latest) what = `${latest.choice_name ?? ""} · ${agoText(new Date(latest.logged_at), now)} ago`;
              const choice = t.choices.find((c) => c.id === latest?.choice_id);
              if (choice) {
                const s = doseStatus(choice, mine.filter((l) => l.choice_id === choice.id).map((l) => new Date(l.logged_at)), now, dayStart);
                right = s.next ? { text: time(s.next), colour: strong("orange") } : { text: "OK now", colour: "var(--color-success)" };
              }
            } else if (latest) {
              what = t.kind === "number" ? `${readingText(latest.value)}${unitText(t.unit)} at ${time(latest.logged_at)}` : `${latest.note ?? ""} · ${time(latest.logged_at)}`;
            }
            return (
              <span key={m.id} className="flex items-center gap-2 text-base">
                <span className="size-3 shrink-0 rounded-full" style={{ background: strong(m.colour) }} aria-hidden />
                <b className="w-16 shrink-0 truncate text-ink">{m.name}</b>
                <span className="min-w-0 flex-1 truncate text-ink-soft">{what}</span>
                {right ? (
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: right.colour }}>
                    {right.text}
                  </span>
                ) : null}
              </span>
            );
          })}
        </button>
      ))}
      <Pager page={shown} pages={pages.length} onPage={setPage} className="mt-auto justify-end" />
    </div>
  );
}

function LogForm({
  tracker,
  people,
  logs,
  now,
  dayStart,
  time,
  onClose,
}: {
  tracker: HealthTracker;
  people: HealthMember[];
  logs: HealthLog[];
  now: Date;
  dayStart: Date;
  time: (d: Date | string) => string;
  onClose: () => void;
}) {
  const router = useRouter();
  // Start on the last person and medicine used.
  const last = logs.find((l) => l.tracker_id === tracker.id && people.some((p) => p.id === l.member_id));
  const [who, setWho] = useState(last?.member_id ?? people[0]?.id ?? "");
  const [choiceId, setChoiceId] = useState(last?.choice_id && tracker.choices.some((c) => c.id === last.choice_id) ? last.choice_id : (tracker.choices[0]?.id ?? ""));
  const lastValue = logs.find((l) => l.tracker_id === tracker.id && l.member_id === who && l.value !== null)?.value;
  const [value, setValue] = useState<string>(readingText(last?.value ?? null) || (tracker.unit?.includes("F") ? "98.6" : "37"));
  const [note, setNote] = useState("");
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choice = tracker.choices.find((c) => c.id === choiceId);
  const doses = logs.filter((l) => l.member_id === who && l.choice_id === choiceId).map((l) => new Date(l.logged_at));
  const status = choice ? doseStatus(choice, doses, now, dayStart) : null;
  const warn = Boolean(status && (status.tooSoon || status.atMost));
  const statusText = status
    ? [status.last ? `Last ${time(status.last)}` : null, status.next ? `next ${time(status.next)}` : null, `${status.today}${choice?.max_per_day ? ` of ${choice.max_per_day}` : ""} today`]
        .filter(Boolean)
        .join(" · ")
    : null;

  const log = async () => {
    setSaving(true);
    setError(null);
    const result = await logHealth({
      trackerId: tracker.id,
      memberId: who,
      choiceId: choice?.id ?? null,
      amount: choice?.amounts[who] ?? null,
      value: tracker.kind === "number" ? Number(value) : null,
      note: tracker.kind === "note" ? note : null,
      minutesAgo: picking ? 0 : minutesAgo,
      at: picking && at ? at : undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  };
  const nudge = (by: number) => setValue((v) => readingText((Number(v) || Number(lastValue) || 0) + by));
  const chip = (on: boolean) => `flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 px-2 text-base font-bold ${on ? "border-ink bg-board text-ink" : "border-transparent bg-rail text-ink"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 py-1">
      <div className="flex items-center gap-2.5">
        <Emoji emoji={pictureOf(tracker)} className="size-9" />
        <h4 className="min-w-0 flex-1 truncate text-xl font-extrabold text-ink">{tracker.name}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full bg-rail text-ink">
          <X size="1.25rem" weight="bold" aria-hidden />
        </button>
      </div>

      <div role="group" aria-label="Who" className="flex gap-2">
        {people.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={who === m.id}
            onClick={() => setWho(m.id)}
            className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border-2 px-2 text-base font-bold text-ink"
            style={who === m.id ? { borderColor: strong(m.colour), background: soft(m.colour) } : { borderColor: "transparent", background: "var(--color-rail)" }}
          >
            <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" />
            <span className="truncate">{m.name}</span>
          </button>
        ))}
      </div>

      {tracker.kind === "medicine" ? (
        <>
          <div role="group" aria-label="What" className="flex gap-2">
            {tracker.choices.slice(0, 3).map((c) => (
              <button key={c.id} type="button" aria-pressed={choiceId === c.id} onClick={() => setChoiceId(c.id)} className={chip(choiceId === c.id)}>
                <Emoji emoji={c.icon || "💊"} className="size-7" />
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="truncate">{c.name}</span>
                  {c.amounts[who] ? <span className="text-sm font-semibold text-ink-muted">{c.amounts[who]}</span> : null}
                </span>
              </button>
            ))}
          </div>
          {statusText ? (
            <div
              role="status"
              className="rounded-xl px-3 py-2 text-base"
              style={warn ? { background: soft("orange"), color: "color-mix(in srgb, var(--color-person-orange) 65%, black)" } : { background: "var(--color-rail)", color: "var(--color-ink-soft)" }}
            >
              {statusText}
            </div>
          ) : null}
        </>
      ) : tracker.kind === "number" ? (
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => nudge(-0.1)} aria-label="Lower" className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink">
            <Minus size="1.5rem" weight="bold" aria-hidden />
          </button>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            aria-label={tracker.name}
            className="h-[var(--touch-target)] w-32 rounded-[var(--radius)] border-2 border-frame bg-board text-center text-3xl font-extrabold text-ink outline-none focus:border-accent"
          />
          <span className="text-2xl font-bold text-ink-muted">{tracker.unit}</span>
          <button type="button" onClick={() => nudge(0.1)} aria-label="Higher" className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink">
            <Plus size="1.5rem" weight="bold" aria-hidden />
          </button>
        </div>
      ) : (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          aria-label={tracker.name}
          className="h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-xl text-ink outline-none focus:border-accent"
        />
      )}

      <div role="group" aria-label="When" className="flex gap-1.5">
        {WHEN.map((w) => (
          <button
            key={w.label}
            type="button"
            aria-pressed={!picking && minutesAgo === w.minutes}
            onClick={() => {
              setPicking(false);
              setMinutesAgo(w.minutes);
            }}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-1 text-sm font-bold ${!picking && minutesAgo === w.minutes ? "bg-ink text-board" : "bg-rail text-ink"}`}
          >
            {w.label}
          </button>
        ))}
        {picking ? (
          <input type="time" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Time" className="min-h-11 flex-1 rounded-xl border-2 border-ink bg-board px-1 text-sm font-bold text-ink" />
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-rail px-1 text-sm font-bold text-ink">
            Pick…
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-base font-bold text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={log}
        disabled={saving || !who || (tracker.kind === "medicine" && !choice)}
        className="mt-auto flex min-h-[var(--touch-target)] items-center justify-center rounded-2xl text-xl font-extrabold text-white disabled:opacity-60"
        style={{ background: warn ? strong("orange") : "var(--color-ink)" }}
      >
        {saving ? "Logging…" : warn ? "Log it anyway" : "Log it"}
      </button>
    </div>
  );
}
