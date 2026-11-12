"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretLeft, Plus, Trash, X } from "@phosphor-icons/react";
import { EmojiPicker } from "@/components/emoji-picker";
import { Pager } from "@/components/pager";
import { Avatar, EmptyState, Emoji, ScreenHeader } from "@/components/ui";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { useFitRows } from "@/components/use-fit-rows";
import { soft, strong } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import { managerProblem, sameManagerDraft, type DraftChoice, type DraftHabit, type DraftTracker, type HabitManagerDraft } from "@/lib/habit-manager";
import { waitText } from "@/lib/health";
import { newId } from "@/lib/ids";
import { saveHabitManager } from "./actions";

/*
 * The Habit Manager's screen. Habits tab: the habits made here on the left
 * (and the ones tracked from routines, which are set up in Routines), the
 * picked one on the right. Health tab: the trackers as tiles on the left,
 * the picked one on the right. Everything waits for the one Save.
 */

export type ManagerMember = { id: string; name: string; colour: string; icon: string | null; role: string };
export type FromRoutine = { key: string; name: string; icon: string | null; people: string[]; routines: number };
type Tab = "habits" | "health";

const FREQUENCIES: { value: DraftHabit["frequency"]; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "days", label: "Some days" },
  { value: "week", label: "Times a week" },
  { value: "month", label: "Times a month" },
];
const KINDS: { value: DraftTracker["kind"]; label: string; icon: string }[] = [
  { value: "medicine", label: "Medicine", icon: "💊" },
  { value: "number", label: "A number", icon: "🌡" },
  { value: "note", label: "A few words", icon: "🤒" },
];
/** Monday first, as 0 = Sunday weekday numbers. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const CHOICES_PER_PAGE = 4;
const TILES_PER_PAGE = 5;

export const habitPicture = (icon: string | null, name: string) => eventEmoji(icon, name, "✅");
export const trackerPicture = (t: { icon: string | null; kind: string; name: string }) => t.icon || eventEmoji(null, t.name, KINDS.find((k) => k.value === t.kind)?.icon ?? "💊");

export function HabitManager({
  initial,
  members,
  fromRoutines,
  today,
  locale,
  celsius,
  startTab,
}: {
  initial: HabitManagerDraft;
  members: ManagerMember[];
  fromRoutines: FromRoutine[];
  today: string;
  locale: string;
  celsius: boolean;
  startTab: Tab;
}) {
  const [draft, setDraft] = useState(initial);
  const [tab, setTab] = useState<Tab>(startTab);
  const [habitId, setHabitId] = useState<string | null>(initial.habits[0]?.id ?? null);
  const [trackerId, setTrackerId] = useState<string | null>(initial.trackers[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameManagerDraft(draft, initial);
  const guard = useUnsavedChanges(dirty, () => setDraft(initial));

  const update = (change: (d: HabitManagerDraft) => HabitManagerDraft) => {
    setError(null);
    setDraft(change);
  };
  const save = async (then?: string | null) => {
    const problem = managerProblem(draft);
    if (problem) {
      setError(problem);
      guard.stay();
      return;
    }
    setSaving(true);
    const result = await saveHabitManager(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      return;
    }
    guard.saved(then);
  };
  const undo = () => {
    setDraft(initial);
    setError(null);
    if (habitId && !initial.habits.some((h) => h.id === habitId)) setHabitId(initial.habits[0]?.id ?? null);
    if (trackerId && !initial.trackers.some((t) => t.id === trackerId)) setTrackerId(initial.trackers[0]?.id ?? null);
  };

  const weekdayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + d)));

  return (
    <>
      <ScreenHeader title="Habit Manager">
        <Link href="/habits" aria-label="Back to Habits" className="-order-1 flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink">
          <CaretLeft size="1.75rem" weight="bold" aria-hidden />
        </Link>
        <div role="tablist" aria-label="Habits or health" className="flex gap-1 rounded-2xl bg-panel p-1.25">
          {(["habits", "health"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex min-h-[var(--touch-target)] min-w-28 items-center justify-center rounded-xl px-5 text-lg font-bold ${tab === t ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
            >
              {t === "habits" ? "Habits" : "Health"}
            </button>
          ))}
        </div>
        <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
      </ScreenHeader>

      {tab === "habits" ? (
        <HabitsTab draft={draft} update={update} members={members} fromRoutines={fromRoutines} selected={habitId} select={setHabitId} today={today} weekdayName={weekdayName} />
      ) : (
        <HealthTab draft={draft} update={update} members={members} selected={trackerId} select={setTrackerId} celsius={celsius} />
      )}

      {guard.leaving ? <LeaveDialog what="some habits" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Habits tab
// ---------------------------------------------------------------------------

function HabitsTab({
  draft,
  update,
  members,
  fromRoutines,
  selected,
  select,
  today,
  weekdayName,
}: {
  draft: HabitManagerDraft;
  update: (change: (d: HabitManagerDraft) => HabitManagerDraft) => void;
  members: ManagerMember[];
  fromRoutines: FromRoutine[];
  selected: string | null;
  select: (id: string | null) => void;
  today: string;
  weekdayName: (d: number) => string;
}) {
  const [listRef, perPage] = useFitRows<HTMLUListElement>(6);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(draft.habits.length / perPage));
  const shownPage = Math.min(page, pages - 1);
  const habit = draft.habits.find((h) => h.id === selected) ?? null;
  const routinesShown = fromRoutines.slice(0, 3);

  const set = (change: Partial<DraftHabit>) => update((d) => ({ ...d, habits: d.habits.map((h) => (h.id === selected ? { ...h, ...change } : h)) }));
  const add = () => {
    const id = newId();
    const h: DraftHabit = { id, name: "New habit", icon: null, measure: "check", goal: 1, unit: "", step: 1, frequency: "daily", weekdays: [], times: 1, since: today, member_ids: members.slice(0, 1).map((m) => m.id) };
    update((d) => ({ ...d, habits: [...d.habits, h] }));
    select(id);
    setPage(Math.floor(draft.habits.length / perPage));
  };
  const remove = () => {
    if (!habit) return;
    const rest = draft.habits.filter((h) => h.id !== habit.id);
    update((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== habit.id) }));
    select(rest[0]?.id ?? null);
  };

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <nav aria-label="Habits" className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-card)] border border-frame bg-board p-3.5 lg:min-h-0">
        <div className="flex min-h-12 items-center gap-2 px-2">
          <span className="flex-1 text-base font-bold text-ink-muted">Made here</span>
          <Pager page={shownPage} pages={pages} onPage={setPage} />
        </div>
        <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
          {draft.habits.slice(shownPage * perPage, (shownPage + 1) * perPage).map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => select(h.id)}
                aria-pressed={h.id === selected}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3 text-left ${h.id === selected ? "border-success bg-[color-mix(in_srgb,var(--color-success)_10%,white)]" : "border-transparent hover:bg-rail"}`}
              >
                <Emoji emoji={habitPicture(h.icon, h.name)} className="size-9" />
                <span className="min-w-0 flex-1 truncate text-xl font-bold text-ink">{h.name || "…"}</span>
                <span className="flex shrink-0 gap-1">
                  {h.member_ids.map((id) => {
                    const m = members.find((x) => x.id === id);
                    return m ? <span key={id} className="size-3 rounded-full" style={{ background: strong(m.colour) }} aria-hidden /> : null;
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={add} className="flex min-h-14 shrink-0 items-center gap-2 rounded-2xl px-3 text-lg font-extrabold text-accent hover:bg-rail">
          <Plus size="1.25rem" weight="bold" aria-hidden />
          New habit
        </button>
        {fromRoutines.length ? (
          <div className="mt-1 flex shrink-0 flex-col gap-1 border-t border-frame pt-2">
            <span className="px-2 text-base font-bold text-ink-muted">From routines</span>
            {routinesShown.map((r) => (
              <Link key={r.key} href="/routines" className="flex min-h-14 items-center gap-3 rounded-2xl px-3 hover:bg-rail">
                <Emoji emoji={habitPicture(r.icon, r.name)} className="size-8" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-lg font-bold text-ink">{r.name}</span>
                  <span className="truncate text-sm text-ink-muted">
                    {r.people.join(", ")}
                    {r.routines > 1 ? ` · ${r.routines} routines` : r.routines === 0 ? " · whole routine" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-base font-bold text-accent">Routines ›</span>
              </Link>
            ))}
            {fromRoutines.length > routinesShown.length ? (
              <Link href="/routines" className="flex min-h-11 items-center px-3 text-base font-bold text-accent">
                + {fromRoutines.length - routinesShown.length} more
              </Link>
            ) : null}
          </div>
        ) : null}
      </nav>

      <section aria-label={habit?.name ?? "Habit"} className="flex min-w-0 flex-col gap-5 rounded-[var(--radius-card)] border border-frame bg-board px-6 py-5 lg:min-h-0">
        {!habit ? (
          <EmptyState emoji="✅" title="Make a habit" />
        ) : (
          <>
            <div className="flex items-end gap-3">
              <EmojiPicker key={habit.id} initial={habit.icon ?? ""} fieldName="" nameText={habit.name} onChange={(icon) => set({ icon: icon || null })} label={`Picture for ${habit.name}`} fallback="✅" fullScreen />
              <Labelled label="Name" grow>
                <input value={habit.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className={`${field} w-full text-xl font-bold`} />
              </Labelled>
            </div>

            <Labelled label="Who">
              <People members={members} chosen={habit.member_ids} onToggle={(id) => set({ member_ids: toggle(habit.member_ids, id) })} />
            </Labelled>

            <div className="flex flex-wrap items-end gap-7">
              <Seg
                label="Each time"
                value={habit.measure}
                options={[
                  { value: "check", label: "Check it" },
                  { value: "count", label: "Count it" },
                ]}
                onChange={(measure) => set({ measure, goal: measure === "count" ? Math.max(habit.goal, 2) : 1 })}
              />
              {habit.measure === "count" ? (
                <>
                  <Labelled label="Goal">
                    <span className="flex items-center gap-2.5">
                      <Stepper value={habit.goal} min={1} max={10000} step={habit.goal >= 50 ? 5 : 1} onChange={(goal) => set({ goal })} label="goal" />
                      <input value={habit.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} aria-label="Unit" className={`${field} w-36`} />
                    </span>
                  </Labelled>
                  <Labelled label="Each tap">
                    <Stepper value={habit.step} min={1} max={10000} onChange={(step) => set({ step })} label="step" />
                  </Labelled>
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-2.5">
              <Seg label="How often" value={habit.frequency} options={FREQUENCIES} onChange={(frequency) => set({ frequency, weekdays: frequency === "days" && habit.weekdays.length === 0 ? [1, 2, 3, 4, 5] : habit.weekdays })} />
              {habit.frequency === "days" ? (
                <div className="flex gap-2">
                  {WEEK.map((d) => {
                    const on = habit.weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ weekdays: toggle(habit.weekdays, d) })}
                        className={`size-[var(--touch-target)] rounded-full text-lg font-extrabold ${on ? "bg-success text-white" : "bg-rail text-ink-soft"}`}
                      >
                        {weekdayName(d)}
                      </button>
                    );
                  })}
                </div>
              ) : habit.frequency === "week" || habit.frequency === "month" ? (
                <span className="flex items-center gap-3 text-lg font-bold text-ink-soft">
                  <Stepper value={habit.times} min={1} max={habit.frequency === "week" ? 7 : 31} onChange={(times) => set({ times })} label="times" />
                  {habit.frequency === "week" ? "a week" : "a month"}
                </span>
              ) : null}
            </div>

            <div className="mt-auto flex border-t border-frame pt-3">
              <button type="button" onClick={remove} className="ml-auto flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl px-4 text-base font-bold text-danger hover:bg-rail">
                <Trash size="1.25rem" weight="bold" aria-hidden />
                Delete habit
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health tab
// ---------------------------------------------------------------------------

function HealthTab({
  draft,
  update,
  members,
  selected,
  select,
  celsius,
}: {
  draft: HabitManagerDraft;
  update: (change: (d: HabitManagerDraft) => HabitManagerDraft) => void;
  members: ManagerMember[];
  selected: string | null;
  select: (id: string | null) => void;
  celsius: boolean;
}) {
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [choicePage, setChoicePage] = useState(0);
  const pages = Math.max(1, Math.ceil((draft.trackers.length + 1) / (TILES_PER_PAGE + 1)));
  const shownPage = Math.min(page, pages - 1);
  const tiles = draft.trackers.slice(shownPage * TILES_PER_PAGE, (shownPage + 1) * TILES_PER_PAGE);
  const tracker = draft.trackers.find((t) => t.id === selected) ?? null;

  const set = (change: Partial<DraftTracker>) => update((d) => ({ ...d, trackers: d.trackers.map((t) => (t.id === selected ? { ...t, ...change } : t)) }));
  const setChoice = (id: string, change: Partial<DraftChoice>) => set({ choices: tracker!.choices.map((c) => (c.id === id ? { ...c, ...change } : c)) });
  const add = (kind: DraftTracker["kind"]) => {
    const id = newId();
    // Health trackers are mostly for the kids.
    const kids = members.filter((m) => m.role === "child");
    const t: DraftTracker = {
      id,
      name: kind === "medicine" ? "Medicine" : kind === "number" ? "Temperature" : "Symptoms",
      icon: KINDS.find((k) => k.value === kind)!.icon,
      kind,
      unit: kind === "number" ? (celsius ? "°C" : "°F") : "",
      alert_above: kind === "number" ? (celsius ? 38 : 100.4) : null,
      member_ids: (kids.length ? kids : members).map((m) => m.id),
      choices: [],
    };
    update((d) => ({ ...d, trackers: [...d.trackers, t] }));
    select(id);
    setAdding(false);
    setPage(Math.floor(draft.trackers.length / TILES_PER_PAGE));
  };
  const remove = () => {
    if (!tracker) return;
    const rest = draft.trackers.filter((t) => t.id !== tracker.id);
    update((d) => ({ ...d, trackers: rest }));
    select(rest[0]?.id ?? null);
  };
  const addChoice = () => {
    if (!tracker) return;
    set({ choices: [...tracker.choices, { id: newId(), name: "", icon: "💊", wait_minutes: 240, max_per_day: null, amounts: {} }] });
    setChoicePage(Math.floor(tracker.choices.length / CHOICES_PER_PAGE));
  };

  const people = tracker ? members.filter((m) => tracker.member_ids.includes(m.id)) : [];
  const choicePages = tracker ? Math.max(1, Math.ceil(tracker.choices.length / CHOICES_PER_PAGE)) : 1;
  const shownChoicePage = Math.min(choicePage, choicePages - 1);

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <section aria-label="Trackers" className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-frame bg-board p-4 lg:min-h-0">
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-3">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                select(t.id);
                setChoicePage(0);
              }}
              aria-pressed={t.id === selected}
              className={`flex min-h-0 flex-col justify-center gap-1 rounded-2xl border-2 px-4 py-3 text-left ${t.id === selected ? "border-ink bg-board" : "border-transparent bg-rail"}`}
            >
              <Emoji emoji={trackerPicture(t)} className="size-11" />
              <span className="truncate text-xl font-extrabold text-ink">{t.name || "…"}</span>
              <span className="truncate text-sm text-ink-muted">{members.filter((m) => t.member_ids.includes(m.id)).map((m) => m.name).join(", ")}</span>
            </button>
          ))}
          {adding ? (
            <div className="flex min-h-0 flex-col justify-center gap-1.5 rounded-2xl border-2 border-dashed border-check-border p-2">
              {KINDS.map((k) => (
                <button key={k.value} type="button" onClick={() => add(k.value)} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-base font-bold text-ink hover:bg-rail">
                  <Emoji emoji={k.icon} className="size-7" />
                  {k.label}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-check-border text-ink">
              <Plus size="2rem" weight="bold" aria-hidden />
              <span className="text-lg font-extrabold">New tracker</span>
            </button>
          )}
        </div>
        <Pager page={shownPage} pages={pages} onPage={setPage} className="self-center" />
      </section>

      <section aria-label={tracker?.name ?? "Tracker"} className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border border-frame bg-board px-6 py-5 lg:min-h-0">
        {!tracker ? (
          <EmptyState emoji="💊" title="Add a tracker" />
        ) : (
          <>
            <div className="flex items-end gap-3">
              <EmojiPicker key={tracker.id} initial={tracker.icon ?? ""} fieldName="" nameText={tracker.name} onChange={(icon) => set({ icon: icon || null })} label={`Picture for ${tracker.name}`} fallback="💊" fullScreen />
              <Labelled label="Name" grow>
                <input value={tracker.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className={`${field} w-full text-xl font-bold`} />
              </Labelled>
            </div>
            <Labelled label="Who it's for">
              <People members={members} chosen={tracker.member_ids} onToggle={(id) => set({ member_ids: toggle(tracker.member_ids, id) })} />
            </Labelled>

            {tracker.kind === "medicine" ? (
              <div className="flex min-h-0 flex-col gap-2">
                <div className="flex gap-3 px-3 text-sm font-bold text-ink-muted" aria-hidden>
                  <span className="flex-1">Choices</span>
                  <span className="w-56">Amount each</span>
                  <span className="w-40">Wait between</span>
                  <span className="w-36">Most a day</span>
                  <span className="w-11" />
                </div>
                {tracker.choices.slice(shownChoicePage * CHOICES_PER_PAGE, (shownChoicePage + 1) * CHOICES_PER_PAGE).map((c) => (
                  <div key={c.id} className="flex min-h-18 items-center gap-3 rounded-2xl bg-rail px-3 py-1.5">
                    <EmojiPicker initial={c.icon ?? ""} fieldName="" nameText={c.name} onChange={(icon) => setChoice(c.id, { icon: icon || null })} label={`Picture for ${c.name || "this choice"}`} fallback="💊" className="size-12! self-center!" fullScreen />
                    <input value={c.name} maxLength={40} onChange={(e) => setChoice(c.id, { name: e.target.value })} aria-label="Choice" className={`${field} min-w-0 flex-1 font-bold`} />
                    <span className="flex w-56 flex-col gap-1">
                      {people.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm font-bold" style={{ color: strong(m.colour) }}>
                          <span className="w-14 truncate">{m.name}</span>
                          <input
                            value={c.amounts[m.id] ?? ""}
                            maxLength={20}
                            onChange={(e) => setChoice(c.id, { amounts: { ...c.amounts, [m.id]: e.target.value } })}
                            aria-label={`${c.name || "Amount"} for ${m.name}`}
                            className="h-9 min-w-0 flex-1 rounded-lg border-2 border-frame bg-board px-2 text-base text-ink outline-none focus:border-accent"
                          />
                        </label>
                      ))}
                    </span>
                    <span className="w-40">
                      <Stepper
                        value={c.wait_minutes ?? 0}
                        text={waitText(c.wait_minutes)}
                        min={0}
                        max={48 * 60}
                        step={30}
                        onChange={(v) => setChoice(c.id, { wait_minutes: v || null })}
                        label="wait"
                        small
                      />
                    </span>
                    <span className="w-36">
                      <Stepper
                        value={c.max_per_day ?? 0}
                        text={c.max_per_day ? String(c.max_per_day) : "–"}
                        min={0}
                        max={50}
                        onChange={(v) => setChoice(c.id, { max_per_day: v || null })}
                        label="most a day"
                        small
                      />
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name || "this choice"}`}
                      onClick={() => set({ choices: tracker.choices.filter((x) => x.id !== c.id) })}
                      className="flex size-11 items-center justify-center rounded-xl text-danger hover:bg-board"
                    >
                      <X size="1.25rem" weight="bold" aria-hidden />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={addChoice} className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-lg font-extrabold text-accent hover:bg-rail">
                    <Plus size="1.125rem" weight="bold" aria-hidden />
                    Add a choice
                  </button>
                  <Pager page={shownChoicePage} pages={choicePages} onPage={setChoicePage} className="ml-auto" />
                </div>
              </div>
            ) : tracker.kind === "number" ? (
              <div className="flex gap-6">
                <Labelled label="Unit">
                  <input value={tracker.unit} maxLength={12} onChange={(e) => set({ unit: e.target.value })} className={`${field} w-32`} />
                </Labelled>
                <Labelled label="Shade above">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={tracker.alert_above ?? ""}
                    onChange={(e) => set({ alert_above: e.target.value === "" ? null : Number(e.target.value) })}
                    className={`${field} w-32`}
                  />
                </Labelled>
              </div>
            ) : null}

            <div className="mt-auto flex border-t border-frame pt-3">
              <button type="button" onClick={remove} className="ml-auto flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl px-4 text-base font-bold text-danger hover:bg-rail">
                <Trash size="1.25rem" weight="bold" aria-hidden />
                Delete tracker
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const field = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Labelled({ label, grow = false, children }: { label: string; grow?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${grow ? "min-w-0 flex-1" : ""}`}>
      <span className="text-sm font-bold text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function People({ members, chosen, onToggle }: { members: ManagerMember[]; chosen: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const on = chosen.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(m.id)}
            className="flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-full border-2 pr-5 pl-1.5 text-lg font-bold text-ink"
            style={on ? { borderColor: strong(m.colour), background: soft(m.colour) } : { borderColor: "transparent", background: "var(--color-rail)" }}
          >
            <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" />
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-ink-muted">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1 self-start rounded-2xl bg-panel p-1.25">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex min-h-12 items-center rounded-xl px-4 text-base font-bold ${value === o.value ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({
  value,
  text,
  min,
  max,
  step = 1,
  onChange,
  label,
  small = false,
}: {
  value: number;
  text?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  small?: boolean;
}) {
  const button = `${small ? "h-11 w-10" : "h-[calc(var(--touch-target)-4px)] w-12"} text-2xl font-extrabold text-ink disabled:opacity-30`;
  return (
    <span className={`flex items-center rounded-xl border border-frame bg-board ${small ? "" : "min-h-[var(--touch-target)]"}`}>
      <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} className={button}>
        −
      </button>
      <span className={`min-w-14 flex-1 text-center font-extrabold text-ink tabular-nums ${small ? "text-base" : "text-xl"}`}>{text ?? value}</span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} className={button}>
        +
      </button>
    </span>
  );
}
