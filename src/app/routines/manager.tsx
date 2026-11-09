"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChartLineUp, GearSix, Plus, Trash, X } from "@phosphor-icons/react";
import { Avatar, Emoji } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { LeaveDialog, SaveBar, useUnsavedChanges } from "@/components/unsaved-changes";
import { soft, strong } from "@/lib/colours";
import { EATING_MINUTES } from "@/lib/meals";
import { NEW_PREFIX, draftProblem, sameDraft, type DraftRoutine, type DraftStep, type DraftUse, type ManagerDraft } from "@/lib/routine-manager";
import { placeRoutines, toMinutes, wantedSlot, type Anchor, type DayAnchors } from "@/lib/routine-placement";
import { saveRoutineManager } from "./manager-actions";

/*
 * The Routine Manager. Left: routine blocks on a time grid, one column per
 * person (for one kind of day) or per kind of day (for one person). Right:
 * the editor for the block you tap. Every change stays on this screen until
 * Save; leaving with changes asks first. Nothing scrolls: long step lists
 * page, and the time grid squeezes to fit.
 */

export type ManagerMember = { id: string; name: string; colour: string; icon: string | null };
export type ManagerDayType = { id: string; member_id: string; name: string; icon: string | null; wake_time: string; bed_time: string; sort_order: number };
export type ManagerMealTime = { id: string; name: string; usual_time: string };

type View = { by: "day"; name: string } | { by: "person"; memberId: string };
type Column = { key: string; member: ManagerMember; dayType: ManagerDayType | null; title: string; icon: string | null; isPerson: boolean };

const STEPS_PER_PAGE = 7;
const ANCHOR_LABEL: Record<Anchor, string> = {
  wake: "After wake-up",
  bed: "Ends by bedtime",
  meal: "After a meal",
  clock: "At a set time",
};
const VISIBILITY = [
  { value: "everyone", label: "Everyone" },
  { value: "adults", label: "Adults only" },
  { value: "just_me", label: "Just me" },
];
const SELECTED_KEY = "almanac.routineManager.selected";
const VIEW_KEY = "almanac.routineManager.view";

let counter = 0;
const newId = () => `${NEW_PREFIX}${Date.now().toString(36)}-${(counter += 1)}`;

