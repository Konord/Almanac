"use client";

import { Pager } from "@/components/pager";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CaretDown, CaretUp, ChartLineUp, Copy, GearSix, ListChecks, Plus, Trash, Users, X } from "@phosphor-icons/react";
import {
  ColourDot,
  EmptyState,
  Emoji,
  ScreenHeader,
  Toggle,
  fieldLabelClass,
  editorInputClass as inputClass,
  primaryActionClass,
  secondaryActionClass,
  segItemClass,
  segTrackClass,
  whoChipStyle,
} from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { hand, soft, strong } from "@/lib/colours";
import { MEAL_MINUTES, NEW_PREFIX, copyRoutine, noPresets, dailyListState, draftProblem, joinRuns, routinePeople, sameDraft, stepPeople, type GridRun, type DraftMealBlock, type DraftRoutine, type DraftStep, type DraftUse, type ManagerDraft } from "@/lib/routine-manager";
import { placeRoutines, toMinutes, wantedSlot, type Anchor, type DayAnchors } from "@/lib/routine-placement";
import { SideHandles } from "@/components/side-handles";
import { clock, useTimelineDrag } from "@/components/timeline-drag";
import { spanBox } from "@/lib/calendar-layout";
import { saveRoutineManager } from "./manager-actions";
import { hourText, minutesText } from "@/lib/time-text";

/*
 * The Routine Manager. Left: routine blocks on a time grid, one column per
 * person, for the kind of day picked at the top. Right:
 * the editor for the block you tap. Every change stays on this screen until
 * Save; leaving with changes asks first. Nothing scrolls: long step lists
 * page, and the time grid squeezes to fit.
 */

export type ManagerMember = { id: string; name: string; colour: string; icon: string | null };
export type ManagerDayType = { id: string; member_id: string; name: string; icon: string | null; wake_time: string; bed_time: string; sort_order: number };
/** What a meal block's weekday presets can be: a kind of meal, or one meal from the menu. */
export type MealChoices = {
  kinds: { id: string; name: string; icon: string | null }[];
  meals: { id: string; name: string; icon: string | null; categoryIds: string[] }[];
};

type Column = { key: string; member: ManagerMember; dayType: ManagerDayType | null; title: string; icon: string | null };

