"use client";

import { Pager as PageArrows } from "@/components/pager";
import { useState, type ReactNode } from "react";
import { CaretDown, CaretUp, Minus, Plus, Trash, X } from "@phosphor-icons/react";
import {
  ColourDot,
  EmptyState,
  Emoji,
  ScreenHeader,
  Switch,
  Toggle,
  fieldLabelClass,
  primaryActionClass,
  secondaryActionClass,
  segItemClass,
  segTrackClass,
  whoChipStyle,
} from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { DayField, NumberStepper, TimeField } from "@/components/touch-pickers";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { hand, soft } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import { CHORE_TAGS, weekdaysLabel, type ChoreTag } from "@/lib/chore-days";
import { SEASONS, describeRule, type ChoreRule, type RepeatUnit, type Season } from "@/lib/chores";
import {
  MAX_HEADS_UPS,
  NEW_PREFIX,
  autoFirstDues,
  draftProblem,
  hasFirstDue,
  ruleColumns,
  sameDraft,
  seasonTabs,
  type ChoreManagerDraft,
  type DraftChoreDay,
  type DraftHeadsUp,
  type DraftOccasional,
  type DraftRegular,
  type OnlyIn,
  type Snap,
} from "@/lib/chore-manager";
import { LEAD_UNITS, leadLabel, leadMinutes, type LeadUnit } from "@/lib/heads-ups";
import { doChoreToday, saveChoreManager } from "./manager-actions";
import { wallTime } from "@/lib/time-text";

/*
 * The Chore Manager (2026-11-09). Left: Occasional chores on top, then the
 * chore days. Right: whatever you tapped. A chore day shows its regular
 * chores (added like a list) and its rules; Occasional chores shows every
 * occasional chore in due order on season tabs beside the editor. Every
 * change stays on this screen until Save; leaving with changes asks first.
 * Nothing scrolls: long lists page.
 */

export type ManagerMember = { id: string; name: string; colour: string; icon: string | null };

/** What the server worked out for each saved occasional chore. */
export type OccasionalInfo = {
  dueOn: string;
  lastDone: string | null;
  /** The day the generator put it on, in the next two weeks. */
  placedOn: string | null;
  onToday: boolean;
  /** Never done or skipped yet: its first date can still be moved. */
  firstTime: boolean;
  /** Why it's hard to schedule, if it is. */
  hard: string | null;
};

/** The next time a chore day comes round, and what's on it. */
export type DayPreview = { date: string; items: { icon: string | null; name: string; occasional: boolean }[] } | null;

type Selection = { kind: "occasional" } | { kind: "day"; id: string };
type Tab = "chore" | "repeats" | "more";

const DAYS_PER_PAGE = 8;
const OCCASIONAL_PER_PAGE = 9;
const REGULAR_PER_PAGE = 9;
const PREVIEW_SHOWN = 6;
/** The picture for a chore day or chore with none picked and no good guess from its name (the same in lists and editors). */
const DAY_PICTURE = "🗓️";
const CHORE_PICTURE = "🧹";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VISIBILITY = [
  { value: "everyone", label: "Everyone" },
  { value: "adults", label: "Adults only" },
  { value: "just_me", label: "Just me" },
];
const UNIT_CHIPS: { value: RepeatUnit; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];
const SNAP_OPTIONS: { value: Snap; label: string }[] = [
  { value: "none", label: "Any day" },
  { value: "weekday", label: "The nearest" },
  { value: "first_of_month", label: "First of the month" },
  { value: "last_of_month", label: "Last of the month" },
  { value: "first_of_season", label: "First of the season" },
  { value: "last_of_season", label: "Last of the season" },
];
const ONLY_IN: { value: OnlyIn; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "seasons", label: "Seasons" },
  { value: "months", label: "Months" },
  { value: "dates", label: "Between dates" },
];

const SELECTED_KEY = "almanac.choreManager.selected";

/** What's open, kept for the moment after a save (the screen starts afresh). */
function remember(value: { day?: string; chore?: string | null }) {
  try {
    sessionStorage.setItem(SELECTED_KEY, JSON.stringify(value));
  } catch {
    // Private windows can refuse storage; the screen works without it.
  }
}
/** Read once: a fresh visit starts on Occasional chores. */
function recall(): { day?: string; chore?: string | null } {
  try {
    const value = JSON.parse(sessionStorage.getItem(SELECTED_KEY) ?? "{}");
    sessionStorage.removeItem(SELECTED_KEY);
    return value;
  } catch {
    return {};
  }
}

let counter = 0;
const newId = () => `${NEW_PREFIX}${Date.now().toString(36)}-${(counter += 1)}`;

/** A typed-in field: the mock's `.inp` (editorInputClass, but sized by its row). */
const control =
  "min-h-[var(--touch-target)] min-w-0 rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-[1.5rem] font-bold text-ink outline-none focus:border-ink";
/** The same, a step smaller, for the occasional chore editor's many fields. */
const smallControl =
  "min-h-[var(--touch-target)] min-w-0 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-[1.25rem] font-bold text-ink outline-none focus:border-ink";
/** A small capital heading in a card: the mock's `.k`. */
const kickerClass = "shrink-0 text-[1.15rem] font-bold tracking-[0.06em] text-ink-muted uppercase";
/** A white card on the rail: the mock's `.card`. */
const cardClass = "flex min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised lg:min-h-0";