function remember(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the screen works without it.
  }
}
function recall(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function RoutineManager({
  initial,
  members,
  dayTypes,
  mealTimes,
  today,
  locale,
  flexMinutes,
}: {
  initial: ManagerDraft;
  members: ManagerMember[];
  dayTypes: ManagerDayType[];
  mealTimes: ManagerMealTime[];
  today: string;
  locale: string;
  flexMinutes: number;
}) {
  const [draft, setDraft] = useState<ManagerDraft>(initial);
  const [selected, setSelected] = useState<string | null>(() => {
    const id = typeof window === "undefined" ? null : recall(SELECTED_KEY);
    return id && initial.routines.some((r) => r.id === id) ? id : null;
  });
  const dayNames = useMemo(() => {
    const names: string[] = [];
    for (const t of dayTypes.toSorted((a, b) => a.sort_order - b.sort_order)) if (!names.includes(t.name)) names.push(t.name);
    return names;
  }, [dayTypes]);
  const [view, setView] = useState<View>(() => {
    const saved = typeof window === "undefined" ? null : recall(VIEW_KEY);
    if (saved?.startsWith("person:") && members.some((m) => `person:${m.id}` === saved)) return { by: "person", memberId: saved.slice(7) };
    if (saved?.startsWith("day:") && dayNames.includes(saved.slice(4))) return { by: "day", name: saved.slice(4) };
    return { by: "day", name: dayNames[0] ?? "" };
  });
  const [stepPage, setStepPage] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameDraft(draft, initial);

  const guard = useUnsavedChanges(dirty);

  // --- Columns and where each block sits ---------------------------------------
  const columns: Column[] = useMemo(() => {
    if (view.by === "person") {
      const member = members.find((m) => m.id === view.memberId) ?? members[0];
      if (!member) return [];
      return dayTypes
        .filter((t) => t.member_id === member.id)
        .toSorted((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({ key: `${member.id}:${t.id}`, member, dayType: t, title: t.name, icon: t.icon, isPerson: false }));
    }
    return members.map((m) => {
      const t = dayTypes.find((d) => d.member_id === m.id && d.name === view.name) ?? null;
      return { key: `${m.id}:${t?.id ?? "none"}`, member: m, dayType: t, title: m.name, icon: m.icon, isPerson: true };
    });
  }, [view, members, dayTypes]);

  const mealEnd = (id: string) => {
    const meal = mealTimes.find((m) => m.id === id);
    return meal ? toMinutes(meal.usual_time) + EATING_MINUTES : null;
  };
  const placed = columns.map((c) => {
    if (!c.dayType) return { column: c, blocks: [] };
    const anchors: DayAnchors = { wake: toMinutes(c.dayType.wake_time), bed: toMinutes(c.dayType.bed_time), mealEnd };
    const uses = draft.uses.filter((u) => u.member_id === c.member.id && u.day_type_id === c.dayType?.id);
    const items = uses.flatMap((u) => {
      const r = draft.routines.find((x) => x.id === u.routine_id);
      return r ? [{ use: u, routine: r }] : [];
    });
    const placements = placeRoutines(
      items.map(({ use, routine }) => ({
        id: use.id,
        ...wantedSlot({ ...routine, kind: "daily" }, [], anchors, flexMinutes),
      })),
      [],
    );
    return { column: c, blocks: items.map((item, i) => ({ ...item, start: placements[i].startMin, end: placements[i].endMin })) };
  });
  const allBlocks = placed.flatMap((p) => p.blocks);
  const wakeTimes = columns.flatMap((c) => (c.dayType ? [toMinutes(c.dayType.wake_time), toMinutes(c.dayType.bed_time)] : []));
  const firstHour = Math.max(0, Math.floor(Math.min(6 * 60, ...wakeTimes, ...allBlocks.map((b) => b.start)) / 60));
  const lastHour = Math.min(24, Math.ceil(Math.max(21 * 60, ...wakeTimes, ...allBlocks.map((b) => b.end)) / 60));
  const span = (lastHour - firstHour) * 60;
  const hourLabel = (h: number) => new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h % 24)));
  const timeLabel = (min: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, Math.floor(min / 60) % 24, min % 60)));

  // --- Changing the draft ------------------------------------------------------
  const routine = draft.routines.find((r) => r.id === selected) ?? null;
  const steps = routine ? draft.steps.filter((s) => s.routine_id === routine.id) : [];
  const update = (change: (d: ManagerDraft) => ManagerDraft) => {
    setError(null);
    setDraft((d) => change(d));
  };
  const select = (id: string | null) => {
    setSelected(id);
    setStepPage(0);
    setAdding(null);
    remember(SELECTED_KEY, id);
  };
  const setRoutine = (patch: Partial<DraftRoutine>) => {
    if (!routine) return;
    update((d) => ({ ...d, routines: d.routines.map((r) => (r.id === routine.id ? { ...r, ...patch } : r)) }));
  };
  const setStep = (id: string, patch: Partial<DraftStep>) => update((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveStep = (id: string, by: -1 | 1) =>
    update((d) => {
      const list = [...d.steps];
      const i = list.findIndex((s) => s.id === id);
      const mine = list.map((s, at) => ({ s, at })).filter((x) => x.s.routine_id === list[i].routine_id);
      const here = mine.findIndex((x) => x.at === i);
      const other = mine[here + by];
      if (!other) return d;
      [list[i], list[other.at]] = [list[other.at], list[i]];
      return { ...d, steps: list };
    });
  const removeStep = (id: string) => update((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) }));
  const addStep = (text: string, icon: string) => {
    if (!routine || !text.trim()) return;
    update((d) => ({ ...d, steps: [...d.steps, { id: newId(), routine_id: routine.id, text: text.trim(), icon: icon || null, habit: true }] }));
    setStepPage(Math.floor(steps.length / STEPS_PER_PAGE));
  };
  const removeRoutine = () => {
    if (!routine) return;
    update((d) => ({
      routines: d.routines.filter((r) => r.id !== routine.id),
      steps: d.steps.filter((s) => s.routine_id !== routine.id),
      uses: d.uses.filter((u) => u.routine_id !== routine.id),
    }));
    select(null);
  };
  const removeUse = (id: string) => update((d) => ({ ...d, uses: d.uses.filter((u) => u.id !== id) }));
  const addUse = (routineId: string, column: Column) => {
    if (!column.dayType) return;
    const dayTypeId = column.dayType.id;
    update((d) =>
      d.uses.some((u) => u.routine_id === routineId && u.member_id === column.member.id && u.day_type_id === dayTypeId)
        ? d
        : { ...d, uses: [...d.uses, { id: newId(), routine_id: routineId, member_id: column.member.id, day_type_id: dayTypeId }] },
    );
    select(routineId);
  };
  /** A new routine at the spot tapped in a column. */
  const newRoutineAt = (column: Column, minutes: number) => {
    if (!column.dayType) return;
    const start = Math.round(minutes / 15) * 15;
    const id = newId();
    const hh = String(Math.floor(start / 60)).padStart(2, "0");
    const mm = String(start % 60).padStart(2, "0");
    const fresh: DraftRoutine = {
      id,
      name: "New routine",
      anchor: "clock",
      anchor_meal_time_id: null,
      anchor_offset: 0,
      usual_start: `${hh}:${mm}`,
      usual_minutes: 30,
      loose: false,
      habit_since: null,
      show_on_daily_list: false,
      visibility: "everyone",
    };
    const use: DraftUse = { id: newId(), routine_id: id, member_id: column.member.id, day_type_id: column.dayType.id };
    update((d) => ({ ...d, routines: [...d.routines, fresh], uses: [...d.uses, use] }));
    select(id);
  };

  // --- Saving ---------------------------------------------------------------------
  const save = async (then?: string | null) => {
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      guard.stay();
      return;
    }
    setSaving(true);
    const result = await saveRoutineManager(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      return;
    }
    if (selected) remember(SELECTED_KEY, result.ids[selected] ?? selected);
    guard.saved(then);
  };
  const undo = () => {
    setDraft(initial);
    setError(null);
    if (selected && !initial.routines.some((r) => r.id === selected)) select(null);
  };

  const pickView = (next: View) => {
    setView(next);
    setAdding(null);
    remember(VIEW_KEY, next.by === "day" ? `day:${next.name}` : `person:${next.memberId}`);
  };

  const usedBy = routine
    ? draft.uses
        .filter((u) => u.routine_id === routine.id)
        .map((u) => ({
          use: u,
          member: members.find((m) => m.id === u.member_id),
          dayType: dayTypes.find((t) => t.id === u.day_type_id),
        }))
    : [];
  const selectedMember = usedBy[0]?.member;
  const pages = Math.max(1, Math.ceil(steps.length / STEPS_PER_PAGE));
  const page = Math.min(stepPage, pages - 1);

  return (
    <>
      {/* Title, how to look (by day or by person), which one, and Set days */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 lg:h-18 lg:flex-nowrap">
        <h1 className="shrink-0 text-3xl font-extrabold tracking-[-0.03rem] text-ink lg:text-5xl">Routine Manager</h1>
        <div role="group" aria-label="Look by" className="flex shrink-0 gap-1 rounded-2xl bg-panel p-1.25">
          {(["day", "person"] as const).map((by) => (
            <button
              key={by}
              type="button"
              aria-pressed={view.by === by}
              onClick={() => {
                if (view.by === by) return;
                if (by === "day") pickView({ by: "day", name: dayNames[0] ?? "" });
                else pickView({ by: "person", memberId: (selectedMember ?? members[0])?.id ?? "" });
              }}
              className={`flex min-h-[var(--touch-target)] min-w-28 items-center justify-center rounded-xl px-4 text-base font-bold ${view.by === by ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
            >
              {by === "day" ? "By day" : "By person"}
            </button>
          ))}
        </div>
        <div role="group" aria-label={view.by === "day" ? "Which kind of day" : "Whose routines"} className="flex min-w-0 flex-wrap items-center gap-2">
          {view.by === "day"
            ? dayNames.map((name) => (
                <Chip key={name} active={view.name === name} onClick={() => pickView({ by: "day", name })}>
                  {name}
                </Chip>
              ))
            : members.map((m) => (
                <Chip key={m.id} active={view.memberId === m.id} onClick={() => pickView({ by: "person", memberId: m.id })}>
                  <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" />
                  {m.name}
                </Chip>
              ))}
        </div>
        <Link
          href="/routines/manage"
          className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl bg-rail px-5 text-base font-bold text-ink hover:bg-panel lg:ml-auto"
        >
          <GearSix size="1.5rem" aria-hidden />
          Set days
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
        {/* The time grid */}
        <section aria-label="Routines" className="relative flex min-h-[32rem] min-w-0 flex-col rounded-[var(--radius-card)] border border-frame bg-board px-4 pt-3 pb-4 lg:min-h-0">
          <div className="flex shrink-0 gap-2.5 pl-16">
            {columns.map((c) => (
              <div key={c.key} className="flex min-w-0 flex-1 basis-0 items-center gap-2 border-b-2 pb-2" style={{ borderColor: c.isPerson ? strong(c.member.colour) : "var(--color-frame)" }}>
                {c.isPerson ? <Avatar name={c.member.name} colour={c.member.colour} icon={c.member.icon} size="sm" /> : <Emoji emoji={c.icon} className="size-7" />}
                <span className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{c.title}</span>
                {c.dayType ? (
                  <button
                    type="button"
                    onClick={() => setAdding(adding === c.key ? null : c.key)}
                    aria-expanded={adding === c.key}
                    aria-label={`Add a routine for ${c.member.name}${c.isPerson ? "" : ` on ${c.title}`}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rail text-ink hover:bg-panel"
                  >
                    <Plus size="1.25rem" weight="bold" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {columns.length === 0 ? <p className="mt-6 text-lg text-ink-muted">Add the people in your household first, in Settings.</p> : null}
          <div className="relative mt-2 flex min-h-0 flex-1 gap-2.5 pl-16">
            {/* Hour lines */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {Array.from({ length: lastHour - firstHour + 1 }, (_, i) => (
                <div key={i} className="absolute right-0 left-0 border-t border-grid" style={{ top: `${(i * 60 * 100) / span}%` }}>
                  {i % 2 === 0 && i < lastHour - firstHour ? (
                    <span className="absolute -top-2.5 left-0 w-14 text-right text-sm font-bold whitespace-nowrap text-ink-muted">{hourLabel(firstHour + i)}</span>
                  ) : null}
                </div>
              ))}
            </div>
            {placed.map(({ column, blocks }) => (
              <div
                key={column.key}
                className={`relative min-w-0 flex-1 basis-0 ${column.dayType ? "cursor-copy" : ""}`}
                onClick={(e) => {
                  if (e.target !== e.currentTarget || !column.dayType) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  newRoutineAt(column, firstHour * 60 + ((e.clientY - box.top) / box.height) * span);
                }}
                title={column.dayType ? "Tap an empty spot to add a routine there" : undefined}
              >
                {!column.dayType ? (
                  <p className="mt-4 px-2 text-center text-base text-ink-muted">
                    {column.member.name} has no {view.by === "day" ? view.name : ""} day.
                  </p>
                ) : null}
                {blocks.map(({ use, routine: r, start, end }) => {
                  const shown = Math.max(end - start, 40);
                  const first = draft.steps.find((s) => s.routine_id === r.id && s.icon);
                  const active = r.id === selected;
                  return (
                    <button
                      key={use.id}
                      type="button"
                      onClick={() => select(r.id)}
                      aria-pressed={active}
                      className={`absolute right-1 left-1 z-[1] flex items-center gap-1.5 overflow-hidden rounded-xl border-2 px-2 text-left text-ink ${active ? "border-solid shadow-[0_0_0_3px_var(--color-ink)]" : "border-dashed"}`}
                      style={{
                        top: `calc(${((start - firstHour * 60) / span) * 100}% + 1px)`,
                        height: `calc(${(shown / span) * 100}% - 2px)`,
                        borderColor: strong(column.member.colour),
                        background: active ? soft(column.member.colour) : `color-mix(in srgb, ${strong(column.member.colour)} 7%, white)`,
                      }}
                    >
                      <Emoji emoji={first?.icon ?? "✅"} className="size-6" />
                      {/* Short blocks put the time beside the name; taller ones below it. */}
                      <span className={`flex min-w-0 flex-1 leading-[1.1] ${shown >= 75 ? "flex-col" : "items-baseline gap-2"}`}>
                        <span className="truncate text-base font-bold">{r.name || "Untitled"}</span>
                        <span className="truncate text-sm font-semibold text-ink-soft">{`${timeLabel(start)}–${timeLabel(end)}`}</span>
                      </span>
                    </button>
                  );
                })}
                {adding === column.key ? (
                  <AddExisting
                    routines={draft.routines.filter((r) => !blocks.some((b) => b.routine.id === r.id))}
                    onPick={(id) => addUse(id, column)}
                    onClose={() => setAdding(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* The editor */}
        <section aria-label="Edit routine" className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-frame bg-board px-5.5 py-4">
          {routine ? (
            <>
              <div className="flex items-center gap-2.5">
                <input
                  value={routine.name}
                  onChange={(e) => setRoutine({ name: e.target.value })}
                  maxLength={60}
                  aria-label="Routine name"
                  className="min-h-[var(--touch-target)] min-w-0 flex-1 rounded-[var(--radius)] border-2 border-transparent bg-transparent px-2 text-3xl font-extrabold text-ink outline-none hover:border-frame focus:border-accent"
                />
                <button
                  type="button"
                  onClick={removeRoutine}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-danger px-3 text-base font-bold text-danger"
                >
                  <Trash size="1.125rem" weight="bold" aria-hidden />
                  Delete
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-muted">
                {usedBy.length === 0 ? <span>Nobody has this routine yet. Tap + above a column to give it to someone.</span> : <span>Used by</span>}
                {usedBy.map(({ use, member, dayType }) => (
                  <span key={use.id} className="flex h-8 items-center gap-1 rounded-full pr-1 pl-2.5 text-ink" style={{ background: soft(member?.colour) }}>
                    {member?.name ?? "?"} · {dayType?.name ?? "?"}
                    <button type="button" onClick={() => removeUse(use.id)} aria-label={`Take it off ${member?.name}'s ${dayType?.name}`} className="flex size-6 items-center justify-center rounded-full hover:bg-board">
                      <X size="0.875rem" weight="bold" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>

              {/* Steps, in order */}
              <ul className="mt-3 flex flex-col gap-1.5">
                {steps.slice(page * STEPS_PER_PAGE, page * STEPS_PER_PAGE + STEPS_PER_PAGE).map((step, i) => {
                  const index = page * STEPS_PER_PAGE + i;
                  return (
                    <li key={step.id} className="flex items-center gap-1.5">
                      <EmojiPicker
                        initial={step.icon ?? ""}
                        fieldName=""
                        nameText={step.text}
                        onChange={(icon) => setStep(step.id, { icon: icon || null })}
                        label={`Picture for ${step.text}`}
                        className="size-11! self-center!"
                        fullScreen
                      />
                      <input
                        value={step.text}
                        onChange={(e) => setStep(step.id, { text: e.target.value })}
                        maxLength={80}
                        aria-label={`Step ${index + 1}`}
                        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent"
                      />
                      {routine.habit_since ? (
                        <SmallButton
                          label={step.habit ? `Stop tracking ${step.text}` : `Track ${step.text} as a habit`}
                          pressed={step.habit}
                          onClick={() => setStep(step.id, { habit: !step.habit })}
                          tone={step.habit ? "on" : "plain"}
                        >
                          <ChartLineUp size="1.125rem" weight="bold" aria-hidden />
                        </SmallButton>
                      ) : null}
                      <SmallButton label={`Move ${step.text} up`} disabled={index === 0} onClick={() => moveStep(step.id, -1)}>
                        <ArrowUp size="1.125rem" weight="bold" aria-hidden />
                      </SmallButton>
                      <SmallButton label={`Move ${step.text} down`} disabled={index === steps.length - 1} onClick={() => moveStep(step.id, 1)}>
                        <ArrowDown size="1.125rem" weight="bold" aria-hidden />
                      </SmallButton>
                      <SmallButton label={`Delete ${step.text}`} onClick={() => removeStep(step.id)} tone="danger">
                        <Trash size="1.125rem" weight="bold" aria-hidden />
                      </SmallButton>
                    </li>
                  );
                })}
              </ul>
              {steps.length === 0 ? <p className="mt-2 text-base text-ink-muted">No steps yet. Add the first one below.</p> : null}
              <div className="mt-1.5 flex items-center gap-3 text-base font-bold">
                {pages > 1 ? (
                  <>
                    <button type="button" disabled={page === 0} onClick={() => setStepPage(page - 1)} className="flex min-h-10 items-center rounded-xl bg-rail px-3 text-ink disabled:opacity-40">
                      ‹ Earlier
                    </button>
                    <span className="text-ink-muted">
                      Steps {page * STEPS_PER_PAGE + 1}–{Math.min(steps.length, (page + 1) * STEPS_PER_PAGE)} of {steps.length}
                    </span>
                    <button type="button" disabled={page === pages - 1} onClick={() => setStepPage(page + 1)} className="flex min-h-10 items-center rounded-xl bg-rail px-3 text-ink disabled:opacity-40">
                      More ›
                    </button>
                  </>
                ) : null}
                {routine.habit_since ? (
                  <span className="ml-auto flex items-center gap-1.5 text-sm text-success">
                    <ChartLineUp size="1rem" weight="bold" aria-hidden />
                    Green = tracked
                  </span>
                ) : null}
              </div>
              <AddStep key={routine.id} onAdd={addStep} />

              {/* When it happens, and the switches */}
              <div className="mt-auto flex flex-col gap-2.5 border-t border-frame pt-3">
                <div className="flex flex-wrap items-end gap-2.5">
                  <Labelled label="When">
                    <select
                      value={routine.anchor}
                      onChange={(e) => {
                        const anchor = e.target.value as Anchor;
                        setRoutine({
                          anchor,
                          usual_start: anchor === "clock" ? (routine.usual_start ?? "16:00") : routine.usual_start,
                          anchor_meal_time_id: anchor === "meal" ? (routine.anchor_meal_time_id ?? mealTimes[0]?.id ?? null) : routine.anchor_meal_time_id,
                        });
                      }}
                      className={fieldClass}
                    >
                      {(Object.keys(ANCHOR_LABEL) as Anchor[]).map((a) => (
                        <option key={a} value={a}>
                          {ANCHOR_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </Labelled>
                  {routine.anchor === "meal" ? (
                    <Labelled label="Which meal">
                      <select value={routine.anchor_meal_time_id ?? ""} onChange={(e) => setRoutine({ anchor_meal_time_id: e.target.value || null })} className={fieldClass}>
                        {mealTimes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </Labelled>
                  ) : null}
                  {routine.anchor === "clock" ? (
                    <Labelled label="Starts at">
                      <input type="time" value={routine.usual_start ?? ""} onChange={(e) => setRoutine({ usual_start: e.target.value || null })} className={fieldClass} />
                    </Labelled>
                  ) : (
                    <Labelled label={routine.anchor === "bed" ? "Ends before bed (min)" : "Gap (min)"}>
                      <NumberField value={routine.anchor_offset} min={0} max={240} onChange={(v) => setRoutine({ anchor_offset: v })} />
                    </Labelled>
                  )}
                  <Labelled label="Takes (min)">
                    <NumberField value={routine.usual_minutes} min={5} max={240} onChange={(v) => setRoutine({ usual_minutes: v })} />
                  </Labelled>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Switch on={routine.loose} onClick={() => setRoutine({ loose: !routine.loose })} label="Loose" hint="Can move later in the day" />
                  <Switch
                    on={Boolean(routine.habit_since)}
                    onClick={() => setRoutine({ habit_since: routine.habit_since ? null : today })}
                    label="Track"
                    hint="Keeps a habit history"
                  />
                  <Switch
                    on={routine.show_on_daily_list}
                    onClick={() => setRoutine({ show_on_daily_list: !routine.show_on_daily_list })}
                    label="Show on daily list"
                    hint="Extra reminder, like a new medicine"
                  />
                  <label className="ml-auto flex items-center gap-2 text-sm font-bold text-ink-muted">
                    Who sees it
                    <select value={routine.visibility} onChange={(e) => setRoutine({ visibility: e.target.value })} className={`${fieldClass} min-h-11`}>
                      {VISIBILITY.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Emoji emoji="📝" className="size-16" />
              <p className="max-w-80 text-xl font-bold text-ink">Tap a routine to edit it</p>
              <p className="max-w-96 text-base text-ink-muted">Or tap an empty spot in a column to add a new one there. The + above a column gives that person a routine you already have.</p>
            </div>
          )}

          {/* One Save for everything */}
          <div className="mt-3">
            <SaveBar dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
          </div>
        </section>
      </div>

      {guard.leaving ? (
        <LeaveDialog what="some routines" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const fieldClass = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-base font-bold ${active ? "border-ink bg-ink text-board" : "border-frame bg-board text-ink hover:border-ink"}`}
    >
      {children}
    </button>
  );
}

function SmallButton({
  label,
  onClick,
  disabled,
  pressed,
  tone = "plain",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "plain" | "danger" | "on";
  children: React.ReactNode;
}) {
  const look = tone === "danger" ? "bg-rail text-danger" : tone === "on" ? "bg-success text-white" : "bg-rail text-ink";
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={`flex size-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-30 ${look}`}>
      {children}
    </button>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
      className={`${fieldClass} w-28`}
    />
  );
}

function Switch({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      title={hint}
      className={`flex min-h-11 items-center gap-2.5 rounded-2xl px-3 text-base font-bold ${on ? "bg-[color-mix(in_srgb,var(--color-success)_12%,white)] text-success" : "bg-rail text-ink"}`}
    >
      <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${on ? "justify-end bg-success" : "justify-start bg-check-border"}`} aria-hidden>
        <span className="size-5 rounded-full bg-white" />
      </span>
      {label}
    </button>
  );
}

function AddStep({ onAdd }: { onAdd: (text: string, icon: string) => void }) {
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("");
  const [round, setRound] = useState(0);
  const add = () => {
    if (!text.trim()) return;
    onAdd(text, icon);
    setText("");
    setIcon("");
    setRound((r) => r + 1);
  };
  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-2xl border-2 border-dashed border-frame p-1.5">
      <EmojiPicker key={round} initial="" fieldName="" nameText={text} onChange={setIcon} label="Picture for the new step" className="size-11! self-center!" fullScreen />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        maxLength={80}
        placeholder="New step, e.g. Brush teeth"
        aria-label="New step"
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent"
      />
      <button type="button" onClick={add} disabled={!text.trim()} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-base font-bold text-board disabled:opacity-40">
        <Plus size="1.125rem" weight="bold" aria-hidden />
        Add
      </button>
    </div>
  );
}

const ADD_PER_PAGE = 6;

function AddExisting({ routines, onPick, onClose }: { routines: DraftRoutine[]; onPick: (id: string) => void; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(routines.length / ADD_PER_PAGE));
  const shown = routines.slice(page * ADD_PER_PAGE, page * ADD_PER_PAGE + ADD_PER_PAGE);
  return (
    <div className="absolute top-1 right-0 left-0 z-10 flex flex-col gap-1 rounded-2xl border border-frame bg-board p-2 shadow-[0_0.5rem_2rem_rgba(30,35,45,0.18)]">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-ink-muted">Add a routine you have</span>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full bg-rail text-ink">
          <X size="1rem" weight="bold" aria-hidden />
        </button>
      </div>
      {shown.length === 0 ? <p className="px-1 text-base text-ink-muted">They have every routine already. Tap an empty spot to make a new one.</p> : null}
      {shown.map((r) => (
        <button key={r.id} type="button" onClick={() => onPick(r.id)} className="flex min-h-11 items-center rounded-xl px-2 text-left text-base font-bold text-ink hover:bg-rail">
          <span className="truncate">{r.name || "Untitled"}</span>
        </button>
      ))}
      {pages > 1 ? (
        <div className="flex items-center gap-2 px-1">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-9 rounded-lg bg-rail px-2.5 text-sm font-bold disabled:opacity-40">
            ‹
          </button>
          <span className="text-sm font-bold text-ink-muted">
            {page + 1} of {pages}
          </span>
          <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} className="min-h-9 rounded-lg bg-rail px-2.5 text-sm font-bold disabled:opacity-40">
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
