"use client";

import { Pager as PageArrows } from "@/components/pager";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, CalendarCheck, Car, Check, Plus, SunHorizon, Trash, Umbrella, X } from "@phosphor-icons/react";
import { Avatar, Emoji } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { soft, strong } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import { LEAD_UNITS, leadLabel, leadMinutes, type LeadUnit } from "@/lib/heads-ups";
import {
  MAX_KIND_HEADS_UPS,
  NEW_PREFIX,
  addWeekPlan,
  daysProblem,
  groupKey,
  groupsOf,
  pickWeek,
  removeDayType,
  removeWeekPlan,
  sameDays,
  takeTurns,
  type DaysDraft,
  type DraftBreak,
  type DraftBreakPerson,
  type DraftDayType,
  type DraftHeadsUp,
} from "@/lib/set-days";
import { saveSetDays } from "./actions";

/*
 * Set days: when everyone gets up and goes to bed, and which kind of day
 * each day is. Three tabs:
 *
 *   Week          a grid of people and weekdays; tap a day to change it.
 *   Kinds of day  each kind of day, who has it, and their wake-up and bedtime.
 *   Breaks        holidays and the like: a few dates with other kinds of day.
 *
 * Every change stays on the screen until Save (one Save for the page), and
 * leaving with changes asks first. Nothing scrolls: long lists page.
 */

export type DaysMember = { id: string; name: string; colour: string; icon: string | null };
export type Tab = "week" | "kinds" | "breaks";

const ROWS_PER_PAGE = 8;
const BREAKS_PER_PAGE = 6;

let counter = 0;
const newId = () => `${NEW_PREFIX}${Date.now().toString(36)}-${(counter += 1)}`;