const STEPS_PER_PAGE = 7;
const ANCHOR_LABEL: Record<Anchor, string> = {
  // A non-breaking hyphen, so "wake-up" never splits over two lines.
  wake: "After wake\u2011up",
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
  mealChoices,
  weekStartsOn,
  today,
  locale,
  flexMinutes,
}: {
  initial: ManagerDraft;
  members: ManagerMember[];
  dayTypes: ManagerDayType[];
  mealChoices: MealChoices;
  weekStartsOn: 0 | 1;
  today: string;
  locale: string;
  flexMinutes: number;
}) {
  const [draft, setDraft] = useState<ManagerDraft>(initial);
  // The server can't see what was open last time (that's kept in this
  // browser), so both start plain and the browser puts them back just after
  // the page appears. Reading it straight away made the server's page and
  // the browser's differ (a "hydration" error).
  const [selected, setSelected] = useState<string | null>(null);
  const dayNames = useMemo(() => {
    const names: string[] = [];
    for (const t of dayTypes.toSorted((a, b) => a.sort_order - b.sort_order)) if (!names.includes(t.name)) names.push(t.name);
    return names;
  }, [dayTypes]);
  /** The kind of day on screen (by name: each person has their own copy of it). */
  const [view, setView] = useState(dayNames[0] ?? "");
  useEffect(() => {
    const id = recall(SELECTED_KEY);
    const saved = recall(VIEW_KEY);
    /* eslint-disable react-hooks/set-state-in-effect -- restoring what this browser remembered, once, after the first render */
    if (id && (initial.routines.some((r) => r.id === id) || initial.meals.some((m) => m.id === id))) setSelected(id);
    if (saved?.startsWith("day:") && dayNames.includes(saved.slice(4))) setView(saved.slice(4));
    /* eslint-enable react-hooks/set-state-in-effect */
    // Only on the first render: later changes come from taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [stepPage, setStepPage] = useState(0);
  const [stepsRef, stepsPerPage] = useFitRows<HTMLUListElement>(STEPS_PER_PAGE);
  const [whoOpen, setWhoOpen] = useState<string | null>(null);
  /** A line under the routine's name: what just happened, or why something wasn't allowed. */
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameDraft(draft, initial);

  const guard = useUnsavedChanges(dirty, () => setDraft(initial));

  // --- Columns and where each block sits ---------------------------------------
  const columns: Column[] = useMemo(() => {
    return members.map((m) => {
      const t = dayTypes.find((d) => d.member_id === m.id && d.name === view) ?? null;
      return { key: `${m.id}:${t?.id ?? "none"}`, member: m, dayType: t, title: m.name, icon: m.icon };
    });
  }, [view, members, dayTypes]);

  // Meal blocks are part of the draft, so routines after a meal follow it as it moves.
  const mealTimes = draft.meals;
  const mealEnd = (id: string) => {
    const meal = mealTimes.find((m) => m.id === id);
    return meal ? toMinutes(meal.usual_time) + meal.minutes : null;
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
  // Meal blocks in each column: at their time, for as long as eating takes.
  const mealPlaced = columns.map((c) =>
    c.dayType
      ? draft.mealUses
          .filter((u) => u.member_id === c.member.id && u.day_type_id === c.dayType?.id)
          .flatMap((u) => {
            const m = draft.meals.find((x) => x.id === u.meal_id);
            return m ? [{ routineId: m.id, start: toMinutes(m.usual_time), end: toMinutes(m.usual_time) + m.minutes }] : [];
          })
          .toSorted((a, b) => a.start - b.start)
      : [],
  );
  const mealRuns = joinRuns(mealPlaced);
  const allBlocks = [...placed.flatMap((p) => p.blocks), ...mealPlaced.flat()];
  const runs = joinRuns(placed.map((p) => p.blocks.map((b) => ({ ...b, routineId: b.routine.id }))));
  const wakeTimes = columns.flatMap((c) => (c.dayType ? [toMinutes(c.dayType.wake_time), toMinutes(c.dayType.bed_time)] : []));
  const firstHour = Math.max(0, Math.floor(Math.min(6 * 60, ...wakeTimes, ...allBlocks.map((b) => b.start)) / 60));
  const lastHour = Math.min(24, Math.ceil(Math.max(21 * 60, ...wakeTimes, ...allBlocks.map((b) => b.end)) / 60));
  const span = (lastHour - firstHour) * 60;
  const hourLabel = (h: number) => hourText(h, locale);
  const timeLabel = (min: number) => minutesText(min, locale);

  // --- Changing the draft ------------------------------------------------------
  const routine = draft.routines.find((r) => r.id === selected) ?? null;
  const mealBlock = draft.meals.find((m) => m.id === selected) ?? null;
  const steps = routine ? draft.steps.filter((s) => s.routine_id === routine.id) : [];
  const update = (change: (d: ManagerDraft) => ManagerDraft) => {
    setError(null);
    setNote(null);
    setDraft((d) => change(d));
  };
  const select = (id: string | null) => {
    setAdding(null);
    // Tapping the routine that's already open keeps its page and any note.
    if (id === selected) return;
    setSelected(id);
    setStepPage(0);
    setWhoOpen(null);
    setNote(null);
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
  /** The routine's daily list switch: all steps on, or (when all are on) all off. */
  const setWholeDailyList = (on: boolean) => {
    if (!routine) return;
    update((d) => ({ ...d, steps: d.steps.map((s) => (s.routine_id === routine.id ? { ...s, daily_list: on } : s)) }));
  };
  /** Adds or takes a person off a step. Everyone ticked again means "everyone". */
  const toggleStepPerson = (step: DraftStep, memberId: string, people: string[]) => {
    const current = stepPeople(draft, step);
    const chosen = current.length === 0 ? [...people] : current;
    const next = chosen.includes(memberId) ? chosen.filter((id) => id !== memberId) : [...chosen, memberId];
    setStep(step.id, { member_ids: next.length === people.length ? [] : next.length === 0 ? current : next });
  };
  const addStep = (text: string, icon: string) => {
    if (!routine || !text.trim()) return;
    // A new step joins the daily list when the whole routine is on it.
    const onList = steps.length > 0 && dailyListState(steps) === "all";
    update((d) => ({
      ...d,
      steps: [...d.steps, { id: newId(), routine_id: routine.id, text: text.trim(), icon: icon || null, habit_since: null, member_ids: [], daily_list: onList }],
    }));
    setStepPage(Math.floor(steps.length / stepsPerPage));
  };
  const removeRoutine = () => {
    if (!routine) return;
    update((d) => ({
      ...d,
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
    const r = draft.routines.find((x) => x.id === routineId);
    const problem = r ? sameTimeProblem(r, column.member.id, column.dayType, draft.uses) : null;
    if (problem) {
      select(routineId);
      setNote({ text: problem, warn: true });
      return;
    }
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
      visibility: "everyone",
      is_template: false,
    };
    const use: DraftUse = { id: newId(), routine_id: id, member_id: column.member.id, day_type_id: column.dayType.id };
    update((d) => ({ ...d, routines: [...d.routines, fresh], uses: [...d.uses, use] }));
    select(id);
  };

  /** Where a routine would sit in someone's kind of day. */
  const slotIn = (r: DraftRoutine, dayType: ManagerDayType) =>
    wantedSlot({ ...r, kind: "daily" }, [], { wake: toMinutes(dayType.wake_time), bed: toMinutes(dayType.bed_time), mealEnd }, flexMinutes);
  /**
   * A routine is only shared by several people when they all do it at the
   * same time. Giving it to someone whose day puts it at another time
   * (a different wake-up, say) isn't allowed: copy it instead.
   */
  const sameTimeProblem = (r: DraftRoutine, memberId: string, dayType: ManagerDayType, uses: DraftUse[]): string | null => {
    const here = slotIn(r, dayType);
    for (const u of uses) {
      if (u.routine_id !== r.id || u.member_id === memberId) continue;
      const other = dayTypes.find((t) => t.id === u.day_type_id);
      if (!other || other.name !== dayType.name) continue;
      const there = slotIn(r, other);
      if (there.start !== here.start || there.minutes !== here.minutes) {
        const who = members.find((m) => m.id === memberId)?.name ?? "They";
        const with_ = members.find((m) => m.id === u.member_id)?.name ?? "someone";
        return `${who} and ${with_} would do it at different times, so they can't share it. Save it as a template and start a copy for ${who}.`;
      }
    }
    return null;
  };
  /** Dragging a block: a set-time routine moves; any routine can change how long it takes. */
  const moveRoutine = (r: DraftRoutine, start: number, minutes: number) => {
    const length = Math.min(240, Math.max(5, Math.round(minutes)));
    update((d) => ({
      ...d,
      routines: d.routines.map((x) => (x.id === r.id ? { ...x, usual_minutes: length, ...(x.anchor === "clock" ? { usual_start: clock(start) } : {}) } : x)),
    }));
  };
  /** Pulling a block's side over more (or fewer) columns: more people, or more kinds of day. */
  const spreadRun = (run: { routineId: string; c0: number; c1: number }, range: [number, number]) => {
    const r = draft.routines.find((x) => x.id === run.routineId);
    if (!r) return;
    const before = columns.slice(run.c0, run.c1 + 1);
    const after = columns.slice(range[0], range[1] + 1);
    let uses = draft.uses.filter(
      (u) => !(u.routine_id === r.id && before.some((c) => c.member.id === u.member_id && c.dayType?.id === u.day_type_id) && !after.some((c) => c.member.id === u.member_id && c.dayType?.id === u.day_type_id)),
    );
    const problems: string[] = [];
    for (const c of after) {
      if (!c.dayType || uses.some((u) => u.routine_id === r.id && u.member_id === c.member.id && u.day_type_id === c.dayType?.id)) continue;
      const problem = sameTimeProblem(r, c.member.id, c.dayType, uses);
      if (problem) problems.push(problem);
      else uses = [...uses, { id: newId(), routine_id: r.id, member_id: c.member.id, day_type_id: c.dayType.id }];
    }
    update((d) => ({ ...d, uses }));
    select(r.id);
    if (problems.length > 0) setNote({ text: problems[0], warn: true });
  };
  // --- Meal blocks ----------------------------------------------------------------
  const setMeal = (id: string, patch: Partial<DraftMealBlock>) => update((d) => ({ ...d, meals: d.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  /** Dragging a meal block: it moves (for everyone who has it), and its bottom edge sets how long eating takes. */
  const moveMeal = (m: DraftMealBlock, start: number, minutes: number) =>
    setMeal(m.id, { usual_time: clock(Math.min(23 * 60 + 45, Math.max(0, start))), minutes: Math.min(MEAL_MINUTES.max, Math.max(MEAL_MINUTES.min, Math.round(minutes))) });
  const addMealUse = (mealId: string, column: Column) => {
    if (!column.dayType) return;
    const dayTypeId = column.dayType.id;
    update((d) =>
      d.mealUses.some((u) => u.meal_id === mealId && u.member_id === column.member.id && u.day_type_id === dayTypeId)
        ? d
        : { ...d, mealUses: [...d.mealUses, { id: newId(), meal_id: mealId, member_id: column.member.id, day_type_id: dayTypeId }] },
    );
    setAdding(null);
    select(mealId);
  };
  /** A new meal block in the column it was added from (on the menu at noon until it's moved). */
  const newMealIn = (column: Column) => {
    if (!column.dayType) return;
    const id = newId();
    const fresh: DraftMealBlock = { id, name: "New mealtime", icon: "🍽️", usual_time: "12:00", minutes: 30, presets: noPresets() };
    update((d) => ({ ...d, meals: [...d.meals, fresh], mealUses: [...d.mealUses, { id: newId(), meal_id: id, member_id: column.member.id, day_type_id: column.dayType!.id }] }));
    setAdding(null);
    select(id);
  };
  const removeMealUse = (id: string) => update((d) => ({ ...d, mealUses: d.mealUses.filter((u) => u.id !== id) }));
  /** Deleting a meal block: routines that came after it keep their time, now set by the clock. */
  const removeMeal = () => {
    if (!mealBlock) return;
    const end = toMinutes(mealBlock.usual_time) + mealBlock.minutes;
    update((d) => ({
      ...d,
      meals: d.meals.filter((m) => m.id !== mealBlock.id),
      mealUses: d.mealUses.filter((u) => u.meal_id !== mealBlock.id),
      routines: d.routines.map((r) =>
        r.anchor === "meal" && r.anchor_meal_time_id === mealBlock.id ? { ...r, anchor: "clock" as const, anchor_meal_time_id: null, usual_start: clock(Math.min(23 * 60, end + r.anchor_offset)) } : r,
      ),
    }));
    select(null);
  };
  /** Pulling a meal block's side over more (or fewer) columns: more people, or more kinds of day. */
  const spreadMeal = (run: { routineId: string; c0: number; c1: number }, range: [number, number]) => {
    const before = columns.slice(run.c0, run.c1 + 1);
    const after = columns.slice(range[0], range[1] + 1);
    const inCol = (c: Column, u: { member_id: string; day_type_id: string }) => c.member.id === u.member_id && c.dayType?.id === u.day_type_id;
    let mealUses = draft.mealUses.filter((u) => !(u.meal_id === run.routineId && before.some((c) => inCol(c, u)) && !after.some((c) => inCol(c, u))));
    for (const c of after) {
      if (!c.dayType || mealUses.some((u) => u.meal_id === run.routineId && inCol(c, u))) continue;
      mealUses = [...mealUses, { id: newId(), meal_id: run.routineId, member_id: c.member.id, day_type_id: c.dayType.id }];
    }
    update((d) => ({ ...d, mealUses }));
    select(run.routineId);
  };

  /** A new routine copied from a template, given to the column it was picked in. */
  const startFrom = (templateId: string, column: Column) => {
    if (!column.dayType) return;
    const copy = copyRoutine(draft, templateId, newId, false);
    if (!copy) return;
    const use: DraftUse = { id: newId(), routine_id: copy.routine.id, member_id: column.member.id, day_type_id: column.dayType.id };
    update((d) => ({ ...d, routines: [...d.routines, copy.routine], steps: [...d.steps, ...copy.steps], uses: [...d.uses, use] }));
    setAdding(null);
    select(copy.routine.id);
  };
  const saveAsTemplate = () => {
    if (!routine) return;
    const copy = copyRoutine(draft, routine.id, newId, true);
    if (!copy) return;
    update((d) => ({ ...d, routines: [...d.routines, copy.routine], steps: [...d.steps, ...copy.steps] }));
    setNote({ text: "Saved as a template. Press Save to keep it.", warn: false });
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
    if (selected && !initial.routines.some((r) => r.id === selected) && !initial.meals.some((m) => m.id === selected)) select(null);
  };

  const pickView = (name: string) => {
    setView(name);
    setAdding(null);
    remember(VIEW_KEY, `day:${name}`);
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
  /** Everyone who has the selected routine, for the step "who does it" buttons. */
  const people = routine ? routinePeople(draft, routine.id).flatMap((id) => members.filter((m) => m.id === id)) : [];
  const listState = dailyListState(steps);
  const pages = Math.max(1, Math.ceil(steps.length / stepsPerPage));
  const page = Math.min(stepPage, pages - 1);

  return (
    <>
      {/* Title, which kind of day, and Set days */}
      <ScreenHeader
        title="Routines"
        sub={view}
        tabs={
          <div role="group" aria-label="Which day" className={segTrackClass}>
            {dayNames.map((name) => (
              <button key={name} type="button" aria-pressed={view === name} onClick={() => pickView(name)} className={segItemClass(view === name)}>
                {name}
              </button>
            ))}
          </div>
        }
        action={
          <>
            <Link href="/routines/manage" className={secondaryActionClass}>
              <GearSix size="1.5rem" weight="bold" aria-hidden />
              Set days
            </Link>
            <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
          </>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,40rem)]">
        {/* The time grid: hours in a gutter on the left, one grey column per person. */}
        <section aria-label="Routines" className="relative flex min-h-[32rem] min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-4 pt-[0.8rem] pb-4 shadow-raised lg:min-h-0">
          <div className="flex shrink-0 gap-2 pb-[0.45rem] pl-[5rem]">
            {columns.map((c) => (
              <div key={c.key} className="flex min-w-0 flex-1 basis-0 items-center gap-[0.45rem] border-b-[0.2rem] pb-[0.4rem]" style={{ borderColor: strong(c.member.colour) }}>
                <span aria-hidden className="h-[1.6rem] w-[0.35rem] shrink-0 rounded-full" style={{ background: strong(c.member.colour) }} />
                <span className="min-w-0 flex-1 truncate text-[1.5rem] font-extrabold text-ink">{c.title}</span>
                {c.dayType ? (
                  <button
                    type="button"
                    onClick={() => setAdding(adding === c.key ? null : c.key)}
                    aria-expanded={adding === c.key}
                    aria-label={`Add a routine for ${c.member.name}`}
                    className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius)] bg-rail text-ink hover:bg-panel"
                  >
                    <Plus size="1.25rem" weight="bold" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {columns.length === 0 ? <p className="mt-6 text-lg text-ink-muted">Add the people in your household first, in Settings.</p> : null}
          <div className="relative mt-2 flex min-h-0 flex-1 gap-2 pl-[5rem]">
            {/* Hour labels in the gutter (every other hour; each column draws its own hour lines). */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[4.5rem]" aria-hidden>
              {Array.from({ length: lastHour - firstHour }, (_, i) =>
                i % 2 === 0 ? (
                  <span
                    key={i}
                    className="tabular absolute left-0 -translate-y-1/2 text-[1.15rem] font-bold whitespace-nowrap text-ink-muted"
                    style={{ top: `${(i * 60 * 100) / span}%` }}
                  >
                    {hourLabel(firstHour + i)}
                  </span>
                ) : null,
              )}
            </div>
            {placed.map(({ column, blocks }) => (
              <div
                key={column.key}
                data-drop-day={column.key}
                className={`relative min-w-0 flex-1 basis-0 bg-panel ${column.dayType ? "cursor-copy" : ""}`}
                style={{
                  backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--color-ink) 9%, transparent) 0 1px, transparent 1px)",
                  backgroundSize: `100% ${100 / (lastHour - firstHour)}%`,
                }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget || !column.dayType) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  newRoutineAt(column, firstHour * 60 + ((e.clientY - box.top) / box.height) * span);
                }}
              >
                {!column.dayType ? (
                  <p className="mt-4 px-2 text-center text-lg font-semibold text-ink-muted">
                    {`No ${view} for ${column.member.name}`}
                  </p>
                ) : null}
                {adding === column.key ? (
                  <AddExisting
                    meals={draft.meals.filter((m) => !draft.mealUses.some((u) => u.meal_id === m.id && u.member_id === column.member.id && u.day_type_id === column.dayType?.id))}
                    onPickMeal={(id) => addMealUse(id, column)}
                    onNewMeal={() => newMealIn(column)}
                    routines={draft.routines.filter((r) => !r.is_template && !blocks.some((b) => b.routine.id === r.id))}
                    templates={draft.routines.filter((r) => r.is_template)}
                    onPick={(id) => addUse(id, column)}
                    onStartFrom={(id) => startFrom(id, column)}
                    onEditTemplate={(id) => {
                      setAdding(null);
                      select(id);
                    }}
                    onClose={() => setAdding(null)}
                  />
                ) : null}
              </div>
            ))}
            {/* Meal blocks and routine blocks, over the columns. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 left-[5rem]">
              {mealRuns.map((run) => {
                const m = draft.meals.find((x) => x.id === run.routineId);
                if (!m) return null;
                return (
                  <MealRun
                    key={`meal:${run.routineId}:${run.c0}`}
                    meal={m}
                    run={run}
                    columns={columns.map((c) => c.key)}
                    active={m.id === selected}
                    first={firstHour}
                    last={lastHour}
                    timeLabel={timeLabel}
                    onSelect={() => select(m.id)}
                    onTime={(start, minutes) => moveMeal(m, start, minutes)}
                    onSpread={(range) => spreadMeal(run, range)}
                  />
                );
              })}
              {runs.map((run) => {
                const r = draft.routines.find((x) => x.id === run.routineId);
                if (!r) return null;
                const colours = placed.slice(run.c0, run.c1 + 1).map((p) => p.column.member.colour);
                return (
                  <RoutineRun
                    key={`${run.routineId}:${run.c0}`}
                    routine={r}
                    run={run}
                    columns={columns.map((c) => c.key)}
                    colours={colours}
                    active={r.id === selected}
                    first={firstHour}
                    last={lastHour}
                    timeLabel={timeLabel}
                    onSelect={() => select(r.id)}
                    onTime={(start, minutes) => moveRoutine(r, start, minutes)}
                    onSpread={(range) => spreadRun(run, range)}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* The editor for the tapped block */}
        <section aria-label="Edit routine" className="relative flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised">
          {routine ? (
            <>
              <div className="flex items-center gap-[0.6rem]">
                <Emoji emoji={steps.find((s) => s.icon)?.icon ?? "✅"} className="size-10 shrink-0" />
                <input
                  value={routine.name}
                  onChange={(e) => setRoutine({ name: e.target.value })}
                  maxLength={60}
                  aria-label="Routine name"
                  className="min-h-[var(--touch-target)] min-w-0 flex-1 rounded-[var(--radius)] border-2 border-transparent bg-transparent px-1.5 text-[1.85rem] font-extrabold tracking-[-0.02em] text-ink outline-none hover:border-frame focus:border-ink"
                />
                {routine.is_template ? null : (
                  <button type="button" onClick={saveAsTemplate} aria-label="Save as template" title="Save as template" className={iconButtonClass}>
                    <Copy size="1.5rem" weight="bold" aria-hidden />
                  </button>
                )}
                <button type="button" onClick={removeRoutine} aria-label="Delete this routine" title="Delete this routine" className={`${iconButtonClass} text-danger`}>
                  <Trash size="1.5rem" weight="bold" aria-hidden />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {note ? (
                  <span role="status" className={`line-clamp-2 text-lg font-bold ${note.warn ? "text-danger" : "text-success"}`}>
                    {note.text}
                  </span>
                ) : routine.is_template ? (
                  <span className="rounded-full bg-panel px-3 py-1 text-lg font-bold text-ink">Template</span>
                ) : (
                  <span className={fieldLabelClass}>{usedBy.length === 0 ? "Nobody yet" : "Used by"}</span>
                )}
                {note ? null : (
                  <UseChips
                    uses={usedBy.map(({ use, member, dayType }) => ({ id: use.id, member, dayType }))}
                    view={view}
                    onRemove={removeUse}
                  />
                )}
              </div>

              {/* Steps, in order. Blue words are on the Daily list. */}
              {steps.length === 0 ? <p className="mt-3 text-lg text-ink-muted">No steps yet</p> : null}
              <ul ref={stepsRef} className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
                {steps.slice(page * stepsPerPage, page * stepsPerPage + stepsPerPage).map((step, i) => {
                  const index = page * stepsPerPage + i;
                  return (
                    <li key={step.id} className="relative flex min-h-[3.15rem] shrink-0 items-center gap-[0.35rem] border-b border-frame py-0.5">
                      <span className="tabular flex size-[1.85rem] shrink-0 items-center justify-center rounded-full bg-panel text-[1.15rem] font-extrabold text-ink">{index + 1}</span>
                      <EmojiPicker
                        initial={step.icon ?? ""}
                        fieldName=""
                        nameText={step.text}
                        onChange={(icon) => setStep(step.id, { icon: icon || null })}
                        label={`Picture for ${step.text}`}
                        className="size-12! self-center!"
                        fullScreen
                      />
                      <input
                        value={step.text}
                        onChange={(e) => setStep(step.id, { text: e.target.value })}
                        maxLength={80}
                        aria-label={`Step ${index + 1}`}
                        className={`min-h-12 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-transparent bg-transparent px-1.5 text-[1.35rem] font-bold outline-none hover:border-frame focus:border-ink ${step.daily_list ? "text-accent" : "text-ink"}`}
                      />
                      {people.length > 1 ? (
                        <StepWho
                          step={step}
                          people={people}
                          chosen={stepPeople(draft, step)}
                          open={whoOpen === step.id}
                          onOpen={() => setWhoOpen(whoOpen === step.id ? null : step.id)}
                          onToggle={(memberId) => toggleStepPerson(step, memberId, people.map((p) => p.id))}
                        />
                      ) : null}
                      <SmallButton
                        label={step.daily_list ? `Take ${step.text} off the daily list` : `Show ${step.text} on the daily list`}
                        pressed={step.daily_list}
                        onClick={() => setStep(step.id, { daily_list: !step.daily_list })}
                        tone={step.daily_list ? "list" : "plain"}
                      >
                        <ListChecks size="1.375rem" weight="bold" aria-hidden />
                      </SmallButton>
                      {/* Track one step as a habit on the Habits page (2026-11-12). Not needed when the whole routine is tracked. */}
                      {routine.habit_since ? null : (
                        <SmallButton
                          label={step.habit_since ? `Stop tracking ${step.text}` : `Track ${step.text} as a habit`}
                          pressed={Boolean(step.habit_since)}
                          onClick={() => setStep(step.id, { habit_since: step.habit_since ? null : today })}
                          tone={step.habit_since ? "on" : "plain"}
                        >
                          <ChartLineUp size="1.375rem" weight="bold" aria-hidden />
                        </SmallButton>
                      )}
                      <SmallButton label={`Move ${step.text} up`} disabled={index === 0} onClick={() => moveStep(step.id, -1)}>
                        <CaretUp size="1.375rem" weight="bold" aria-hidden />
                      </SmallButton>
                      <SmallButton label={`Move ${step.text} down`} disabled={index === steps.length - 1} onClick={() => moveStep(step.id, 1)}>
                        <CaretDown size="1.375rem" weight="bold" aria-hidden />
                      </SmallButton>
                      <SmallButton label={`Delete ${step.text}`} onClick={() => removeStep(step.id)}>
                        <Trash size="1.375rem" weight="bold" aria-hidden />
                      </SmallButton>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-[0.4rem] flex shrink-0 items-center gap-3">
                <span className="flex items-center gap-[0.4rem] text-[1.15rem] font-bold text-accent">
                  <ListChecks size="1.25rem" weight="bold" aria-hidden />
                  Blue = on the Daily list
                </span>
                <Pager page={page} pages={pages} onPage={setStepPage} className="ml-auto" />
              </div>
              <AddStep key={routine.id} onAdd={addStep} />

              {/* When it happens, how long, the Daily list, and who sees it */}
              <div className="mt-auto flex shrink-0 flex-col gap-[0.7rem] border-t border-frame pt-[0.9rem]">
                <Field label="When">
                  <Toggle
                    label="When"
                    value={routine.anchor}
                    options={(Object.keys(ANCHOR_LABEL) as Anchor[]).map((a) => ({ value: a, label: ANCHOR_LABEL[a] }))}
                    onChange={(anchor) =>
                      setRoutine({
                        anchor,
                        usual_start: anchor === "clock" ? (routine.usual_start ?? "16:00") : routine.usual_start,
                        anchor_meal_time_id: anchor === "meal" ? (routine.anchor_meal_time_id ?? mealTimes[0]?.id ?? null) : routine.anchor_meal_time_id,
                      })
                    }
                  />
                </Field>
                <div className="flex flex-wrap items-end gap-[0.8rem]">
                  {routine.anchor === "meal" ? (
                    <Field label="Which mealtime" className="min-w-[10rem] flex-1">
                      <select value={routine.anchor_meal_time_id ?? ""} onChange={(e) => setRoutine({ anchor_meal_time_id: e.target.value || null })} className={inputClass}>
                        {mealTimes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  {routine.anchor === "clock" ? (
                    <Field label="Starts at" className="w-[10.5rem]">
                      <input type="time" value={routine.usual_start ?? ""} onChange={(e) => setRoutine({ usual_start: e.target.value || null })} className={inputClass} />
                    </Field>
                  ) : (
                    <Field label={routine.anchor === "bed" ? "Before bed (min)" : "Gap (min)"} className="w-[10rem]">
                      <NumberField value={routine.anchor_offset} min={0} max={240} onChange={(v) => setRoutine({ anchor_offset: v })} />
                    </Field>
                  )}
                  <Field label="Minutes" className="w-[7rem]">
                    <NumberField value={routine.usual_minutes} min={5} max={240} onChange={(v) => setRoutine({ usual_minutes: v })} />
                  </Field>
                  <span className="ml-auto flex gap-[0.6rem]">
                    <Switch on={routine.loose} onClick={() => setRoutine({ loose: !routine.loose })} label="Loose" hint="A loose routine can move to fit the day" />
                    <Switch on={Boolean(routine.habit_since)} onClick={() => setRoutine({ habit_since: routine.habit_since ? null : today })} label="Track" hint="Track it as a habit" />
                  </span>
                </div>
                <div className="flex items-end gap-[0.8rem]">
                  <Field label={listState === "some" ? "Daily list: some" : "On the Daily list"} className="w-[11rem]">
                    <Toggle
                      label="On the Daily list"
                      value={listState === "all" ? "on" : listState === "some" ? null : "off"}
                      options={[
                        { value: "on", label: "On" },
                        { value: "off", label: "Off" },
                      ]}
                      onChange={(v) => setWholeDailyList(v === "on")}
                    />
                  </Field>
                  <Field label="Who can see it" className="flex-1">
                    <Toggle label="Who can see it" value={routine.visibility} options={VISIBILITY} onChange={(v) => setRoutine({ visibility: v })} />
                  </Field>
                </div>
              </div>
            </>
          ) : mealBlock ? (
            <MealEditor
              key={mealBlock.id}
              meal={mealBlock}
              uses={draft.mealUses
                .filter((u) => u.meal_id === mealBlock.id)
                .map((u) => ({ id: u.id, member: members.find((m) => m.id === u.member_id), dayType: dayTypes.find((t) => t.id === u.day_type_id) }))}
              choices={mealChoices}
              weekStartsOn={weekStartsOn}
              onChange={(patch) => setMeal(mealBlock.id, patch)}
              onRemoveUse={removeMealUse}
              onRemove={removeMeal}
              view={view}
            />
          ) : (
            <EmptyState emoji="📝" hint="Tap a routine or a meal to change it." />
          )}
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

const fieldClass = inputClass;
/** A round grey icon button in the editor's title row (save as template, delete). */
const iconButtonClass = "flex size-12 shrink-0 items-center justify-center rounded-full bg-panel text-ink";

/** A step's small icon buttons: plain grey ink, blue when on the Daily list, green when tracked as a habit. */
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
  tone?: "plain" | "on" | "list";
  children: React.ReactNode;
}) {
  const look =
    tone === "on"
      ? "bg-[color-mix(in_srgb,var(--color-success)_14%,white)] text-success"
      : tone === "list"
        ? "bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] text-accent"
        : "bg-transparent text-ink-soft hover:bg-rail";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-12 shrink-0 items-center justify-center rounded-[var(--radius)] disabled:opacity-30 ${look}`}
    >
      {children}
    </button>
  );
}

/** A labelled field in the editor: small grey label above, the control below. */
function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-[0.35rem] ${className}`}>
      <span className={fieldLabelClass}>{label}</span>
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
      className={`${fieldClass} tabular`}
    />
  );
}

function Switch({ on, partly = false, onClick, label, hint }: { on: boolean; partly?: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={partly ? "mixed" : on}
      onClick={onClick}
      title={hint}
      className={`flex min-h-[var(--touch-target)] shrink-0 items-center gap-2.5 rounded-[var(--radius)] px-3 text-[1.25rem] font-bold ${on ? "bg-[color-mix(in_srgb,var(--color-success)_12%,white)] text-success" : "bg-panel text-ink"}`}
    >
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${on ? "justify-end bg-success" : partly ? "justify-center bg-[color-mix(in_srgb,var(--color-success)_55%,white)]" : "justify-start bg-check-border"}`}
        aria-hidden
      >
        <span className="size-5 rounded-full bg-white" />
      </span>
      {label}
    </button>
  );
}

/**
 * Who has this routine (or meal) on the kind of day on screen, each with an
 * × to take it off. Other kinds of day are named on one line after them;
 * pick that kind of day in the header to change those (so the list never
 * grows past a line or two).
 */
function UseChips({
  uses,
  view,
  onRemove,
}: {
  uses: { id: string; member: ManagerMember | undefined; dayType: ManagerDayType | undefined }[];
  view: string;
  onRemove: (id: string) => void;
}) {
  const here = uses.filter((u) => u.dayType?.name === view);
  const elsewhere = [...new Set(uses.filter((u) => u.dayType?.name !== view).map((u) => u.dayType?.name ?? "?"))];
  return (
    <>
      {here.map(({ id, member }) => {
        const look = whoChipStyle(member?.colour, true);
        return (
          <span key={id} className={`${look.className} min-h-12! gap-[0.3rem]! pr-0 pl-3! text-lg!`} style={look.style}>
            <ColourDot colour={member?.colour} className="size-[0.9rem]" />
            <span className="truncate">{member?.name ?? "?"}</span>
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`Take it off ${member?.name}'s ${view}`}
              className="-my-1 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-board/60"
            >
              <X size="1.125rem" weight="bold" aria-hidden />
            </button>
          </span>
        );
      })}
      {elsewhere.length > 0 ? (
        <span className="min-w-0 basis-full truncate text-lg font-semibold text-ink-muted" title={elsewhere.join(", ")}>
          {here.length > 0 ? "Also on " : "On "}
          {elsewhere.join(", ")}
        </span>
      ) : null}
    </>
  );
}

/**
 * Who does a step in a shared routine: a chip with their colour dots (a
 * group sign for everyone); tap to pick people.
 */
function StepWho({
  step,
  people,
  chosen,
  open,
  onOpen,
  onToggle,
}: {
  step: DraftStep;
  people: ManagerMember[];
  chosen: string[];
  open: boolean;
  onOpen: () => void;
  onToggle: (memberId: string) => void;
}) {
  const everyone = chosen.length === 0;
  const faces = people.filter((p) => chosen.includes(p.id));
  const one = faces.length === 1 ? faces[0] : null;
  const look = whoChipStyle(one?.colour ?? null, Boolean(one));
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        aria-label={`Who does ${step.text}: ${everyone ? "everyone" : faces.map((p) => p.name).join(", ")}`}
        className={`${look.className} max-w-[9rem] shrink-0 px-3! ${open ? "border-ink!" : ""}`}
        style={look.style}
      >
        {everyone ? (
          <>
            <Users size="1.25rem" weight="bold" aria-hidden />
            <span>All</span>
          </>
        ) : one ? (
          <>
            <ColourDot colour={one.colour} />
            <span className="truncate">{one.name}</span>
          </>
        ) : (
          <span className="flex -space-x-1">
            {faces.slice(0, 4).map((p) => (
              <ColourDot key={p.id} colour={p.colour} className="size-[1.15rem] ring-2 ring-board" />
            ))}
          </span>
        )}
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 mt-1 flex flex-wrap items-center gap-1.5 rounded-[var(--radius-card)] bg-board p-2 shadow-dialog">
          <span className={`px-1 ${fieldLabelClass}`}>Who does it?</span>
          {people.map((p) => {
            const on = everyone || chosen.includes(p.id);
            const chip = whoChipStyle(p.colour, on);
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => onToggle(p.id)} className={`${chip.className} ${on ? "" : "text-ink-muted!"}`} style={chip.style}>
                <ColourDot colour={p.colour} />
                {p.name}
              </button>
            );
          })}
          <button type="button" onClick={onOpen} aria-label="Done" className="flex size-12 items-center justify-center rounded-full bg-panel text-ink">
            <X size="1.125rem" weight="bold" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
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
    <div className="mt-[0.7rem] flex shrink-0 items-center gap-2">
      <EmojiPicker key={round} initial="" fieldName="" nameText={text} onChange={setIcon} label="Picture for the new step" className="size-12! self-center!" fullScreen />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        maxLength={80}
        placeholder="Add a step"
        aria-label="Add a step"
        className={`${inputClass} flex-1 placeholder:text-ink-muted`}
      />
      <button type="button" onClick={add} disabled={!text.trim()} className={`${primaryActionClass} disabled:opacity-40`}>
        <Plus size="1.25rem" weight="bold" aria-hidden />
        Add
      </button>
    </div>
  );
}

const ADD_PER_PAGE = 5;

/**
 * The + above a column: share a routine someone already has (it's the
 * same routine, so changing it changes it for everyone), or start a new
 * one from a template (a copy you then change on its own).
 */
function AddExisting({
  meals,
  onPickMeal,
  onNewMeal,
  routines,
  templates,
  onPick,
  onStartFrom,
  onEditTemplate,
  onClose,
}: {
  /** Meal blocks this column doesn't have yet. */
  meals: DraftMealBlock[];
  onPickMeal: (id: string) => void;
  onNewMeal: () => void;
  routines: DraftRoutine[];
  templates: DraftRoutine[];
  onPick: (id: string) => void;
  onStartFrom: (id: string) => void;
  onEditTemplate: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"share" | "template" | "meal">(templates.length > 0 && routines.length === 0 ? "template" : "share");
  const [page, setPage] = useState(0);
  if (tab === "meal") {
    // A row for "New meal", then the meal blocks to share.
    const per = ADD_PER_PAGE - 1;
    const mealPages = Math.max(1, Math.ceil(meals.length / per));
    const p = Math.min(page, mealPages - 1);
    return (
      <div className="absolute top-1 right-0 z-40 flex w-[max(100%,28rem)] flex-col gap-1 rounded-[var(--radius-card)] bg-board p-2 shadow-dialog">
        <AddTabs tab={tab} setTab={(t) => (setTab(t), setPage(0))} onClose={onClose} />
        <button type="button" onClick={onNewMeal} className="flex min-h-12 items-center gap-2 rounded-[var(--radius)] bg-meal px-2 text-left text-lg font-bold text-meal-ink">
          <Plus size="1rem" weight="bold" aria-hidden />
          New mealtime
        </button>
        {meals.slice(p * per, p * per + per).map((m) => (
          <button key={m.id} type="button" onClick={() => onPickMeal(m.id)} className="flex min-h-12 min-w-0 items-center gap-2 rounded-[var(--radius)] px-2 text-left text-lg font-bold text-ink hover:bg-rail">
            <Emoji emoji={m.icon ?? "🍽️"} className="size-6" />
            <span className="truncate">{m.name || "Meal"}</span>
          </button>
        ))}
        {meals.length === 0 ? <p className="px-1 text-lg text-ink-muted">Nothing to add</p> : null}
        <Pager page={p} pages={mealPages} onPage={setPage} />
      </div>
    );
  }
  const list = tab === "share" ? routines : templates;
  const pages = Math.max(1, Math.ceil(list.length / ADD_PER_PAGE));
  const shown = list.slice(page * ADD_PER_PAGE, page * ADD_PER_PAGE + ADD_PER_PAGE);
  return (
    <div className="absolute top-1 right-0 z-40 flex w-[max(100%,28rem)] flex-col gap-1 rounded-[var(--radius-card)] bg-board p-2 shadow-dialog">
      <AddTabs tab={tab} setTab={(t) => (setTab(t), setPage(0))} onClose={onClose} />
      {shown.length === 0 ? (
        <p className="px-1 text-lg text-ink-muted">
          {tab === "share"
            ? "Nothing to add"
            : "No templates yet"}
        </p>
      ) : null}
      {shown.map((r) => (
        <div key={r.id} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => (tab === "share" ? onPick(r.id) : onStartFrom(r.id))}
            className="flex min-h-12 min-w-0 flex-1 items-center rounded-[var(--radius)] px-2 text-left text-lg font-bold text-ink hover:bg-rail"
          >
            <span className="truncate">{r.name || "Untitled"}</span>
          </button>
          {tab === "template" ? (
            <button type="button" onClick={() => onEditTemplate(r.id)} className="min-h-12 shrink-0 rounded-[var(--radius)] bg-rail px-2.5 text-lg font-bold text-ink">
              Edit
            </button>
          ) : null}
        </div>
      ))}
      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  );
}

/** The + popover's tabs: share a routine, start from a template, or add a meal. */
function AddTabs({ tab, setTab, onClose }: { tab: "share" | "template" | "meal"; setTab: (t: "share" | "template" | "meal") => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex min-w-0 flex-1 gap-1 rounded-[var(--radius)] bg-panel p-1">
      {(["share", "template", "meal"] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={tab === t}
          onClick={() => setTab(t)}
          className={`min-h-12 flex-1 rounded-[var(--radius)] px-1.5 text-lg font-bold whitespace-nowrap ${tab === t ? "bg-board text-ink shadow-raised" : "text-ink-muted"}`}
        >
          {t === "share" ? "Share one" : t === "template" ? "Template" : "Mealtime"}
        </button>
      ))}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rail text-ink">
        <X size="1rem" weight="bold" aria-hidden />
      </button>
    </div>
  );
}

const GRID_GAP = "0.5rem";

/**
 * A block on the grid (mock: .blk): a rounded pastel tile with its name in
 * bold print, at least 3rem tall so the name always fits. Tapped: an ink
 * ring, and only then do the grab marks for stretching show.
 */
function blockClass(active: boolean): string {
  return `pointer-events-auto absolute z-[1] flex min-h-[3rem] touch-none items-center overflow-hidden rounded-[0.7rem] px-[0.6rem] text-left select-none ${
    active ? "z-[2] shadow-[inset_0_0_0_2px_var(--color-ink)]" : "[&_.handle-mark]:opacity-0"
  }`;
}

/** Where a block sits: its columns (inset a little), from its start for as long as it lasts. */
function blockBox(box: { left: string; width: string }, start: number, minutes: number, first: number, span: number) {
  return {
    left: `calc(${box.left} + 0.15rem)`,
    width: `calc(${box.width} - 0.3rem)`,
    top: `calc(${((start - first * 60) / span) * 100}% + 1px)`,
    height: `calc(${(minutes / span) * 100}% - 2px)`,
  };
}

/** A block's printed name; while it's being dragged, the time it would land on. */
function BlockText({ name, time }: { name: string; time: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2 leading-[1.15]">
      <span className="truncate text-[1.25rem] font-extrabold">{name}</span>
      {time ? <span className="tabular shrink-0 text-lg font-bold opacity-80">{time}</span> : null}
    </span>
  );
}

/**
 * A meal block (Lunch, Dinner) on the grid, over the columns of everyone who
 * has it at that time. Tap to edit; drag to move it (for everyone who has
 * it); drag the bottom edge for how long eating takes, and the sides to give
 * it to more columns (or fewer). Moving a meal on the calendar changes only
 * that day; this is its usual time.
 */
function MealRun({
  meal,
  run,
  columns,
  active,
  first,
  last,
  timeLabel,
  onSelect,
  onTime,
  onSpread,
}: {
  meal: DraftMealBlock;
  run: GridRun<{ routineId: string; start: number; end: number }>;
  columns: string[];
  active: boolean;
  first: number;
  last: number;
  timeLabel: (minutes: number) => string;
  onSelect: () => void;
  onTime: (start: number, minutes: number) => void;
  onSpread: (range: [number, number]) => void;
}) {
  const drag = useTimelineDrag({
    first,
    last,
    placement: { start: run.start, minutes: run.end - run.start, day: columns[run.c0] },
    onTap: onSelect,
    onDrop: (p) => onTime(p.start, p.minutes),
  });
  const [spreading, setSpreading] = useState<[number, number] | null>(null);
  const span = (last - first) * 60;
  const start = drag.shown.start;
  const minutes = drag.shown.minutes;
  const tall = minutes;
  const box = spanBox(spreading?.[0] ?? run.c0, spreading?.[1] ?? run.c1, columns.length, GRID_GAP);
  return (
    <div
      {...drag.bodyHandlers}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className={`${blockClass(active)} cursor-grab bg-meal text-meal-ink active:cursor-grabbing ${drag.dragging || spreading ? "z-30 shadow-dialog" : ""}`}
      style={blockBox(box, start, tall, first, span)}
    >
      <BlockText name={meal.name || "Meal"} time={drag.dragging ? timeLabel(start) : null} />
      <SideHandles byDay fullHeight columns={columns} c0={run.c0} c1={run.c1} onPreview={setSpreading} onDone={onSpread} />
      <div {...drag.handleHandlers} aria-hidden className="absolute inset-x-4 bottom-0 flex h-3 cursor-ns-resize touch-none items-end justify-center pb-0.5">
        <span className="handle-mark h-1 w-8 rounded-full bg-meal-ink/40" />
      </div>
    </div>
  );
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHOICES_PER_PAGE = 11;

/**
 * The editor for a meal block: its name, picture, usual time and length,
 * who has it, and what goes on it each weekday (Tuesday dinner is Tacos).
 * Presets fill the weekly review; each day can still be changed there.
 */
function MealEditor({
  meal,
  uses,
  choices,
  weekStartsOn,
  onChange,
  onRemoveUse,
  onRemove,
  view,
}: {
  meal: DraftMealBlock;
  uses: { id: string; member: ManagerMember | undefined; dayType: ManagerDayType | undefined }[];
  choices: MealChoices;
  weekStartsOn: 0 | 1;
  onChange: (patch: Partial<DraftMealBlock>) => void;
  onRemoveUse: (id: string) => void;
  onRemove: () => void;
  view: string;
}) {
  const [day, setDay] = useState<number | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);
  const look = (value: string | null) => {
    if (!value) return null;
    const id = value.slice(2);
    const found = value.startsWith("c:") ? choices.kinds.find((k) => k.id === id) : choices.meals.find((m) => m.id === id);
    return found ? { name: found.name, icon: found.icon } : null;
  };
  const setPreset = (weekday: number, value: string | null) => onChange({ presets: meal.presets.map((p, i) => (i === weekday ? value : p)) });
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-[0.6rem]">
        <EmojiPicker
          initial={meal.icon ?? ""}
          fieldName=""
          nameText={meal.name}
          onChange={(icon) => onChange({ icon: icon || null })}
          label={`Picture for ${meal.name || "this meal"}`}
          className="size-12! self-center!"
          fullScreen
        />
        <input
          value={meal.name}
          onChange={(e) => onChange({ name: e.target.value })}
          maxLength={30}
          aria-label="Mealtime name"
          className="min-h-[var(--touch-target)] min-w-0 flex-1 rounded-[var(--radius)] border-2 border-transparent bg-transparent px-1.5 text-[1.85rem] font-extrabold tracking-[-0.02em] text-ink outline-none hover:border-frame focus:border-ink"
        />
        <button type="button" onClick={onRemove} aria-label="Delete this mealtime" title="Delete this mealtime" className={`${iconButtonClass} text-danger`}>
          <Trash size="1.5rem" weight="bold" aria-hidden />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className={fieldLabelClass}>{uses.length === 0 ? "Nobody yet" : "Eaten by"}</span>
        <UseChips uses={uses} view={view} onRemove={onRemoveUse} />
      </div>

      <div className="mt-4 flex items-end gap-[0.8rem]">
        <Field label="Usually at" className="w-[11rem]">
          <input type="time" value={meal.usual_time} onChange={(e) => e.target.value && onChange({ usual_time: e.target.value })} className={fieldClass} />
        </Field>
        <Field label="Eating takes (min)" className="w-[11rem]">
          <NumberField value={meal.minutes} min={MEAL_MINUTES.min} max={MEAL_MINUTES.max} onChange={(v) => onChange({ minutes: v })} />
        </Field>
      </div>

      <h3 className="mt-5 text-[1.5rem] font-extrabold text-ink">Every week</h3>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const chosen = look(meal.presets[d]);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-label={`${WEEKDAY_SHORT[d]}: ${chosen?.name ?? "nothing set"}`}
              className={`flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius)] px-1 ${chosen ? "bg-meal text-meal-ink" : "border-2 border-dashed border-frame text-ink-muted hover:bg-rail"}`}
            >
              <span className="text-lg font-extrabold">{WEEKDAY_SHORT[d]}</span>
              {chosen ? <Emoji emoji={chosen.icon ?? "🍽️"} className="size-9" /> : <Plus size="1.5rem" weight="bold" aria-hidden />}
              <span className="w-full truncate text-center text-lg font-bold">{chosen?.name ?? ""}</span>
            </button>
          );
        })}
      </div>

      {day !== null ? <PresetChooser weekday={WEEKDAY_SHORT[day]} mealName={meal.name} current={meal.presets[day]} choices={choices} onPick={(v) => (setPreset(day, v), setDay(null))} onClose={() => setDay(null)} /> : null}
    </div>
  );
}

