"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TimeField } from "@/components/touch-pickers";
import { Minus, Plus } from "@phosphor-icons/react";
import { ColourDot, Emoji, fieldLabelClass, primaryActionClass, segItemClass, segTrackClass, whoChipStyle } from "@/components/ui";
import { strong } from "@/lib/colours";
import { doseStatus, readingText } from "@/lib/health";
import { shortClockTime } from "@/lib/time-text";
import { logHealth } from "../actions";
import type { HealthLog, HealthMember, HealthTracker } from "../health-data";
import { trackerEmoji } from "./tracker-emoji";

/*
 * Logging from the Health page (Glance, 2026-11-15): "Log it" on a
 * medicine, or "Add an entry" in the header. Without a tracker it first
 * asks which one. Same rules as the Today panel's Health box: a dose
 * that's too soon or over the day's most only turns the button orange
 * ("Log it anyway"); it always logs. Almanac never suggests a dose.
 */

const WHEN = [
  { label: "Now", minutes: 0 },
  { label: "15 min ago", minutes: 15 },
  { label: "30 min ago", minutes: 30 },
];

export function HealthLogSheet({
  trackers,
  members,
  memberId,
  trackerId,
  choiceId,
  logs,
  now: nowIso,
  dayStart: dayStartIso,
  locale,
  timeZone,
  closeHref,
}: {
  /** The trackers this person has. */
  trackers: HealthTracker[];
  members: HealthMember[];
  memberId: string;
  trackerId: string | null;
  choiceId: string | null;
  /** Recent entries, newest first (for the dose rules). */
  logs: HealthLog[];
  now: string;
  dayStart: string;
  locale: string;
  timeZone: string;
  closeHref: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(trackers.some((t) => t.id === trackerId) ? trackerId : null);
  const tracker = trackers.find((t) => t.id === picked);
  const time = (d: Date | string) => shortClockTime(new Date(d), locale, timeZone);

  if (!tracker) {
    return (
      <div className="flex flex-col gap-3">
        <span className={fieldLabelClass}>What to log</span>
        <div className="grid grid-cols-2 gap-3">
          {trackers.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked(t.id)}
              className="flex min-h-[5.5rem] items-center gap-[0.7rem] rounded-[var(--radius)] bg-panel px-4 text-left text-[1.5rem] font-extrabold text-ink"
            >
              <Emoji emoji={trackerEmoji(t)} className="size-[2.25rem]" />
              <span className="min-w-0 truncate">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <LogForm
      key={tracker.id}
      tracker={tracker}
      people={members.filter((m) => tracker.member_ids.includes(m.id))}
      startWho={memberId}
      startChoice={choiceId}
      logs={logs}
      now={new Date(nowIso)}
      dayStart={new Date(dayStartIso)}
      time={time}
      onDone={() => {
        router.replace(closeHref, { scroll: false });
        router.refresh();
      }}
    />
  );
}

function LogForm({
  tracker,
  people,
  startWho,
  startChoice,
  logs,
  now,
  dayStart,
  time,
  onDone,
}: {
  tracker: HealthTracker;
  people: HealthMember[];
  startWho: string;
  startChoice: string | null;
  logs: HealthLog[];
  now: Date;
  dayStart: Date;
  time: (d: Date | string) => string;
  onDone: () => void;
}) {
  const [who, setWho] = useState(people.some((p) => p.id === startWho) ? startWho : (people[0]?.id ?? ""));
  const lastChoice = logs.find((l) => l.tracker_id === tracker.id && l.member_id === who)?.choice_id;
  const [choiceId, setChoiceId] = useState(tracker.choices.find((c) => c.id === startChoice)?.id ?? tracker.choices.find((c) => c.id === lastChoice)?.id ?? tracker.choices[0]?.id ?? "");
  const lastValue = logs.find((l) => l.tracker_id === tracker.id && l.member_id === who && l.value !== null)?.value ?? null;
  const [value, setValue] = useState<string>(readingText(lastValue) || (tracker.unit?.includes("F") ? "98.6" : "37"));
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
    onDone();
  };
  const nudge = (by: number) => setValue((v) => readingText((Number(v) || Number(lastValue) || 0) + by));
  const round = "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink";
  const input = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-[1.5rem] font-bold text-ink outline-none focus:border-ink";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-[0.7rem]">
        <Emoji emoji={trackerEmoji(tracker)} className="size-[2.75rem]" />
        <span className="min-w-0 flex-1 truncate text-[1.75rem] font-bold text-ink">{tracker.name}</span>
      </div>

      {people.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className={fieldLabelClass}>Who</span>
          <div role="group" aria-label="Who" className="flex flex-wrap gap-2">
            {people.map((m) => {
              const chip = whoChipStyle(m.colour, who === m.id);
              return (
                <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => setWho(m.id)} className={chip.className} style={chip.style}>
                  <ColourDot colour={m.colour} />
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {tracker.kind === "medicine" ? (
        <div className="flex flex-col gap-2">
          <span className={fieldLabelClass}>Which</span>
          <div role="group" aria-label="Which" className="grid grid-cols-2 gap-2">
            {tracker.choices.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={choiceId === c.id}
                onClick={() => setChoiceId(c.id)}
                className={`flex min-h-[4.5rem] items-center gap-[0.6rem] rounded-[var(--radius)] border-2 px-3 text-left ${choiceId === c.id ? "border-ink bg-board" : "border-transparent bg-panel"}`}
              >
                <Emoji emoji={c.icon || "💊"} className="size-[2.25rem]" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[1.35rem] font-extrabold text-ink">{c.name}</span>
                  {c.amounts[who] ? <span className="truncate text-[1.15rem] font-bold text-ink-muted">{c.amounts[who]}</span> : null}
                </span>
              </button>
            ))}
          </div>
          {statusText ? (
            <p
              role="status"
              className="rounded-[var(--radius)] px-4 py-3 text-[1.25rem] font-bold"
              style={
                warn
                  ? {
                      background: "var(--color-alert-soft)",
                      color: "var(--color-now-on-tint)",
                    }
                  : {
                      background: "var(--color-rail)",
                      color: "var(--color-ink-soft)",
                    }
              }
            >
              {statusText}
            </p>
          ) : null}
        </div>
      ) : tracker.kind === "number" ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => nudge(-0.1)} aria-label="Lower" className={round}>
            <Minus size="1.5rem" weight="bold" aria-hidden />
          </button>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label={tracker.name} className={`${input} w-40 text-center text-[2rem]!`} />
          <span className="text-[1.5rem] font-bold text-ink-muted">{tracker.unit}</span>
          <button type="button" onClick={() => nudge(0.1)} aria-label="Higher" className={round}>
            <Plus size="1.5rem" weight="bold" aria-hidden />
          </button>
        </div>
      ) : (
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label={tracker.name} placeholder="A few words" className={`${input} placeholder:text-ink-muted`} />
      )}

      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>When</span>
        <div role="group" aria-label="When" className={segTrackClass}>
          {WHEN.map((w) => (
            <button
              key={w.label}
              type="button"
              aria-pressed={!picking && minutesAgo === w.minutes}
              onClick={() => {
                setPicking(false);
                setMinutesAgo(w.minutes);
              }}
              className={`${segItemClass(!picking && minutesAgo === w.minutes)} min-w-0! flex-1`}
            >
              {w.label}
            </button>
          ))}
          {picking ? (
            <TimeField value={at} onChange={setAt} step={5} defaultOpen aria-label="Time" className="flex-1 border-ink! px-2! text-lg!" />
          ) : (
            <button type="button" onClick={() => setPicking(true)} className={`${segItemClass(false)} min-w-0! flex-1`}>
              Pick a time
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[1.25rem] font-bold text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={log}
        disabled={saving || !who || (tracker.kind === "medicine" && !choice)}
        className={`${primaryActionClass} self-start disabled:opacity-60`}
        style={warn ? { background: strong("orange"), color: "white" } : undefined}
      >
        {saving ? "Logging…" : warn ? "Log it anyway" : "Log it"}
      </button>
    </div>
  );
}