export function SetDays({
  initial,
  members,
  routineCounts,
  weekdays,
  today,
  locale,
  startTab,
}: {
  initial: DaysDraft;
  members: DaysMember[];
  /** How many routines each kind of day has (they go when it's removed). */
  routineCounts: Record<string, number>;
  /** Weekdays in the household's order: 0 = Sunday. */
  weekdays: { value: number; short: string; long: string }[];
  today: string;
  locale: string;
  startTab: Tab;
}) {
  const [draft, setDraft] = useState<DaysDraft>(initial);
  const [tab, setTab] = useState<Tab>(startTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameDays(draft, initial);
  const guard = useUnsavedChanges(dirty, () => setDraft(initial));
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  const update = (change: (d: DaysDraft) => DaysDraft) => {
    setError(null);
    setDraft((d) => change(d));
  };
  const save = async (then?: string | null) => {
    const problem = daysProblem(draft, names);
    if (problem) {
      setError(problem);
      guard.stay();
      return;
    }
    setSaving(true);
    const result = await saveSetDays(draft, initial.breaks.map((b) => b.id));
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
  };

  // Routines that go with kinds of day taken away.
  const removedTypes = initial.dayTypes.filter((t) => !draft.dayTypes.some((d) => d.id === t.id));
  const losing = removedTypes.reduce((n, t) => n + (routineCounts[t.id] ?? 0), 0);

  const dateLabel = (d: string, withDay = false) =>
    new Intl.DateTimeFormat(locale, { ...(withDay ? { weekday: "short" } : {}), month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 lg:h-18 lg:flex-nowrap">
        <h1 className="text-3xl font-extrabold tracking-[-0.03rem] text-ink lg:text-5xl">Set days</h1>
        <nav aria-label="What to set" className="flex gap-1 rounded-2xl bg-panel p-1.25">
          {(
            [
              ["week", "Week", CalendarCheck],
              ["kinds", "Kinds of day", SunHorizon],
              ["breaks", "Breaks", Umbrella],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => {
                setTab(value);
                // Keep the tab in the address, so it stays after Save.
                window.history.replaceState(null, "", `?tab=${value}`);
              }}
              className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-xl px-4 text-base font-bold ${
                tab === value ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"
              }`}
            >
              <Icon size="1.375rem" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <Link
          href="/routines"
          className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl bg-rail px-5 text-base font-bold text-ink hover:bg-panel"
        >
          <ArrowLeft size="1.5rem" aria-hidden />
          Routine Manager
        </Link>
        <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "week" ? <WeekTab draft={draft} update={update} members={members} weekdays={weekdays} today={today} /> : null}
        {tab === "kinds" ? <KindsTab draft={draft} update={update} members={members} setError={setError} /> : null}
        {tab === "breaks" ? <BreaksTab draft={draft} update={update} members={members} today={today} dateLabel={dateLabel} /> : null}
      </div>

      {losing > 0 ? (
        <p className="shrink-0 text-base font-bold text-danger">
          Saving also takes {losing === 1 ? "1 routine" : `${losing} routines`} off the kinds of day you removed.
        </p>
      ) : null}

      {guard.leaving ? (
        <LeaveDialog what="some days" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} />
      ) : null}
    </>
  );
}

type TabProps = {
  draft: DaysDraft;
  update: (change: (d: DaysDraft) => DaysDraft) => void;
  members: DaysMember[];
};

// ---------------------------------------------------------------------------
// Week: people down the side, weekdays across the top
// ---------------------------------------------------------------------------

function WeekTab({ draft, update, members, weekdays, today }: TabProps & { weekdays: { value: number; short: string; long: string }[]; today: string }) {
  const rows = members.flatMap((m) => draft.weekPlans.filter((p) => p.member_id === m.id).map((plan) => ({ member: m, plan })));
  const [page, setPage] = useState(0);
  const [rowsRef, rowsPerPage] = useFitRows<HTMLDivElement>(ROWS_PER_PAGE);
  const [picking, setPicking] = useState<{ plan: string; weekday: number } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * rowsPerPage, at * rowsPerPage + rowsPerPage);
  const selected = rows.find((r) => r.plan.id === chosen) ?? null;

  const setDay = (planId: string, weekday: number, dayTypeId: string) =>
    update((d) => ({ ...d, planDays: d.planDays.map((x) => (x.plan_id === planId && x.weekday === weekday ? { ...x, day_type_id: dayTypeId } : x)) }));

  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section aria-label="The week" className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-frame bg-board px-5 py-4">
        <div className="grid shrink-0 grid-cols-[13rem_repeat(7,minmax(0,1fr))] gap-1.5 pb-2">
          <span className="text-base font-bold text-ink-muted">Tap a day to change it</span>
          {weekdays.map((w) => (
            <span key={w.value} className="text-center text-lg font-bold text-ink" title={w.long}>
              {w.short}
            </span>
          ))}
        </div>
        <div ref={rowsRef} className="flex min-h-0 flex-1 flex-col gap-1.5">
          {shown.map(({ member, plan }, rowIndex) => {
            const plans = draft.weekPlans.filter((p) => p.member_id === member.id);
            const settings = draft.members.find((x) => x.member_id === member.id);
            const status = plans.length < 2 ? null : settings?.rotate ? "turns" : (settings?.current_week_plan_id ?? plans[0].id) === plan.id ? "in use" : "not used";
            const types = draft.dayTypes.filter((t) => t.member_id === member.id);
            return (
              <div key={plan.id} className="grid max-h-28 min-h-16 flex-1 grid-cols-[13rem_repeat(7,minmax(0,1fr))] gap-1.5">
                <button
                  type="button"
                  onClick={() => setChosen(chosen === plan.id ? null : plan.id)}
                  aria-pressed={chosen === plan.id}
                  className={`flex min-h-16 min-w-0 items-center gap-2.5 rounded-2xl px-2 text-left ${chosen === plan.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
                >
                  <Avatar name={member.name} colour={member.colour} icon={member.icon} size="md" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-lg font-bold text-ink">{member.name}</span>
                    <span className="truncate text-sm font-semibold text-ink-muted" title={`${plan.name}${status ? `, ${status}` : ""}`}>
                      {plan.name || "Untitled"}
                      {status ? ` · ${status}` : ""}
                    </span>
                  </span>
                </button>
                {weekdays.map((w) => {
                  const typeId = draft.planDays.find((d) => d.plan_id === plan.id && d.weekday === w.value)?.day_type_id;
                  const type = types.find((t) => t.id === typeId);
                  const open = picking?.plan === plan.id && picking.weekday === w.value;
                  return (
                    <div key={w.value} className="relative min-w-0">
                      <button
                        type="button"
                        onClick={() => setPicking(open ? null : { plan: plan.id, weekday: w.value })}
                        aria-expanded={open}
                        aria-label={`${member.name}, ${w.long}: ${type?.name ?? "not set"}. Change`}
                        className="flex h-full min-h-16 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 text-ink"
                        style={{ borderColor: open ? "var(--color-ink)" : "transparent", background: soft(member.colour) }}
                      >
                        {type?.icon ? <Emoji emoji={type.icon} className="size-8" /> : null}
                        <span className="w-full truncate text-center text-base font-bold">{type?.name ?? "?"}</span>
                      </button>
                      {open ? (
                        <div
                          className={`absolute z-20 flex w-56 flex-col gap-1 rounded-2xl border border-frame bg-board p-2 shadow-[0_0.5rem_2rem_rgba(30,35,45,0.18)] ${
                            rowIndex >= shown.length / 2 && rowIndex > 1 ? "bottom-full mb-1" : "top-full mt-1"
                          } ${w === weekdays[6] || w === weekdays[5] ? "right-0" : "left-0"}`}
                        >
                          <span className="px-1 text-sm font-bold text-ink-muted">
                            {member.name}&rsquo;s {w.long}
                          </span>
                          {types.slice(0, 7).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setDay(plan.id, w.value, t.id);
                                setPicking(null);
                              }}
                              className={`flex min-h-11 items-center gap-2 rounded-xl px-2 text-left text-base font-bold text-ink ${t.id === typeId ? "bg-rail" : "hover:bg-rail"}`}
                            >
                              {t.icon ? <Emoji emoji={t.icon} className="size-6" /> : <span className="size-6" />}
                              <span className="min-w-0 flex-1 truncate">{t.name || "Untitled"}</span>
                              {t.id === typeId ? <Check size="1.125rem" weight="bold" aria-hidden /> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {pages > 1 ? <Pager page={at} pages={pages} setPage={setPage} /> : null}
      </section>

      <WeeksPanel draft={draft} update={update} row={selected} today={today} onAdded={setChosen} />
    </div>
  );
}

/** The weeks of the person picked in the grid: use one, take turns, add or remove. */
function WeeksPanel({
  draft,
  update,
  row,
  today,
  onAdded,
}: Pick<TabProps, "draft" | "update"> & { row: { member: DaysMember; plan: { id: string; name: string } } | null; today: string; onAdded: (id: string) => void }) {
  if (!row) {
    return (
      <section className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-frame bg-board p-6 text-center">
        <Emoji emoji="🗓️" className="size-16" />
        <p className="text-xl font-bold text-ink">Tap someone&rsquo;s name</p>
        <p className="text-base text-ink-muted">
          To give them another week, like a night shift week, and swap between weeks or let them take turns.
        </p>
      </section>
    );
  }
  const { member } = row;
  const plans = draft.weekPlans.filter((p) => p.member_id === member.id);
  const settings = draft.members.find((m) => m.member_id === member.id);
  const current = settings?.current_week_plan_id ?? plans[0]?.id;
  const rotate = Boolean(settings?.rotate);
  return (
    <section aria-label={`${member.name}'s weeks`} className="flex min-h-0 flex-col gap-3 rounded-[var(--radius-card)] border border-frame bg-board px-5 py-4">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} colour={member.colour} icon={member.icon} size="lg" />
        <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">{member.name}&rsquo;s weeks</h2>
      </div>
      <div className="flex flex-col gap-2">
        {plans.slice(0, 5).map((p) => (
          <div key={p.id} className={`flex items-center gap-2 rounded-2xl p-1.5 ${p.id === row.plan.id ? "bg-rail" : ""}`}>
            <button
              type="button"
              role="radio"
              aria-checked={!rotate && p.id === current}
              aria-label={`Use ${p.name} every week`}
              disabled={plans.length < 2}
              onClick={() => update((d) => pickWeek(d, member.id, p.id))}
              className="flex size-11 shrink-0 items-center justify-center rounded-full"
            >
              <span className={`flex size-7 items-center justify-center rounded-full border-[2.5px] ${!rotate && p.id === current ? "border-ink bg-ink text-board" : "border-check-border"}`}>
                {!rotate && p.id === current ? <Check size="0.875rem" weight="bold" aria-hidden /> : null}
              </span>
            </button>
            <input
              value={p.name}
              onChange={(e) => update((d) => ({ ...d, weekPlans: d.weekPlans.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) }))}
              maxLength={30}
              aria-label="Week name"
              className="min-h-11 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent"
            />
            {plans.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                title={`Remove ${p.name}`}
                onClick={() => update((d) => removeWeekPlan(d, p.id))}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rail text-danger"
              >
                <Trash size="1.25rem" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <p className="text-base text-ink-muted">
        {plans.length < 2
          ? "Someone with shifts can have more than one week, then swap weeks or let them take turns."
          : rotate
            ? "The weeks take turns, one after another, in this order."
            : "The ticked week is used every week."}
      </p>
      {plans.length > 1 ? (
        <button
          type="button"
          role="switch"
          aria-checked={rotate}
          onClick={() => update((d) => (rotate ? pickWeek(d, member.id, current ?? plans[0].id) : takeTurns(d, member.id, row.plan.id, today)))}
          className={`flex min-h-11 items-center gap-2.5 self-start rounded-2xl px-3 text-base font-bold ${rotate ? "bg-[color-mix(in_srgb,var(--color-success)_12%,white)] text-success" : "bg-rail text-ink"}`}
        >
          <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${rotate ? "justify-end bg-success" : "justify-start bg-check-border"}`} aria-hidden>
            <span className="size-5 rounded-full bg-white" />
          </span>
          Take turns each week{rotate ? "" : ` (${row.plan.name || "this one"} first)`}
        </button>
      ) : null}
      {plans.length < 5 ? (
        <button
          type="button"
          onClick={() => {
            const id = newId();
            update((d) => addWeekPlan(d, member.id, id, plans.length === 1 ? "Second week" : `Week ${plans.length + 1}`, row.plan.id));
            onAdded(id);
          }}
          className="mt-auto flex min-h-[var(--touch-target)] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-frame text-base font-bold text-ink hover:border-ink"
        >
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Another week (a copy of {row.plan.name || "this one"})
        </button>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Kinds of day: one card for each, with who has it and their times
// ---------------------------------------------------------------------------

function KindsTab({ draft, update, members, setError }: TabProps & { setError: (e: string | null) => void }) {
  const groups = groupsOf(draft.dayTypes);
  const perPage = members.length <= 4 ? 6 : 3;
  const [page, setPage] = useState(0);
  // The kind of day whose heads-ups are open, if any.
  const [bells, setBells] = useState<string | null>(null);
  const bellGroup = groups.find((g) => g.group === bells);
  // The "+" card takes one spot on the last page.
  const pages = Math.max(1, Math.ceil((groups.length + 1) / perPage));
  const at = Math.min(page, pages - 1);
  const shown = groups.slice(at * perPage, at * perPage + perPage);
  const roomForAdd = shown.length < perPage;

  const setGroup = (group: string, patch: Partial<DraftDayType>) =>
    update((d) => ({ ...d, dayTypes: d.dayTypes.map((t) => (t.group === group ? { ...t, ...patch } : t)) }));
  const setType = (id: string, patch: Partial<DraftDayType>) => update((d) => ({ ...d, dayTypes: d.dayTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const toggle = (group: string, member: DaysMember) => {
    const mine = draft.dayTypes.find((t) => t.group === group && t.member_id === member.id);
    if (mine) {
      if (!draft.dayTypes.some((t) => t.member_id === member.id && t.id !== mine.id)) {
        setError(`${member.name} needs at least one kind of day.`);
        return;
      }
      update((d) => removeDayType(d, mine.id));
      return;
    }
    const like = draft.dayTypes.find((t) => t.group === group);
    if (!like) return;
    update((d) => ({ ...d, dayTypes: [...d.dayTypes, { ...like, id: newId(), member_id: member.id }] }));
  };
  const removeGroup = (group: string) => {
    const types = draft.dayTypes.filter((t) => t.group === group);
    const stuck = members.find((m) => types.some((t) => t.member_id === m.id) && !draft.dayTypes.some((t) => t.member_id === m.id && t.group !== group));
    if (stuck) {
      setError(`${stuck.name} needs at least one kind of day, so this one can't go.`);
      return;
    }
    update((d) => types.reduce((acc, t) => removeDayType(acc, t.id), d));
  };
  const addGroup = () => {
    const group = `${NEW_PREFIX}${groupKey(String((counter += 1)))}`;
    update((d) => ({
      ...d,
      dayTypes: [...d.dayTypes, ...members.map((m) => ({ id: newId(), member_id: m.id, group, name: "", icon: null, wake: "07:00", bed: "21:30", errands: false }))],
    }));
    setPage(Math.floor(groups.length / perPage));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-base text-ink-muted">
        Each person has their own wake-up and bedtime on each kind of day. Which routines happen on a kind of day is set in the Routine Manager.
      </p>
      <div className={`grid min-h-0 flex-1 gap-4 lg:grid-cols-3 ${perPage === 6 ? "lg:grid-rows-2" : "lg:grid-rows-1"}`}>
        {shown.map((g) => (
          <section key={g.group} aria-label={g.name || "New kind of day"} className="flex min-h-0 min-w-0 flex-col gap-1.5 rounded-[var(--radius-card)] border border-frame bg-board px-4 py-3">
            <div className="flex items-center gap-2">
              <EmojiPicker
                key={g.group}
                initial={g.icon ?? ""}
                fieldName=""
                nameText={g.name}
                onChange={(icon) => setGroup(g.group, { icon: icon || null })}
                label={`Picture for ${g.name || "this kind of day"}`}
                className="size-11! self-center!"
                fullScreen
              />
              <input
                value={g.name}
                onChange={(e) => setGroup(g.group, { name: e.target.value })}
                maxLength={30}
                placeholder="e.g. School day"
                aria-label="Kind of day"
                className="min-h-11 min-w-0 flex-1 rounded-[var(--radius)] border-2 border-transparent bg-transparent px-2 text-xl font-extrabold text-ink outline-none hover:border-frame focus:border-accent"
              />
              <button
                type="button"
                aria-pressed={g.types[0]?.errands ?? false}
                onClick={() => setGroup(g.group, { errands: !(g.types[0]?.errands ?? false) })}
                title="Good for errands: the chore planner puts errands on these days first"
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-dashed border-frame px-3 text-sm font-bold text-ink-muted aria-pressed:border-solid aria-pressed:border-ink aria-pressed:bg-rail aria-pressed:text-ink"
              >
                <Car size="1.25rem" aria-hidden />
                Errands
              </button>
              <button
                type="button"
                onClick={() => setBells(g.group)}
                aria-label={`Heads-ups for ${g.name || "this kind of day"}`}
                title="Heads-ups: a to-do before each of these days, like “Pack a lunch” the night before"
                className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-rail text-ink"
              >
                <Bell size="1.25rem" aria-hidden />
                {draft.headsUps.some((h) => h.group === g.group) ? (
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-ink text-xs font-bold text-board">
                    {draft.headsUps.filter((h) => h.group === g.group).length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => removeGroup(g.group)}
                aria-label={`Remove ${g.name || "this kind of day"}`}
                title="Remove for everyone"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rail text-danger"
              >
                <Trash size="1.25rem" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_8.5rem] items-center gap-x-1.5 px-1 text-sm font-bold text-ink-muted">
              <span>Who has it</span>
              <span>Wake-up</span>
              <span>Bedtime</span>
            </div>
            {members.map((m) => {
              const mine = g.types.find((t) => t.member_id === m.id);
              return (
                <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_8.5rem_8.5rem] items-center gap-x-1.5">
                  <button
                    type="button"
                    aria-pressed={Boolean(mine)}
                    onClick={() => toggle(g.group, m)}
                    className={`flex min-h-11 min-w-0 items-center gap-2 rounded-full border-2 pr-3 pl-1 text-base font-bold ${mine ? "border-transparent text-ink" : "border-dashed border-frame text-ink-muted"}`}
                    style={mine ? { background: soft(m.colour) } : undefined}
                  >
                    <Avatar name={m.name} colour={mine ? m.colour : "grey"} icon={m.icon} size="sm" />
                    <span className="truncate">{m.name}</span>
                  </button>
                  {mine ? (
                    <>
                      <input type="time" value={mine.wake} onChange={(e) => setType(mine.id, { wake: e.target.value })} aria-label={`${m.name} wakes up`} className={timeClass} />
                      <input type="time" value={mine.bed} onChange={(e) => setType(mine.id, { bed: e.target.value })} aria-label={`${m.name} goes to bed`} className={timeClass} />
                    </>
                  ) : (
                    <span className="col-span-2 text-sm text-ink-muted">Tap to give it to {m.name}</span>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        {roomForAdd ? (
          <button
            type="button"
            onClick={addGroup}
            className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-frame text-lg font-bold text-ink hover:border-ink"
          >
            <Plus size="2rem" weight="bold" aria-hidden />
            Kind of day
            <span className="max-w-64 text-center text-sm font-semibold text-ink-muted">For everyone, or just some people. Tap names to choose.</span>
          </button>
        ) : null}
      </div>
      {pages > 1 ? <Pager page={at} pages={pages} setPage={setPage} /> : null}
      {bellGroup ? (
        <KindHeadsUps
          name={bellGroup.name || "this kind of day"}
          headsUps={draft.headsUps.filter((h) => h.group === bellGroup.group)}
          onAdd={(h) => update((d) => ({ ...d, headsUps: [...d.headsUps, { ...h, id: newId(), group: bellGroup.group }] }))}
          onRemove={(id) => update((d) => ({ ...d, headsUps: d.headsUps.filter((h) => h.id !== id) }))}
          onClose={() => setBells(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Heads-ups on a kind of day: each makes a to-do (or a grocery line) a set
 * time before wake-up on every one of those days. Changes wait for Save.
 */
function KindHeadsUps({
  name,
  headsUps,
  onAdd,
  onRemove,
  onClose,
}: {
  name: string;
  headsUps: DraftHeadsUp[];
  onAdd: (h: Omit<DraftHeadsUp, "id" | "group">) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("12");
  const [unit, setUnit] = useState<LeadUnit>("hours");
  const [makes, setMakes] = useState<"todo" | "grocery">("todo");
  const minutes = leadMinutes(Number(amount), unit);
  const add = () => {
    if (!label.trim() || minutes === null) return;
    onAdd({ label: label.trim().slice(0, 80), minutes_before: minutes, makes });
    setLabel("");
  };
  const chip = (on: boolean) =>
    `flex min-h-11 items-center rounded-full border-2 px-4 text-base ${on ? "border-ink bg-rail font-bold text-ink" : "border-frame bg-board text-ink"}`;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(30,35,45,0.35)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Heads-ups for ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[40rem] flex-col gap-4 rounded-[var(--radius-card)] bg-board p-6 shadow-[0_0.5rem_1.375rem_rgba(30,35,45,0.28)]"
      >
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-2xl font-extrabold text-ink">Heads-ups for {name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full bg-rail text-ink">
            <X size="1.25rem" weight="bold" aria-hidden />
          </button>
        </div>
        <p className="text-base text-ink-muted">
          A to-do before each {name}, counted back from wake-up. Like &ldquo;Pack a lunch&rdquo; 12 hours before. However it became {name}: the week, a break or an event.
        </p>
        {headsUps.length > 0 ? (
          <ul className="flex flex-col">
            {headsUps.map((h) => (
              <li key={h.id} className="flex min-h-12 items-center gap-3 border-b border-panel last:border-0">
                <Emoji emoji={h.makes === "grocery" ? "🛒" : "🔔"} className="size-7" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-lg font-semibold text-ink">{h.label}</span>
                  <span className="text-sm font-semibold text-ink-muted">
                    {leadLabel(h.minutes_before).replace("At the start", "At wake-up").replace(" before", " before wake-up")}
                    {h.makes === "grocery" ? " · on the grocery list" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(h.id)}
                  aria-label={`Remove the heads-up ${h.label}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-rail hover:text-ink"
                >
                  <X size="1.25rem" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {headsUps.length < MAX_KIND_HEADS_UPS ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-rail p-4">
            <div className="flex items-end gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-base font-bold text-ink">New heads-up</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  placeholder="Pack a lunch"
                  className="min-h-11 rounded-xl border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex w-24 shrink-0 flex-col gap-1.5">
                <span className="text-base font-bold text-ink">How long</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="min-h-11 rounded-xl border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {LEAD_UNITS.map((u) => (
                <button key={u.unit} type="button" aria-pressed={unit === u.unit} onClick={() => setUnit(u.unit)} className={chip(unit === u.unit)}>
                  {u.label}
                </button>
              ))}
              <span className="px-1 text-base text-ink-muted">before wake-up, makes a</span>
              <button type="button" aria-pressed={makes === "todo"} onClick={() => setMakes("todo")} className={chip(makes === "todo")}>
                To-do
              </button>
              <button type="button" aria-pressed={makes === "grocery"} onClick={() => setMakes("grocery")} className={chip(makes === "grocery")}>
                Grocery
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={add}
                disabled={!label.trim() || minutes === null}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-base font-bold text-board disabled:opacity-40"
              >
                <Plus size="1.25rem" weight="bold" aria-hidden />
                Add heads-up
              </button>
              {minutes === null ? <span className="text-sm font-bold text-danger">Up to 60 days.</span> : null}
            </div>
          </div>
        ) : (
          <p className="text-base text-ink-muted">That&rsquo;s the most for one kind of day.</p>
        )}
        <p className="text-sm text-ink-muted">Changes are kept when you press Save.</p>
      </div>
    </div>
  );
}

const timeClass = "min-h-11 w-full min-w-0 rounded-xl border-2 border-frame bg-board px-1.5 text-base text-ink outline-none focus:border-accent";

// ---------------------------------------------------------------------------
// Breaks: a list on the left, the one picked on the right
// ---------------------------------------------------------------------------

function BreaksTab({ draft, update, members, today, dateLabel }: TabProps & { today: string; dateLabel: (d: string, withDay?: boolean) => string }) {
  const list = draft.breaks.toSorted((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / BREAKS_PER_PAGE));
  const at = Math.min(page, pages - 1);
  const shown = list.slice(at * BREAKS_PER_PAGE, at * BREAKS_PER_PAGE + BREAKS_PER_PAGE);
  const current = draft.breaks.find((b) => b.id === selected) ?? null;

  const setBreak = (id: string, patch: Partial<DraftBreak>) => update((d) => ({ ...d, breaks: d.breaks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const add = () => {
    const id = newId();
    update((d) => ({
      ...d,
      breaks: [...d.breaks, { id, name: "", icon: null, start: today, end: today, away: false, people: members.map((m) => ({ member_id: m.id, day_type_id: null, week_plan_id: null })) }],
    }));
    setSelected(id);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-label="Breaks" className="flex min-h-0 min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-frame bg-board px-4 py-4">
        <button
          type="button"
          onClick={add}
          className="flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-2 rounded-2xl bg-ink text-base font-bold text-board"
        >
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Break
        </button>
        {list.length === 0 ? (
          <p className="px-1 text-base text-ink-muted">
            No breaks coming up. A break is a few days that aren&rsquo;t like the usual week: a holiday, summer, a sick day.
          </p>
        ) : null}
        {shown.map((b) => {
          const now = b.start <= today && today <= b.end;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b.id)}
              aria-pressed={b.id === selected}
              className={`flex min-h-16 min-w-0 items-center gap-3 rounded-2xl px-2.5 text-left ${b.id === selected ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
            >
              <Emoji emoji={eventEmoji(b.icon, b.name)} className="size-10" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-lg font-bold text-ink">{b.name || "New break"}</span>
                <span className="truncate text-sm font-semibold text-ink-muted">
                  {now ? "Now · " : ""}
                  {b.start === b.end ? dateLabel(b.start, true) : `${dateLabel(b.start)} – ${dateLabel(b.end)}`}
                </span>
              </span>
              <span className="flex shrink-0 -space-x-1.5">
                {b.people.slice(0, 4).map((p) => {
                  const m = members.find((x) => x.id === p.member_id);
                  return m ? <Avatar key={m.id} name={m.name} colour={m.colour} icon={m.icon} size="sm" /> : null;
                })}
              </span>
            </button>
          );
        })}
        {pages > 1 ? <Pager page={at} pages={pages} setPage={setPage} /> : null}
      </section>

      {current ? (
        <BreakEditor
          key={current.id}
          item={current}
          draft={draft}
          members={members}
          today={today}
          set={(patch) => setBreak(current.id, patch)}
          remove={() => {
            update((d) => ({ ...d, breaks: d.breaks.filter((b) => b.id !== current.id) }));
            setSelected(null);
          }}
          close={() => setSelected(null)}
        />
      ) : (
        <section className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-frame bg-board p-6 text-center">
          <Emoji emoji="🏖️" className="size-16" />
          <p className="text-xl font-bold text-ink">Holidays, summer, a sick day</p>
          <p className="max-w-[30rem] text-base text-ink-muted">
            Tap + Break, pick the dates and who it&rsquo;s for, and what kind of day they have. Breaks show on the calendar. One day is fine too.
          </p>
        </section>
      )}
    </div>
  );
}

function BreakEditor({
  item,
  draft,
  members,
  today,
  set,
  remove,
  close,
}: {
  item: DraftBreak;
  draft: DaysDraft;
  members: DaysMember[];
  today: string;
  set: (patch: Partial<DraftBreak>) => void;
  remove: () => void;
  close: () => void;
}) {
  const groups = groupsOf(draft.dayTypes).filter((g) => g.name.trim());
  const person = (id: string) => item.people.find((p) => p.member_id === id);
  const setPerson = (id: string, patch: Partial<DraftBreakPerson> | null) => {
    const others = item.people.filter((p) => p.member_id !== id);
    if (patch === null) set({ people: others });
    else {
      const before = person(id) ?? { member_id: id, day_type_id: null, week_plan_id: null };
      const next = { ...before, ...patch };
      // Keep the people in household order.
      set({ people: members.flatMap((m) => (m.id === id ? [next] : others.filter((p) => p.member_id === m.id))) });
    }
  };
  /** Everyone on the break who has this kind of day gets it. */
  const everyone = (group: string | null) =>
    set({
      people: item.people.map((p) => {
        const t = group ? draft.dayTypes.find((x) => x.group === group && x.member_id === p.member_id) : null;
        return group && !t ? p : { ...p, day_type_id: t?.id ?? null, week_plan_id: null };
      }),
    });
  const allOn = (group: string | null) =>
    item.people.length > 0 &&
    item.people.every((p) => {
      if (!group) return !p.day_type_id && !p.week_plan_id;
      const t = draft.dayTypes.find((x) => x.group === group && x.member_id === p.member_id);
      return t ? p.day_type_id === t.id : true;
    }) &&
    (!group || item.people.some((p) => draft.dayTypes.some((x) => x.group === group && x.id === p.day_type_id)));

  return (
    <section aria-label="Edit break" className="flex min-h-0 min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-frame bg-board px-5.5 py-4">
      <div className="flex items-center gap-2.5">
        <EmojiPicker
          initial={item.icon ?? ""}
          fieldName=""
          nameText={item.name}
          onChange={(icon) => set({ icon: icon || null })}
          label={`Picture for ${item.name || "this break"}`}
          className="size-14! self-center!"
          fullScreen
        />
        <input
          value={item.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={40}
          placeholder="e.g. Winter break"
          aria-label="Break name"
          className="min-h-[var(--touch-target)] min-w-0 flex-1 rounded-[var(--radius)] border-2 border-transparent bg-transparent px-2 text-3xl font-extrabold text-ink outline-none hover:border-frame focus:border-accent"
        />
        <button type="button" onClick={remove} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-rail px-3 text-base font-bold text-danger">
          <Trash size="1.125rem" aria-hidden />
          Delete
        </button>
        <button type="button" onClick={close} aria-label="Close" className="flex size-11 items-center justify-center rounded-xl bg-rail text-ink">
          <X size="1.125rem" weight="bold" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-ink-muted">From</span>
          <input
            type="date"
            value={item.start}
            min={item.start < today ? item.start : today}
            onChange={(e) => {
              const start = e.target.value;
              set({ start, end: item.end < start ? start : item.end });
            }}
            className={dateClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-ink-muted">To</span>
          <input type="date" value={item.end} min={item.start} onChange={(e) => set({ end: e.target.value })} className={dateClass} />
        </label>
        <span className="pb-3 text-base font-semibold text-ink-muted">{dayCount(item.start, item.end)}</span>
        <label className="ml-auto flex min-h-[var(--touch-target)] cursor-pointer items-center gap-2.5 text-base font-bold text-ink">
          <input type="checkbox" checked={Boolean(item.away)} onChange={(e) => set({ away: e.target.checked })} className="size-7 accent-[var(--color-ink)]" />
          Away from home (no chores)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-bold text-ink-muted">Everyone has</span>
        {groups.slice(0, 5).map((g) => (
          <MiniChip key={g.group} active={allOn(g.group)} onClick={() => everyone(g.group)}>
            {g.icon ? <Emoji emoji={g.icon} className="size-5" /> : null}
            {g.name}
          </MiniChip>
        ))}
        <MiniChip active={allOn(null)} onClick={() => everyone(null)}>
          Usual days
        </MiniChip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 border-t border-frame pt-2.5">
        <span className="text-sm font-bold text-ink-muted">Who it&rsquo;s for, and their days</span>
        {members.map((m) => {
          const p = person(m.id);
          const types = draft.dayTypes.filter((t) => t.member_id === m.id);
          const plans = draft.weekPlans.filter((x) => x.member_id === m.id);
          return (
            <div key={m.id} className="flex min-h-12 items-center gap-2">
              <button
                type="button"
                aria-pressed={Boolean(p)}
                onClick={() => setPerson(m.id, p ? null : {})}
                className={`flex min-h-11 w-40 shrink-0 items-center gap-2 rounded-full border-2 pr-3 pl-1 text-base font-bold ${p ? "border-transparent text-ink" : "border-dashed border-frame text-ink-muted"}`}
                style={p ? { background: soft(m.colour) } : undefined}
              >
                <Avatar name={m.name} colour={p ? m.colour : "grey"} icon={m.icon} size="sm" />
                <span className="truncate">{m.name}</span>
              </button>
              {p ? (
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {types.slice(0, 5).map((t) => (
                    <MiniChip key={t.id} active={p.day_type_id === t.id} colour={m.colour} onClick={() => setPerson(m.id, { day_type_id: t.id, week_plan_id: null })}>
                      {t.icon ? <Emoji emoji={t.icon} className="size-5" /> : null}
                      {t.name || "Untitled"}
                    </MiniChip>
                  ))}
                  {plans.length > 1
                    ? plans.slice(0, 3).map((x) => (
                        <MiniChip key={x.id} active={p.week_plan_id === x.id} colour={m.colour} onClick={() => setPerson(m.id, { day_type_id: null, week_plan_id: x.id })}>
                          {x.name || "Untitled week"}
                        </MiniChip>
                      ))
                    : null}
                  <MiniChip active={!p.day_type_id && !p.week_plan_id} colour={m.colour} onClick={() => setPerson(m.id, { day_type_id: null, week_plan_id: null })}>
                    Usual days
                  </MiniChip>
                </div>
              ) : (
                <span className="text-base text-ink-muted">Not on this break</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const dateClass = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

function dayCount(start: string, end: string): string {
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function MiniChip({ active, onClick, colour, children }: { active: boolean; onClick: () => void; colour?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-base ${active ? "border-ink font-bold text-ink" : "border-frame bg-board text-ink hover:border-ink"}`}
      style={active ? { background: colour ? soft(colour) : "var(--color-rail)", borderColor: colour ? strong(colour) : undefined } : undefined}
    >
      {children}
    </button>
  );
}

function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (p: number) => void }) {
  return <PageArrows page={page} pages={pages} onPage={setPage} className="mt-auto pt-2" />;
}