export function ChoreManager({
  initial,
  members,
  info,
  previews,
  today,
  locale,
  timeZone,
  weekStartsOn,
  startWith,
}: {
  initial: ChoreManagerDraft;
  members: ManagerMember[];
  info: Record<string, OccasionalInfo>;
  previews: Record<string, DayPreview>;
  today: string;
  locale: string;
  timeZone: string;
  weekStartsOn: 0 | 1;
  /** ?edit=<chore> or ?day=<chore day> from a link. */
  startWith: { chore?: string; day?: string };
}) {
  const [draft, setDraft] = useState<ChoreManagerDraft>(initial);
  // A link (?edit= or ?day=) wins; else what was open before a save.
  const [start] = useState(() => (startWith.chore || startWith.day ? startWith : typeof window === "undefined" ? {} : recall()));
  const [selection, setSelection] = useState<Selection>(() =>
    start.day && initial.days.some((d) => d.id === start.day) ? { kind: "day", id: start.day } : { kind: "occasional" },
  );
  const [choreId, setChoreId] = useState<string | null>(() => (start.chore && initial.occasional.some((c) => c.id === start.chore) ? start.chore : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayPage, setDayPage] = useState(0);
  const [daysRef, daysPerPage] = useFitRows<HTMLUListElement>(DAYS_PER_PAGE);
  const dirty = !sameDraft(draft, initial);
  const guard = useUnsavedChanges(dirty, () => setDraft(initial));

  const update = (change: (d: ChoreManagerDraft) => ChoreManagerDraft) => {
    setError(null);
    setDraft((d) => change(d));
  };

  const weekdays = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
  const weekdayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + d)));
  const dateLabel = (d: string) =>
    d === today ? "Today" : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  // Short, like the mock's "Fri 20", so the line fits the 22rem card.
  const nextLabel = (d: string) =>
    d < today ? "overdue" : d === today ? "today" : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const timeLabel = (t: string) => wallTime(t, locale);

  const days = [...draft.days.filter((d) => !d.is_free), ...draft.days.filter((d) => d.is_free)];
  const dayPages = Math.max(1, Math.ceil(days.length / daysPerPage));
  const shownDays = days.slice(Math.min(dayPage, dayPages - 1) * daysPerPage, (Math.min(dayPage, dayPages - 1) + 1) * daysPerPage);
  const hardCount = draft.occasional.filter((c) => info[c.id]?.hard && c.active).length;
  const nextUp = draft.occasional
    .filter((c) => c.active && info[c.id] && !info[c.id].hard && !info[c.id].onToday)
    .toSorted((a, b) => (info[a.id].placedOn ?? info[a.id].dueOn).localeCompare(info[b.id].placedOn ?? info[b.id].dueOn))[0];

  // --- Saving ---------------------------------------------------------------------
  const save = async (then?: string | null) => {
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      guard.stay();
      return;
    }
    setSaving(true);
    // New chores go on the quiet first day shown on screen.
    const picked = autoFirstDues(draft.occasional, dueOnOf(info), today);
    const result = await saveChoreManager({ ...draft, occasional: draft.occasional.map((c) => ({ ...c, first_due: c.first_due ?? picked.get(c.id) ?? null })) });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      return;
    }
    // Keep the same thing open after the save, under its saved id.
    remember({
      day: selection.kind === "day" ? (result.ids[selection.id] ?? selection.id) : undefined,
      chore: choreId ? (result.ids[choreId] ?? choreId) : null,
    });
    guard.saved(then);
  };
  const undo = () => {
    setDraft(initial);
    setError(null);
    if (choreId && !initial.occasional.some((c) => c.id === choreId)) setChoreId(null);
    if (selection.kind === "day" && !initial.days.some((d) => d.id === selection.id)) setSelection({ kind: "occasional" });
  };

  const addDay = () => {
    const id = newId();
    // It starts on the next weekday from today that no other chore day has.
    const taken = new Set(draft.days.flatMap((x) => x.weekdays));
    const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const free = [1, 2, 3, 4, 5, 6, 7].map((n) => (todayWeekday + n) % 7).find((w) => !taken.has(w));
    const day: DraftChoreDay = { id, name: "New chore day", icon: null, weekdays: free === undefined ? [] : [free], span: false, restrictive: false, max_tasks: 3, max_big: 1, is_free: false, errands: false };
    update((d) => ({ ...d, days: [...d.days.filter((x) => !x.is_free), day, ...d.days.filter((x) => x.is_free)] }));
    setSelection({ kind: "day", id });
    setDayPage(Math.floor(days.filter((x) => !x.is_free).length / daysPerPage));
  };

  return (
    <>
      <ScreenHeader title="Chores" sub="Setup" action={<SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />} />
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
      {/* Left: Occasional chores on top, then the chore days */}
      <section aria-label="Chore days" className={`${cardClass} gap-[0.2rem]`}>
        <button
          type="button"
          onClick={() => setSelection({ kind: "occasional" })}
          aria-pressed={selection.kind === "occasional"}
          className="flex w-full flex-col gap-[0.2rem] rounded-[var(--radius-card)] px-4 py-[0.85rem] text-left"
          style={{
            background: soft("orange"),
            boxShadow: selection.kind === "occasional" ? "inset 0 0 0 2px var(--color-ink)" : undefined,
          }}
        >
          <span className="flex items-center gap-[0.7rem]">
            <Emoji emoji="🔁" className="size-[2.4rem]" />
            <span className="min-w-0 flex-1 text-[1.75rem] leading-[1.15] font-extrabold text-ink">Occasional chores</span>
            <span className="text-[1.75rem] font-extrabold tabular-nums" style={{ color: hand("orange") }}>
              {draft.occasional.length}
            </span>
          </span>
          {nextUp ? (
            <span className="line-clamp-2 text-[1.25rem] leading-tight font-bold" style={{ color: hand("orange") }}>
              Next: {nextUp.name}, {nextLabel(info[nextUp.id].placedOn ?? info[nextUp.id].dueOn)}
            </span>
          ) : null}
          {hardCount > 0 ? (
            <span className="text-[1.25rem] font-bold text-now-on-tint">
              {hardCount} can&rsquo;t find a day
            </span>
          ) : null}
        </button>

        <h2 className="mt-[0.8rem] flex items-baseline gap-3 text-[1.75rem] font-bold text-ink">
          Chore days <span className="text-[1.25rem] font-semibold text-ink-muted tabular-nums">{days.length}</span>
        </h2>
        <ul ref={daysRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {shownDays.map((d) => {
            const count = draft.regular.filter((c) => c.chore_day_id === d.id).length;
            const active = selection.kind === "day" && selection.id === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelection({ kind: "day", id: d.id })}
                  aria-pressed={active}
                  className={`flex min-h-16 w-full items-center gap-[0.65rem] rounded-[var(--radius)] px-[0.7rem] py-1 text-left ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
                >
                  <Emoji emoji={eventEmoji(d.icon, d.name, DAY_PICTURE)} className="size-[2.15rem]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[1.5rem] leading-[1.1] font-extrabold text-ink">{d.name || "Unnamed"}</span>
                    <span className="truncate text-[1.15rem] font-bold text-ink-muted">
                      {d.is_free ? "" : d.weekdays.length ? `${weekdaysLabel(d.weekdays)} · ` : ""}{count === 1 ? "1 chore" : `${count} chores`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <button type="button" onClick={addDay} className={`${secondaryActionClass} flex-1 text-[1.25rem]!`}>
            <Plus size="1.25rem" weight="bold" aria-hidden />
            New chore day
          </button>
          <MiniPager page={Math.min(dayPage, dayPages - 1)} pages={dayPages} onPage={setDayPage} />
        </div>
      </section>

      {/* Right: what was tapped, and the one Save */}
      <section aria-label={selection.kind === "occasional" ? "Occasional chores" : "Chore day"} className={`${cardClass} gap-3`}>
        <div className="flex min-h-0 flex-1 flex-col">
          {selection.kind === "occasional" ? (
            <OccasionalPanel
              draft={draft}
              update={update}
              members={members}
              info={info}
              today={today}
              choreId={choreId}
              setChoreId={setChoreId}
              dateLabel={dateLabel}
              timeLabel={timeLabel}
              weekdays={weekdays}
              weekdayName={weekdayName}
              setError={setError}
              locale={locale}
              timeZone={timeZone}
            />
          ) : (
            <DayPanel
              key={selection.id}
              dayId={selection.id}
              draft={draft}
              update={update}
              members={members}
              preview={previews[selection.id]}
              dateLabel={dateLabel}
              timeLabel={timeLabel}
              weekdays={weekdays}
              weekdayName={weekdayName}
              onRemoved={() => setSelection({ kind: "occasional" })}
            />
          )}
        </div>
      </section>

      {guard.leaving ? (
        <LeaveDialog what="some chores" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} />
      ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// A chore day: its name, days, regular chores and rules
// ---------------------------------------------------------------------------

function DayPanel({
  dayId,
  draft,
  update,
  members,
  preview,
  dateLabel,
  timeLabel,
  weekdays,
  weekdayName,
  onRemoved,
}: {
  dayId: string;
  draft: ChoreManagerDraft;
  update: (change: (d: ChoreManagerDraft) => ChoreManagerDraft) => void;
  members: ManagerMember[];
  preview: DayPreview | undefined;
  dateLabel: (d: string) => string;
  timeLabel: (t: string) => string;
  weekdays: number[];
  weekdayName: (d: number) => string;
  onRemoved: () => void;
}) {
  const day = draft.days.find((d) => d.id === dayId);
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [regularRef, fitRegular] = useFitRows<HTMLUListElement>(REGULAR_PER_PAGE);
  const [name, setName] = useState("");
  const [who, setWho] = useState("");
  const [time, setTime] = useState("");
  const [icon, setIcon] = useState("");
  const [round, setRound] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!day) return null;

  const regular = draft.regular.filter((c) => c.chore_day_id === day.id);
  // An open row takes the room of two.
  const perPage = open ? Math.max(1, fitRegular - 2) : fitRegular;
  const pages = Math.max(1, Math.ceil(regular.length / perPage));
  const p = Math.min(page, pages - 1);
  const shown = regular.slice(p * perPage, (p + 1) * perPage);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const setDay = (patch: Partial<DraftChoreDay>) => update((d) => ({ ...d, days: d.days.map((x) => (x.id === day.id ? { ...x, ...patch } : x)) }));
  const setChore = (id: string, patch: Partial<DraftRegular>) => update((d) => ({ ...d, regular: d.regular.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const move = (id: string, by: -1 | 1) =>
    update((d) => {
      const list = [...d.regular];
      const i = list.findIndex((c) => c.id === id);
      const mine = list.map((c, at) => ({ c, at })).filter((x) => x.c.chore_day_id === day.id);
      const here = mine.findIndex((x) => x.at === i);
      const other = mine[here + by];
      if (!other) return d;
      [list[i], list[other.at]] = [list[other.at], list[i]];
      return { ...d, regular: list };
    });
  const add = () => {
    if (!name.trim()) return;
    const chore: DraftRegular = { id: newId(), chore_day_id: day.id, name: name.trim(), icon: icon || null, assignee_id: who || null, due_time: time || null, notes: null, active: true };
    update((d) => ({ ...d, regular: [...d.regular, chore] }));
    setName("");
    setTime("");
    setIcon("");
    setRound((r) => r + 1);
    setPage(Math.floor(regular.length / perPage));
  };
  const removeDay = () => {
    update((d) => ({
      days: d.days.filter((x) => x.id !== day.id),
      regular: d.regular.filter((c) => c.chore_day_id !== day.id),
      occasional: d.occasional.map((c) => ({ ...c, chore_day_ids: c.chore_day_ids.filter((x) => x !== day.id) })),
    }));
    onRemoved();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-[0.7rem]">
        <EmojiPicker initial={day.icon ?? ""} fallback={DAY_PICTURE} fieldName="" nameText={day.name} onChange={(e) => setDay({ icon: e || null })} label={`Picture for ${day.name}`} className="size-[var(--touch-target)]! self-center!" fullScreen />
        <input
          value={day.name}
          onChange={(e) => setDay({ name: e.target.value })}
          maxLength={40}
          aria-label="Chore day name"
          className={`${control} w-[16rem] text-[1.75rem]!`}
        />
        {day.is_free ? (
          <span className="text-[1.25rem] font-bold text-ink-muted lg:ml-auto">Free day: any day with no chore day</span>
        ) : (
          <div className="flex flex-wrap gap-[0.4rem] lg:ml-auto" role="group" aria-label="Days of the week">
            {weekdays.map((w) => (
              <Chip key={w} on={day.weekdays.includes(w)} onClick={() => setDay({ weekdays: day.weekdays.includes(w) ? day.weekdays.filter((x) => x !== w) : [...day.weekdays, w].sort() })}>
                {weekdayName(w)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="mt-[0.7rem] grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Regular chores, like a list */}
        <div className="flex min-h-0 flex-col">
          <h3 className={kickerClass}>Regular chores · every {day.is_free ? "free day" : /\bday$/i.test(day.name.trim()) ? day.name.trim() : `${day.name.trim() || "chore"} day`}</h3>
          <div className="mt-[0.4rem] mb-2 flex items-center gap-[0.45rem]">
            <EmojiPicker key={round} initial="" fallback={CHORE_PICTURE} fieldName="" nameText={name} onChange={setIcon} label="Picture for the new chore" className="size-[var(--touch-target)]! self-center!" fullScreen />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              maxLength={80}
              placeholder="New regular chore"
              aria-label="New regular chore"
              className={`${control} flex-1 placeholder:text-ink-muted`}
            />
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who does it" className={`${control} w-[11rem]`}>
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <TimeField value={time} onChange={setTime} step={5} allowEmpty emptyText="Any time" aria-label="Due by" className="w-[12rem]! shrink-0 px-3!" />
            <button type="button" onClick={add} disabled={!name.trim()} className={`${primaryActionClass} text-[1.25rem]! disabled:opacity-40`}>
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Add
            </button>
          </div>
          {regular.length === 0 ? <p className="py-3 text-[1.25rem] font-bold text-ink-muted">No chores yet</p> : null}
          <ul ref={regularRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {shown.map((c) => {
              const person = c.assignee_id ? memberById.get(c.assignee_id) : undefined;
              if (open === c.id) {
                const chip = whoChipStyle(person?.colour, Boolean(person));
                return (
                  <li key={c.id} className="my-[0.3rem] flex flex-col gap-2 rounded-[var(--radius)] bg-rail p-[0.7rem]">
                    <div className="flex items-center gap-2">
                      <EmojiPicker initial={c.icon ?? ""} fallback={CHORE_PICTURE} fieldName="" nameText={c.name} onChange={(e) => setChore(c.id, { icon: e || null })} label={`Picture for ${c.name}`} className="size-[var(--touch-target)]! self-center!" fullScreen />
                      <input value={c.name} onChange={(e) => setChore(c.id, { name: e.target.value })} maxLength={80} aria-label="Chore name" className={`${control} flex-1`} />
                      {/* Who: a colour chip that opens the list of people. */}
                      <label className={`${chip.className} relative max-w-[12rem] shrink-0`} style={chip.style}>
                        {person ? <ColourDot colour={person.colour} /> : null}
                        <span className="truncate">{person?.name ?? "Anyone"}</span>
                        <select value={c.assignee_id ?? ""} onChange={(e) => setChore(c.id, { assignee_id: e.target.value || null })} aria-label="Who does it" className="absolute inset-0 cursor-pointer opacity-0">
                          <option value="">Anyone</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TimeField value={c.due_time ?? ""} onChange={(t) => setChore(c.id, { due_time: t || null })} step={5} allowEmpty emptyText="Any time" aria-label="Due by" className="w-[12rem]! shrink-0 px-3!" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={c.notes ?? ""} onChange={(e) => setChore(c.id, { notes: e.target.value || null })} maxLength={2000} placeholder="Notes" aria-label="Notes" className={`${control} flex-1 placeholder:text-ink-muted`} />
                      <IconButton label="Move up" onClick={() => move(c.id, -1)}>
                        <CaretUp size="1.5rem" weight="bold" aria-hidden />
                      </IconButton>
                      <IconButton label="Move down" onClick={() => move(c.id, 1)}>
                        <CaretDown size="1.5rem" weight="bold" aria-hidden />
                      </IconButton>
                      <IconButton label={`Remove ${c.name}`} danger onClick={() => update((d) => ({ ...d, regular: d.regular.filter((x) => x.id !== c.id) }))}>
                        <Trash size="1.5rem" aria-hidden />
                      </IconButton>
                      <button type="button" onClick={() => setOpen(null)} className={`${secondaryActionClass} bg-board! text-[1.25rem]!`}>
                        Done
                      </button>
                    </div>
                  </li>
                );
              }
              const chip = person ? whoChipStyle(person.colour, false) : null;
              return (
                <li key={c.id} className="border-b border-frame">
                  <button type="button" onClick={() => setOpen(c.id)} className={`flex min-h-[3.6rem] w-full items-center gap-[0.6rem] py-1 text-left ${c.active ? "" : "opacity-55"}`}>
                    <Emoji emoji={eventEmoji(c.icon, c.name, CHORE_PICTURE)} className="size-8" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[1.35rem] font-bold text-ink">{c.name || "Unnamed"}</span>
                      {c.notes ? <span className="truncate text-[1.15rem] font-bold text-ink-muted">{c.notes}</span> : null}
                    </span>
                    {person && chip ? (
                      <span className={`${chip.className} pointer-events-none max-w-[12rem] shrink-0`}>
                        <ColourDot colour={person.colour} />
                        <span className="truncate">{person.name}</span>
                      </span>
                    ) : null}
                    {c.due_time ? (
                      <span className="shrink-0 rounded-full px-[0.7rem] py-[0.15rem] text-[1.15rem] font-extrabold" style={{ background: soft("blue"), color: hand("blue") }}>
                        by {timeLabel(c.due_time)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto flex items-center justify-end gap-3 pt-2">
            <MiniPager page={p} pages={pages} onPage={setPage} />
          </div>
        </div>

        {/* The day's rules and the next time it comes round */}
        <aside className="flex min-h-0 flex-col gap-[0.7rem] rounded-[var(--radius-card)] bg-rail px-[1.1rem] py-4">
          <h3 className={kickerClass}>Room for occasional chores</h3>
          <Stepper label="How many" value={day.max_tasks} onChange={(v) => setDay({ max_tasks: v })} />
          <Stepper label="Of those, Big" value={day.max_big} onChange={(v) => setDay({ max_big: v })} />
          {day.is_free ? null : (
            <>
              <Switch on={day.restrictive} onChange={(v) => setDay({ restrictive: v })}>
                Only chores meant for {day.name || "this day"}
              </Switch>
              <Switch on={day.span} onChange={(v) => setDay({ span: v })}>
                Next-door days are one stretch
              </Switch>
            </>
          )}
          <Switch on={day.errands} onChange={(v) => setDay({ errands: v })}>
            Good for errands
          </Switch>
          <div className="my-[0.1rem] h-px shrink-0 bg-frame" />
          {preview ? (
            <>
              <h3 className={kickerClass}>
                Next {day.is_free ? "free day" : day.name} · {dateLabel(preview.date)}
              </h3>
              <ul className="flex min-h-0 flex-col gap-1 overflow-hidden">
                {preview.items.slice(0, PREVIEW_SHOWN).map((item, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2 text-[1.25rem] font-bold" style={{ color: item.occasional ? hand("orange") : "var(--color-ink)" }}>
                    {item.occasional ? <Emoji emoji="🔁" className="size-6" /> : null}
                    <span className="truncate">{item.name}</span>
                  </li>
                ))}
              </ul>
              {preview.items.length > PREVIEW_SHOWN ? <p className="text-[1.25rem] font-bold text-ink-muted">+ {preview.items.length - PREVIEW_SHOWN} more</p> : null}
            </>
          ) : (
            <p className="text-[1.25rem] font-bold text-ink-muted">Not coming up in the next two weeks</p>
          )}
          {day.is_free ? null : confirmRemove ? (
            <div className="mt-auto flex flex-col gap-2">
              <p className="text-[1.25rem] font-bold text-danger">Remove {day.name} and its {regular.length} regular chores?</p>
              <div className="flex gap-2">
                <button type="button" onClick={removeDay} className={`${primaryActionClass} bg-danger! text-board!`}>
                  Remove
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className={`${secondaryActionClass} bg-board!`}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="mt-auto flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 self-start text-[1.25rem] font-bold text-danger">
              <Trash size="1.5rem" aria-hidden />
              Remove this chore day
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Occasional chores: the season list and the editor
/** When each saved occasional chore is next due. */
function dueOnOf(info: Record<string, OccasionalInfo>): Record<string, string> {
  return Object.fromEntries(Object.entries(info).map(([id, i]) => [id, i.dueOn]));
}

// ---------------------------------------------------------------------------

function OccasionalPanel({
  draft,
  update,
  members,
  info,
  today,
  choreId,
  setChoreId,
  dateLabel,
  timeLabel,
  weekdays,
  weekdayName,
  setError,
  locale,
  timeZone,
}: {
  draft: ChoreManagerDraft;
  update: (change: (d: ChoreManagerDraft) => ChoreManagerDraft) => void;
  members: ManagerMember[];
  info: Record<string, OccasionalInfo>;
  today: string;
  choreId: string | null;
  setChoreId: (id: string | null) => void;
  dateLabel: (d: string) => string;
  timeLabel: (t: string) => string;
  weekdays: number[];
  weekdayName: (d: number) => string;
  setError: (e: string | null) => void;
  locale: string;
  timeZone: string;
}) {
  // New chores (not saved yet) show under their first date: the one set, or a quiet day picked for them.
  const picked = autoFirstDues(draft.occasional, dueOnOf(info), today);
  const firstOf = (c: DraftOccasional) => c.first_due ?? picked.get(c.id) ?? today;
  const withDue = draft.occasional.map((c) => ({ chore: c, dueOn: info[c.id] ? (c.first_due && info[c.id].firstTime ? c.first_due : info[c.id].dueOn) : firstOf(c) }));
  const tabs = seasonTabs(withDue, today);
  const selected = draft.occasional.find((c) => c.id === choreId) ?? null;
  const selectedSeason = selected ? tabs.find((t) => t.chores.some((x) => x.chore.id === selected.id))?.season : undefined;
  const [season, setSeason] = useState<Season>(() => selectedSeason ?? tabs[0].season);
  const [page, setPage] = useState(() => {
    const t = tabs.find((x) => x.season === (selectedSeason ?? tabs[0].season));
    const at = t && selected ? t.chores.findIndex((x) => x.chore.id === selected.id) : -1;
    return at > 0 ? Math.floor(at / OCCASIONAL_PER_PAGE) : 0;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [occasionalRef, occasionalPerPage] = useFitRows<HTMLUListElement>(OCCASIONAL_PER_PAGE);
  const tab = tabs.find((t) => t.season === season) ?? tabs[0];
  const pages = Math.max(1, Math.ceil(tab.chores.length / occasionalPerPage));
  const p = Math.min(page, pages - 1);
  const shown = tab.chores.slice(p * occasionalPerPage, (p + 1) * occasionalPerPage);
  const dayById = new Map(draft.days.map((d) => [d.id, d]));

  const ruleText = (c: DraftOccasional) => {
    const cols = ruleColumns(c);
    const md = (v: string) => `${MONTHS[Number(v.slice(0, 2)) - 1]} ${Number(v.slice(3))}`;
    const rule = describeRule(cols as unknown as ChoreRule, dateLabel, c.only_in === "dates" ? `${md(c.season_start)} – ${md(c.season_end)}` : undefined);
    const where = c.chore_day_ids.length === 0 ? "any day" : c.chore_day_ids.map((id) => dayById.get(id)?.name ?? "?").join(", ");
    return `${rule} · ${where}`;
  };

  const addChore = () => {
    const id = newId();
    const chore: DraftOccasional = {
      id,
      name: "New chore",
      icon: null,
      assignee_id: null,
      tags: [],
      chore_day_ids: [],
      repeat_every: 1,
      repeat_unit: "month",
      repeat_from: "done",
      start_date: null,
      snap: "none",
      preferred_weekday: 6,
      only_in: "any",
      only_seasons: [],
      only_months: [],
      season_start: "10-01",
      season_end: "10-31",
      at_time: null,
      visibility: "everyone",
      notes: null,
      active: true,
      heads_ups: [],
      first_due: null,
    };
    update((d) => ({ ...d, occasional: [...d.occasional, chore] }));
    setChoreId(id);
    setSeason(tabs[0].season);
    setPage(Math.floor(tabs[0].chores.length / occasionalPerPage));
  };

  const plus = async (id: string) => {
    setBusy(id);
    const result = await doChoreToday(id);
    setBusy(null);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-2">
        <div className={segTrackClass} role="tablist" aria-label="Seasons">
          {tabs.map((t) => (
            <button
              key={t.season}
              type="button"
              role="tab"
              aria-selected={t.season === tab.season}
              onClick={() => {
                setSeason(t.season);
                setPage(0);
              }}
              className={`${segItemClass(t.season === tab.season)} min-w-0! flex-1 text-[1.25rem]!`}
            >
              {t.label}
              <span className="tabular-nums">{t.chores.length}</span>
            </button>
          ))}
        </div>
        <ul ref={occasionalRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {shown.map(({ chore: c }) => {
            const i = info[c.id];
            const isNew = c.id.startsWith(NEW_PREFIX);
            const hard = c.active ? i?.hard : null;
            const due = !i ? `New · ${dateLabel(firstOf(c))}` : i.onToday ? "" : i.dueOn < today ? "Overdue" : i.dueOn === today ? "Due today" : dateLabel(i.placedOn ?? i.dueOn);
            return (
              <li key={c.id} className={`flex min-h-16 items-center gap-2 border-b border-frame ${c.id === choreId ? "rounded-[var(--radius)] border-transparent bg-rail px-2 shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""}`}>
                <button type="button" onClick={() => setChoreId(c.id)} className={`flex min-w-0 flex-1 items-center gap-3 self-stretch text-left ${c.active ? "" : "opacity-55"}`}>
                  <Emoji emoji={eventEmoji(c.icon, c.name, CHORE_PICTURE)} className="size-[2.15rem]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[1.35rem] leading-tight font-bold text-ink">{c.name || "Unnamed"}</span>
                    <span className={`truncate text-[1.15rem] font-bold ${hard ? "text-now-on-tint" : "text-ink-muted"}`}>{!c.active ? "Paused" : (hard ?? ruleText(c))}</span>
                  </span>
                  <span className="shrink-0 text-[1.15rem] font-extrabold text-ink-muted" style={due === "Overdue" || due === "Due today" ? { color: hand("orange") } : undefined}>
                    {due}
                  </span>
                </button>
                {i?.onToday ? (
                  <span className="shrink-0 rounded-full px-[0.7rem] py-1 text-[1.15rem] font-extrabold" style={{ background: soft("teal"), color: hand("teal") }}>
                    On the Daily list
                  </span>
                ) : !isNew && c.active ? (
                  <button
                    type="button"
                    onClick={() => plus(c.id)}
                    disabled={busy !== null}
                    aria-label={`Add ${c.name} to the Daily list`}
                    className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink disabled:opacity-40"
                  >
                    <Plus size="1.375rem" weight="bold" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex items-center gap-3">
          <button type="button" onClick={addChore} className={`${secondaryActionClass} text-[1.25rem]!`}>
            <Plus size="1.25rem" weight="bold" aria-hidden />
            New occasional chore
          </button>
          <span className="flex-1" />
          <MiniPager page={p} pages={pages} onPage={setPage} />
        </div>
      </div>

      {selected ? (
        <OccasionalEditor
          key={selected.id}
          chore={selected}
          info={info[selected.id]}
          firstDue={selected.first_due ?? picked.get(selected.id) ?? info[selected.id]?.dueOn ?? null}
          draft={draft}
          update={update}
          members={members}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          weekdays={weekdays}
          weekdayName={weekdayName}
          onRemoved={() => setChoreId(null)}
          locale={locale}
          timeZone={timeZone}
        />
      ) : (
        <EmptyState emoji="🧹" hint="Tap a chore to change how often it comes round" />
      )}
    </div>
  );
}

function OccasionalEditor({
  chore: c,
  info,
  draft,
  update,
  members,
  dateLabel,
  timeLabel,
  weekdays,
  weekdayName,
  onRemoved,
  firstDue,
}: {
  chore: DraftOccasional;
  info: OccasionalInfo | undefined;
  /** When it first comes due: the date set, or the one picked for it. */
  firstDue: string | null;
  draft: ChoreManagerDraft;
  update: (change: (d: ChoreManagerDraft) => ChoreManagerDraft) => void;
  members: ManagerMember[];
  dateLabel: (d: string) => string;
  timeLabel: (t: string) => string;
  weekdays: number[];
  weekdayName: (d: number) => string;
  onRemoved: () => void;
  locale: string;
  timeZone: string;
}) {
  const [tab, setTab] = useState<Tab>("chore");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (patch: Partial<DraftOccasional>) => update((d) => ({ ...d, occasional: d.occasional.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const status = info
    ? [
        // When it was last done is kept but not shown: no history on screen for now (Connor, 2026-11-10).
        `due ${dateLabel(info.dueOn)}`,
        info.placedOn ? `placed on ${dateLabel(info.placedOn)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex min-h-0 flex-col gap-[0.7rem] rounded-[var(--radius-card)] bg-rail px-[1.1rem] py-4">
      <div className="flex items-center gap-2.5">
        <EmojiPicker initial={c.icon ?? ""} fallback={CHORE_PICTURE} fieldName="" nameText={c.name} onChange={(e) => set({ icon: e || null })} label={`Picture for ${c.name}`} className="size-[var(--touch-target)]! self-center!" fullScreen />
        <input value={c.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} aria-label="Chore name" className={`${control} flex-1`} />
        {/* Pause and Remove sit up here so the tabs below get the whole card. */}
        <button type="button" onClick={() => set({ active: !c.active })} aria-pressed={!c.active} className={`${secondaryActionClass} bg-board! px-4! text-[1.25rem]!`}>
          {c.active ? "Pause" : "Turn on"}
        </button>
        <IconButton label={`Remove ${c.name}`} danger onClick={() => setConfirmRemove(true)}>
          <Trash size="1.5rem" aria-hidden />
        </IconButton>
      </div>
      {confirmRemove ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[1.25rem] font-bold text-danger">Remove {c.name}?</span>
          <button
            type="button"
            onClick={() => {
              update((d) => ({ ...d, occasional: d.occasional.filter((x) => x.id !== c.id) }));
              onRemoved();
            }}
            className={`${primaryActionClass} bg-danger! text-board!`}
          >
            Remove
          </button>
          <button type="button" onClick={() => setConfirmRemove(false)} className={`${secondaryActionClass} bg-board!`}>
            Keep it
          </button>
        </div>
      ) : hasFirstDue(c) && c.active && (!info || info.firstTime) && firstDue ? (
        // Never done yet: its first date can be moved. New chores get a quiet day.
        <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink-muted">
          <span>{info ? "Not done yet · first time" : "First time"}</span>
          <DayField value={firstDue} onChange={(d) => set({ first_due: d || null })} aria-label="First time it's due" className="w-auto! px-3! text-[1.25rem]!" />
          {info ? null : c.first_due ? (
            <button type="button" onClick={() => set({ first_due: null })} className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-board px-4 font-bold text-ink">
              Pick a free day
            </button>
          ) : (
            <span>· a free day</span>
          )}
        </div>
      ) : (
        <p className="text-base font-semibold text-ink-muted">{status}</p>
      )}
      <Toggle
        label="Chore settings"
        value={tab}
        onChange={setTab}
        options={[
          { value: "chore", label: "Basics" },
          { value: "repeats", label: "Repeats" },
          { value: "more", label: "More" },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[0.6rem] overflow-hidden">
        {tab === "chore" ? (
          <>
            <Group label="Who usually does it">
              <Chip on={!c.assignee_id} onClick={() => set({ assignee_id: null })}>
                Whoever&rsquo;s free
              </Chip>
              {members.map((m) => {
                const chip = whoChipStyle(m.colour, c.assignee_id === m.id);
                return (
                  <button key={m.id} type="button" aria-pressed={c.assignee_id === m.id} onClick={() => set({ assignee_id: m.id })} className={chip.className} style={chip.style}>
                    <ColourDot colour={m.colour} />
                    {m.name}
                  </button>
                );
              })}
            </Group>
            <Group label="Tags">
              {CHORE_TAGS.map((t) => (
                <Chip key={t.value} on={c.tags.includes(t.value)} onClick={() => set({ tags: toggle<ChoreTag>(c.tags, t.value) })}>
                  {t.label}
                </Chip>
              ))}
            </Group>
            <Group label="Chore days">
              {draft.days.map((d) => (
                <Chip key={d.id} on={c.chore_day_ids.includes(d.id)} onClick={() => set({ chore_day_ids: toggle(c.chore_day_ids, d.id) })}>
                  {d.icon ? <Emoji emoji={d.icon} className="size-6" /> : null}
                  {d.name || "Unnamed"}
                </Chip>
              ))}
            </Group>
            {info?.hard && c.active ? <p className="text-[1.25rem] font-bold text-now-on-tint">{info.hard}</p> : null}
          </>
        ) : null}

        {tab === "repeats" ? (
          <>
            {c.only_in === "dates" ? (
              <p className="text-[1.25rem] font-bold text-ink-muted">Once a year</p>
            ) : (
              <>
                <Group label="Counts from">
                  <Chip on={c.repeat_from === "done"} onClick={() => set({ repeat_from: "done" })}>
                    When it was last done
                  </Chip>
                  <Chip on={c.repeat_from === "date"} onClick={() => set({ repeat_from: "date", start_date: c.start_date ?? new Date().toISOString().slice(0, 10) })}>
                    A set date
                  </Chip>
                  {c.repeat_from === "date" ? (
                    <DayField value={c.start_date ?? ""} onChange={(d) => set({ start_date: d || null })} aria-label="The date it counts from" className="w-auto! px-3! text-[1.25rem]!" />
                  ) : null}
                </Group>
                <Group label="Every">
                  <NumberStepper value={c.repeat_every} onChange={(n) => set({ repeat_every: n ?? 1 })} min={1} max={365} aria-label="How many" />
                  {UNIT_CHIPS.map((u) => (
                    <Chip key={u.value} on={c.repeat_unit === u.value} onClick={() => set({ repeat_unit: u.value })}>
                      {u.label}
                    </Chip>
                  ))}
                </Group>
                <Group label="Lands on">
                  <select value={c.snap} onChange={(e) => set({ snap: e.target.value as Snap })} aria-label="Lands on" className={smallControl}>
                    {SNAP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {c.snap !== "none" ? (
                    <select value={String(c.preferred_weekday ?? 6)} onChange={(e) => set({ preferred_weekday: Number(e.target.value) })} aria-label="Day of the week" className={smallControl}>
                      {weekdays.map((w) => (
                        <option key={w} value={w}>
                          {weekdayName(w)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </Group>
              </>
            )}
            <Group label="Only in">
              {ONLY_IN.map((o) => (
                <Chip key={o.value} on={c.only_in === o.value} onClick={() => set({ only_in: o.value })}>
                  {o.label}
                </Chip>
              ))}
            </Group>
            {c.only_in === "seasons" ? (
              <Group label="Seasons">
                {SEASONS.map((s) => (
                  <Chip key={s.season} on={c.only_seasons.includes(s.season)} onClick={() => set({ only_seasons: toggle(c.only_seasons, s.season) })}>
                    {s.label}
                  </Chip>
                ))}
              </Group>
            ) : null}
            {c.only_in === "months" ? (
              <Group label="Months">
                {MONTHS.map((m, i) => (
                  <Chip key={m} small on={c.only_months.includes(i + 1)} onClick={() => set({ only_months: toggle(c.only_months, i + 1).sort((a, b) => a - b) })}>
                    {m}
                  </Chip>
                ))}
              </Group>
            ) : null}
            {c.only_in === "dates" ? (
              <Group label="From and to">
                <MonthDay value={c.season_start} onChange={(v) => set({ season_start: v })} label="From" />
                <span className="text-[1.25rem] font-bold text-ink-muted">to</span>
                <MonthDay value={c.season_end} onChange={(v) => set({ season_end: v })} label="To" />
              </Group>
            ) : null}
          </>
        ) : null}

        {tab === "more" ? (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className={fieldLabelClass}>At an exact time (optional)</span>
                <span className="flex items-center gap-1.5">
                  <TimeField value={c.at_time ?? ""} onChange={(t) => set({ at_time: t || null })} step={5} allowEmpty emptyText="No set time" aria-label="At an exact time" className="w-auto! px-3! text-[1.25rem]!" />
                  {c.at_time ? (
                    <IconButton label="No set time" onClick={() => set({ at_time: null })}>
                      <X size="1.25rem" aria-hidden />
                    </IconButton>
                  ) : null}
                </span>
              </label>
              <Group label="Who can see it">
                {VISIBILITY.map((v) => (
                  <Chip key={v.value} on={c.visibility === v.value} onClick={() => set({ visibility: v.value })}>
                    {v.label}
                  </Chip>
                ))}
              </Group>
            </div>
            <input value={c.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} maxLength={2000} placeholder="Notes" aria-label="Notes" className={`${smallControl} placeholder:text-ink-muted`} />
            <HeadsUps list={c.heads_ups} onChange={(heads_ups) => set({ heads_ups })} />
            {c.at_time ? <p className="text-[1.15rem] font-bold text-ink-muted">Shows at {timeLabel(c.at_time)} on its day.</p> : null}
          </>
        ) : null}
      </div>

    </div>
  );
}

/** Heads-ups on an occasional chore: things to do a set time before it's due. */
function HeadsUps({ list, onChange }: { list: DraftHeadsUp[]; onChange: (list: DraftHeadsUp[]) => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<LeadUnit>("days");
  const [grocery, setGrocery] = useState(false);
  const add = () => {
    const minutes = leadMinutes(amount, unit);
    if (!label.trim() || minutes === null) return;
    onChange([...list, { id: newId(), label: label.trim(), minutes_before: minutes, makes: grocery ? "grocery" : "todo" }]);
    setLabel("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabelClass}>Heads-ups</span>
      <ul className="flex flex-col">
        {list.map((h) => (
          <li key={h.id} className="flex min-h-[var(--touch-target)] items-center gap-2.5 border-b border-frame">
            <Emoji emoji={h.makes === "grocery" ? "🛒" : "🔔"} className="size-6" />
            <span className="min-w-0 flex-1 truncate text-[1.25rem] font-bold text-ink">{h.label}</span>
            <span className="shrink-0 text-[1.15rem] font-bold text-ink-muted">{leadLabel(h.minutes_before)}</span>
            <IconButton label={`Remove the heads-up ${h.label}`} onClick={() => onChange(list.filter((x) => x.id !== h.id))}>
              <X size="1.125rem" aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      {list.length < MAX_HEADS_UPS ? (
        <div className="flex items-center gap-1.5">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="New heads-up" aria-label="New heads-up" className={`${smallControl} flex-1 placeholder:text-ink-muted`} />
          <NumberStepper value={amount} onChange={(n) => setAmount(n ?? 0)} min={0} max={60} aria-label="How long before" className="shrink-0" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as LeadUnit)} aria-label="Unit" className={smallControl}>
            {LEAD_UNITS.map((u) => (
              <option key={u.unit} value={u.unit}>
                {u.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setGrocery((g) => !g)} aria-pressed={grocery} title="Put it on the grocery list instead" className={`flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-[var(--radius)] border-2 ${grocery ? "border-ink bg-panel" : "border-frame bg-board"}`}>
            <Emoji emoji="🛒" className="size-6" />
          </button>
          <button type="button" onClick={add} disabled={!label.trim()} aria-label="Add the heads-up" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary text-primary-ink disabled:opacity-40">
            <Plus size="1.25rem" weight="bold" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

function Chip({ on, onClick, children, small = false }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-[var(--touch-target)] min-w-[3.4rem] items-center justify-center gap-[0.4rem] rounded-full border-2 text-[1.25rem] font-bold text-ink select-none ${small ? "px-[0.7rem]" : "px-4"} ${on ? "border-ink bg-rail" : "border-frame bg-board"}`}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-[0.4rem]" role="group" aria-label={label}>
      <span className={fieldLabelClass}>{label}</span>
      <div className="flex flex-wrap items-center gap-[0.4rem]">{children}</div>
    </div>
  );
}

function IconButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel ${danger ? "text-danger" : "text-ink"}`}
    >
      {children}
    </button>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const button = "flex size-[var(--touch-target)] items-center justify-center rounded-full bg-board text-ink disabled:opacity-40";
  return (
    <div className="flex items-center gap-[0.6rem]">
      <span className="flex-1 text-[1.25rem] font-bold text-ink">{label}</span>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`${label}: fewer`} className={button}>
        <Minus size="1.5rem" weight="bold" aria-hidden />
      </button>
      <span className="min-w-8 text-center text-[1.75rem] font-extrabold text-ink tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(20, value + 1))} disabled={value >= 20} aria-label={`${label}: more`} className={button}>
        <Plus size="1.5rem" weight="bold" aria-hidden />
      </button>
    </div>
  );
}

function MiniPager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return <PageArrows page={page} pages={pages} onPage={onPage} />;
}

function MonthDay({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [m, d] = value.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="flex items-center gap-1.5">
      <select value={m} onChange={(e) => onChange(`${pad(Number(e.target.value))}-${pad(d)}`)} aria-label={`${label}: month`} className={smallControl}>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select value={d} onChange={(e) => onChange(`${pad(m)}-${pad(Number(e.target.value))}`)} aria-label={`${label}: day`} className={smallControl}>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
    </span>
  );
}