/** Choosing a weekday's preset: a kind of meal, or one meal. Covers the editor; pages instead of scrolling. */
function PresetChooser({
  weekday,
  mealName,
  current,
  choices,
  onPick,
  onClose,
}: {
  weekday: string;
  mealName: string;
  current: string | null;
  choices: MealChoices;
  onPick: (value: string | null) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  // One list, no tabs: the categories (Tacos, Pasta) first, then single meals (Connor, 2026-11-11: no word for categories).
  const list = [
    ...choices.kinds.map((k) => ({ value: `c:${k.id}`, name: k.name, icon: k.icon })),
    ...choices.meals.map((m) => ({ value: `m:${m.id}`, name: m.name, icon: m.icon })),
  ];
  const pages = Math.max(1, Math.ceil(list.length / CHOICES_PER_PAGE));
  const p = Math.min(page, pages - 1);
  const tile = "flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius)] border-2 px-1.5 text-center";
  return (
    <div role="dialog" aria-label={`${weekday} ${mealName}`} className="absolute inset-0 z-20 flex flex-col gap-3 bg-board">
      <div className="flex shrink-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[1.75rem] font-extrabold text-ink">
          {weekday} {mealName.toLowerCase() || "meal"}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-12 items-center justify-center rounded-full bg-panel text-ink">
          <X size="1.25rem" weight="bold" aria-hidden />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-2">
        <button type="button" onClick={() => onPick(null)} className={`${tile} ${current === null ? "border-ink bg-rail" : "border-dashed border-frame hover:bg-rail"}`}>
          <X size="1.75rem" weight="bold" aria-hidden className="text-ink-muted" />
          <span className="text-lg font-bold text-ink">Nothing</span>
        </button>
        {list.slice(p * CHOICES_PER_PAGE, (p + 1) * CHOICES_PER_PAGE).map((c) => (
          <button key={c.value} type="button" onClick={() => onPick(c.value)} className={`${tile} ${c.value === current ? "border-meal-ink bg-meal" : "border-frame hover:bg-rail"}`}>
            <Emoji emoji={c.icon ?? "🍽️"} className="size-10" />
            <span className="line-clamp-2 text-lg font-bold text-ink">{c.name}</span>
          </button>
        ))}
      </div>
      <Pager page={p} pages={pages} onPage={setPage} className="justify-center" />
    </div>
  );
}

/**
 * A routine on the manager's grid, covering one column or several
 * neighbouring ones (people doing it together, or kinds of day it's on).
 * Tap to edit. Drag a set-time routine up or down to move it; routines
 * tied to wake-up, a meal or bedtime stay put. Drag the bottom edge to
 * change how long it takes, and the sides to spread it over more columns
 * (or fewer).
 */
function RoutineRun({
  routine,
  run,
  columns,
  colours,
  active,
  first,
  last,
  timeLabel,
  onSelect,
  onTime,
  onSpread,
}: {
  routine: DraftRoutine;
  run: GridRun<{ routineId: string; start: number; end: number }>;
  columns: string[];
  colours: string[];
  active: boolean;
  first: number;
  last: number;
  timeLabel: (minutes: number) => string;
  onSelect: () => void;
  onTime: (start: number, minutes: number) => void;
  onSpread: (range: [number, number]) => void;
}) {
  const drag = useTimelineDrag({
    first,
    last,
    placement: { start: run.start, minutes: run.end - run.start, day: columns[run.c0] },
    onTap: onSelect,
    onDrop: (p) => onTime(p.start, p.minutes),
  });
  const [spreading, setSpreading] = useState<[number, number] | null>(null);
  const span = (last - first) * 60;
  const start = drag.shown.start;
  const minutes = drag.shown.minutes;
  const tall = minutes;
  const box = spanBox(spreading?.[0] ?? run.c0, spreading?.[1] ?? run.c1, columns.length, GRID_GAP);
  const movable = routine.anchor === "clock";
  // One person: their pastel and ink. Shared by several: their pastels side by side, in dark ink.
  const background = colours.length > 1 ? `linear-gradient(90deg, ${colours.map((c) => soft(c)).join(", ")})` : soft(colours[0]);
  const ink = colours.length > 1 ? "var(--color-ink)" : hand(colours[0]);
  return (
    <div
      {...(movable ? drag.bodyHandlers : { onClick: onSelect })}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className={`${blockClass(active)} ${movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${drag.dragging || spreading ? "z-30 shadow-dialog" : ""}`}
      style={{ ...blockBox(box, start, tall, first, span), background, color: ink }}
    >
      <BlockText name={routine.name || "Untitled"} time={drag.dragging ? `${timeLabel(start)}–${timeLabel(start + minutes)}` : null} />
      <SideHandles byDay fullHeight columns={columns} c0={run.c0} c1={run.c1} onPreview={setSpreading} onDone={onSpread} />
      {/* A thin strip along the bottom: drag it to change how long it takes. */}
      <div {...drag.handleHandlers} aria-hidden className="absolute inset-x-4 bottom-0 flex h-3 cursor-ns-resize touch-none items-end justify-center pb-0.5">
        <span className="handle-mark h-1 w-8 rounded-full bg-current opacity-40" />
      </div>
    </div>
  );
}
