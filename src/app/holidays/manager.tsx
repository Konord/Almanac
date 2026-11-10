"use client";

import { useState, type ReactNode } from "react";
import { CaretLeft, CaretRight, Plus, Trash } from "@phosphor-icons/react";
import { EmptyState, Emoji, ScreenHeader } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { describeHolidayRule, nextDate, PUBLIC_HOLIDAYS, type Birthday, type Holiday, type HolidayRule } from "@/lib/holidays";
import { saveHolidays, type HolidayDraft } from "./actions";

/*
 * The Holidays and birthdays screen. Left: a Holidays tab and a Birthdays
 * tab, each a short list (soonest first, a page at a time so nothing
 * scrolls). Right: whatever was tapped, or the public holiday list to add
 * from. Every change waits for the one Save in the header.
 */

type Tab = "holidays" | "birthdays";
type Selection = { kind: "holiday"; id: string } | { kind: "birthday"; id: string } | { kind: "public" } | null;

const PER_PAGE = 7;
const PUBLIC_PER_PAGE = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let counter = 0;
const newId = () => `new-${Date.now()}-${counter++}`;

export function HolidayManager({
  initial,
  today,
  locale,
}: {
  initial: HolidayDraft;
  today: string;
  locale: string;
}) {
  const [draft, setDraft] = useState<HolidayDraft>(initial);
  const [tab, setTab] = useState<Tab>("holidays");
  const [selection, setSelection] = useState<Selection>(initial.holidays.length === 0 ? { kind: "public" } : null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useUnsavedChanges(dirty);

  const update = (change: (d: HolidayDraft) => HolidayDraft) => {
    setError(null);
    setDraft(change);
  };
  const setHoliday = (id: string, changes: Partial<Holiday>) =>
    update((d) => ({ ...d, holidays: d.holidays.map((h) => (h.id === id ? { ...h, ...changes } : h)) }));
  const setBirthday = (id: string, changes: Partial<Birthday>) =>
    update((d) => ({ ...d, birthdays: d.birthdays.map((b) => (b.id === id ? { ...b, ...changes } : b)) }));

  const dateLabel = (date: string | null) =>
    date === null
      ? "Doesn't happen"
      : date === today
        ? "Today"
        : new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric", timeZone: "UTC" }).format(
            new Date(`${date}T12:00:00Z`),
          );

  const save = async (then?: string | null) => {
    setSaving(true);
    const result = await saveHolidays(draft);
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
    setSelection(null);
  };

  // The list on the left: soonest first.
  const holidays = draft.holidays
    .map((h) => ({ h, next: nextDate(h, today) }))
    .toSorted((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999"));
  const birthdays = draft.birthdays.map((b) => ({ b, next: nextDate(b, today) })).toSorted((a, b) => (a.next ?? "").localeCompare(b.next ?? ""));
  const count = tab === "holidays" ? holidays.length : birthdays.length;
  const pages = Math.max(1, Math.ceil(count / PER_PAGE));
  const p = Math.min(page, pages - 1);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(0);
    setSelection(next === "holidays" && draft.holidays.length === 0 ? { kind: "public" } : null);
  };

  const addOwnHoliday = () => {
    const id = newId();
    update((d) => ({ ...d, holidays: [...d.holidays, { id, name: "New holiday", icon: null, rule: { kind: "fixed", month: Number(today.slice(5, 7)), day: Number(today.slice(8)) }, public_key: null }] }));
    setSelection({ kind: "holiday", id });
  };
  const addPublic = (key: string) => {
    const pub = PUBLIC_HOLIDAYS.find((x) => x.key === key);
    if (!pub) return;
    update((d) => ({ ...d, holidays: [...d.holidays, { id: newId(), name: pub.name, icon: pub.icon, rule: pub.rule, public_key: pub.key }] }));
  };
  const addBirthday = () => {
    const id = newId();
    update((d) => ({ ...d, birthdays: [...d.birthdays, { id, name: "", icon: null, month: Number(today.slice(5, 7)), day: Number(today.slice(8)), birth_year: null }] }));
    setSelection({ kind: "birthday", id });
  };

  const selectedHoliday = selection?.kind === "holiday" ? draft.holidays.find((h) => h.id === selection.id) : undefined;
  const selectedBirthday = selection?.kind === "birthday" ? draft.birthdays.find((b) => b.id === selection.id) : undefined;

  return (
    <>
      <ScreenHeader title="Holidays and birthdays">
        <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
      </ScreenHeader>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,24fr)_minmax(0,56fr)]">
        {/* Left: the two tabs and their lists */}
        <section className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-frame bg-board p-4 lg:min-h-0">
          <div className="flex shrink-0 gap-1 rounded-[var(--radius)] bg-rail p-1" role="tablist">
            {(["holidays", "birthdays"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => switchTab(t)}
                className={`flex min-h-[var(--touch-target)] flex-1 items-center justify-center gap-2 rounded-[calc(var(--radius)-0.25rem)] text-lg font-bold ${
                  tab === t ? "bg-board text-ink shadow-sm" : "text-ink-muted"
                }`}
              >
                <Emoji emoji={t === "holidays" ? "🎉" : "🎂"} className="size-7" />
                {t === "holidays" ? "Holidays" : "Birthdays"}
                <span className="text-base text-ink-muted">{t === "holidays" ? draft.holidays.length : draft.birthdays.length}</span>
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-1">
            {tab === "holidays"
              ? holidays.slice(p * PER_PAGE, (p + 1) * PER_PAGE).map(({ h, next }) => (
                  <Row
                    key={h.id}
                    emoji={h.icon || "🎉"}
                    name={h.name || "Unnamed"}
                    detail={dateLabel(next)}
                    active={selection?.kind === "holiday" && selection.id === h.id}
                    onClick={() => setSelection({ kind: "holiday", id: h.id })}
                  />
                ))
              : birthdays.slice(p * PER_PAGE, (p + 1) * PER_PAGE).map(({ b, next }) => (
                  <Row
                    key={b.id}
                    emoji={b.icon || "🎂"}
                    name={b.name || "New birthday"}
                    detail={`${dateLabel(next)}${b.birth_year && next ? ` · turns ${Number(next.slice(0, 4)) - b.birth_year}` : ""}`}
                    active={selection?.kind === "birthday" && selection.id === b.id}
                    onClick={() => setSelection({ kind: "birthday", id: b.id })}
                  />
                ))}
          </ul>
          {count === 0 ? (
            <p className="px-2 text-lg text-ink-muted">{tab === "holidays" ? "No holidays yet. Add some from the public list." : "No birthdays yet."}</p>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {tab === "holidays" ? (
              <>
                <SmallButton onClick={() => setSelection({ kind: "public" })} active={selection?.kind === "public"}>
                  <Emoji emoji="🍁" className="size-6" />
                  Public list
                </SmallButton>
                <SmallButton onClick={addOwnHoliday}>
                  <Plus size="1.25rem" weight="bold" aria-hidden />
                  Your own
                </SmallButton>
              </>
            ) : (
              <SmallButton onClick={addBirthday}>
                <Plus size="1.25rem" weight="bold" aria-hidden />
                Birthday
              </SmallButton>
            )}
            <Pager page={p} pages={pages} onPage={setPage} />
          </div>
        </section>

        {/* Right: what was tapped */}
        <section className="flex min-w-0 flex-col gap-5 rounded-[var(--radius-card)] border border-frame bg-board p-6 lg:min-h-0">
          {selection?.kind === "public" ? (
            <PublicList added={new Set(draft.holidays.flatMap((h) => (h.public_key ? [h.public_key] : [])))} onAdd={addPublic} dateLabel={(r) => dateLabel(nextDate({ rule: r }, today))} />
          ) : selectedHoliday ? (
            <HolidayEditor
              key={selectedHoliday.id}
              holiday={selectedHoliday}
              next={dateLabel(nextDate(selectedHoliday, today))}
              onChange={(c) => setHoliday(selectedHoliday.id, c)}
              onRemove={() => {
                update((d) => ({ ...d, holidays: d.holidays.filter((h) => h.id !== selectedHoliday.id) }));
                setSelection(null);
              }}
            />
          ) : selectedBirthday ? (
            <BirthdayEditor
              key={selectedBirthday.id}
              birthday={selectedBirthday}
              thisYear={Number(today.slice(0, 4))}
              onChange={(c) => setBirthday(selectedBirthday.id, c)}
              onRemove={() => {
                update((d) => ({ ...d, birthdays: d.birthdays.filter((b) => b.id !== selectedBirthday.id) }));
                setSelection(null);
              }}
            />
          ) : tab === "holidays" ? (
            <EmptyState emoji="🎉" title="Tap a holiday to change it" />
          ) : (
            <EmptyState emoji="🎂" title="Tap a birthday to change it" hint="Add a birth year and the calendar shows how old they turn." />
          )}
        </section>
      </div>

      {guard.leaving ? (
        <LeaveDialog what="some holidays or birthdays" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} />
      ) : null}
    </>
  );
}

function Row({ emoji, name, detail, active, onClick }: { emoji: string; name: string; detail: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 text-left ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
      >
        <Emoji emoji={emoji} className="size-10" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-bold text-ink">{name}</span>
          <span className="truncate text-sm font-semibold text-ink-muted">{detail}</span>
        </span>
      </button>
    </li>
  );
}

function SmallButton({ onClick, active = false, children }: { onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-12 items-center gap-2 rounded-2xl px-4 text-base font-bold text-ink ${active ? "bg-ink text-board" : "bg-rail hover:bg-panel"}`}
    >
      {children}
    </button>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const arrow = "flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30";
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 0} aria-label="Previous page" className={arrow}>
        <CaretLeft size="1.25rem" weight="bold" aria-hidden />
      </button>
      <span className="text-base font-bold text-ink-muted tabular-nums">
        {page + 1} of {pages}
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page" className={arrow}>
        <CaretRight size="1.25rem" weight="bold" aria-hidden />
      </button>
    </div>
  );
}

/** The public holidays not added yet, a page at a time; tap one to add it. */
function PublicList({ added, onAdd, dateLabel }: { added: Set<string>; onAdd: (key: string) => void; dateLabel: (rule: HolidayRule) => string }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(PUBLIC_HOLIDAYS.length / PUBLIC_PER_PAGE));
  const p = Math.min(page, pages - 1);
  return (
    <>
      <div className="flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold text-ink">Public holidays</h2>
          <p className="text-base text-ink-muted">Tap the ones you want on your calendar. You can rename them or change the picture after.</p>
        </div>
        <Pager page={p} pages={pages} onPage={setPage} />
      </div>
      <ul className="grid min-h-0 grid-cols-3 content-start gap-2">
        {PUBLIC_HOLIDAYS.slice(p * PUBLIC_PER_PAGE, (p + 1) * PUBLIC_PER_PAGE).map((h) => {
          const on = added.has(h.key);
          return (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => onAdd(h.key)}
                disabled={on}
                className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border-2 px-3 text-left ${on ? "border-transparent bg-rail opacity-60" : "border-frame bg-board hover:border-ink"}`}
              >
                <Emoji emoji={h.icon} className="size-10" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-bold text-ink">{h.name}</span>
                  <span className="truncate text-sm font-semibold text-ink-muted">{on ? "Added" : `${dateLabel(h.rule)} · ${h.where}`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function HolidayEditor({ holiday, next, onChange, onRemove }: { holiday: Holiday; next: string; onChange: (c: Partial<Holiday>) => void; onRemove: () => void }) {
  const fromList = holiday.public_key !== null;
  const rule = holiday.rule;
  return (
    <>
      <div className="flex shrink-0 items-end gap-4">
        <EmojiPicker
          initial={holiday.icon ?? ""}
          fallback="🎉"
          fieldName=""
          nameText={holiday.name}
          onChange={(e) => onChange({ icon: e || null })}
          label={`Picture for ${holiday.name}`}
          className="size-16! self-center!"
          fullScreen
        />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Name</span>
          <input value={holiday.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} className={input} />
        </label>
        <RemoveButton onClick={onRemove} label="Take it away" />
      </div>

      {fromList ? (
        <p className="text-lg text-ink-soft">
          <span className="font-bold text-ink">{describeHolidayRule(rule)}</span>, from the public list. Next: {next}.
        </p>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-base font-bold text-ink">Every year on</span>
            <ChipRow
              options={[
                { value: "fixed", label: "A date" },
                { value: "nth", label: "A weekday" },
              ]}
              value={rule.kind === "nth" ? "nth" : "fixed"}
              onChange={(v) =>
                onChange({
                  rule: v === "nth" ? { kind: "nth", month: "month" in rule ? rule.month : 1, weekday: 1, n: 1 } : { kind: "fixed", month: "month" in rule ? rule.month : 1, day: 1 },
                })
              }
            />
            <span className="ml-auto text-base font-bold text-ink-muted">Next: {next}</span>
          </div>
          {rule.kind === "nth" ? (
            <div className="flex flex-wrap items-center gap-3">
              <ChipRow
                options={[
                  { value: "1", label: "1st" },
                  { value: "2", label: "2nd" },
                  { value: "3", label: "3rd" },
                  { value: "4", label: "4th" },
                  { value: "-1", label: "Last" },
                ]}
                value={String(rule.n)}
                onChange={(v) => onChange({ rule: { ...rule, n: Number(v) } })}
              />
              <ChipRow options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} value={String(rule.weekday)} onChange={(v) => onChange({ rule: { ...rule, weekday: Number(v) } })} />
            </div>
          ) : null}
          {rule.kind === "fixed" || rule.kind === "nth" ? (
            <MonthChips value={rule.month} onChange={(m) => onChange({ rule: { ...rule, month: m } })} />
          ) : null}
          {rule.kind === "fixed" ? <DayInput value={rule.day} onChange={(d) => onChange({ rule: { ...rule, day: d } })} /> : null}
          {rule.kind === "before" || rule.kind === "easter" ? <p className="text-lg text-ink-soft">{describeHolidayRule(rule)}</p> : null}
        </>
      )}
      <p className="mt-auto text-base text-ink-muted">Holidays don&rsquo;t change anyone&rsquo;s days or chores. Do that in the Weekly review.</p>
    </>
  );
}

function BirthdayEditor({ birthday, thisYear, onChange, onRemove }: { birthday: Birthday; thisYear: number; onChange: (c: Partial<Birthday>) => void; onRemove: () => void }) {
  return (
    <>
      <div className="flex shrink-0 items-end gap-4">
        <EmojiPicker
          initial={birthday.icon ?? ""}
          fallback="🎂"
          fieldName=""
          nameText={birthday.name}
          onChange={(e) => onChange({ icon: e || null })}
          label={`Picture for ${birthday.name || "the birthday"}`}
          className="size-16! self-center!"
          fullScreen
        />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Whose birthday</span>
          <input value={birthday.name} maxLength={40} placeholder="Grandma" autoFocus={birthday.name === ""} onChange={(e) => onChange({ name: e.target.value })} className={input} />
        </label>
        <RemoveButton onClick={onRemove} label="Take it away" />
      </div>
      <MonthChips value={birthday.month} onChange={(m) => onChange({ month: m })} />
      <DayInput value={birthday.day} onChange={(d) => onChange({ day: d })} />
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Born in (optional)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1900}
            max={thisYear}
            placeholder="e.g. 2018"
            value={birthday.birth_year ?? ""}
            onChange={(e) => onChange({ birth_year: e.target.value === "" ? null : Number(e.target.value) })}
            className={`${input} w-40`}
          />
        </label>
        {birthday.birth_year && birthday.birth_year <= thisYear ? (
          <span className="pb-3 text-lg font-bold text-ink-soft">Turns {thisYear - birthday.birth_year} this year</span>
        ) : null}
      </div>
    </>
  );
}

const input = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-accent";

function ChipRow({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex min-h-[var(--touch-target)] items-center rounded-full border-2 px-4 text-lg text-ink ${value === o.value ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MonthChips({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">Month</legend>
      <div className="grid grid-cols-6 gap-2">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(i + 1)}
            aria-pressed={value === i + 1}
            className={`flex min-h-[var(--touch-target)] items-center justify-center rounded-full border-2 text-lg text-ink ${value === i + 1 ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
          >
            {m}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The day of the month: 1 to 31 as big tappable numbers, three rows. */
function DayInput({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">Day</legend>
      <div className="grid grid-cols-11 gap-1.5">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={value === d}
            className={`flex min-h-12 items-center justify-center rounded-xl border-2 text-lg tabular-nums text-ink ${value === d ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
          >
            {d}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl px-4 text-base font-bold text-danger hover:bg-rail">
      <Trash size="1.25rem" aria-hidden />
      {label}
    </button>
  );
}
