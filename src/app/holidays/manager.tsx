"use client";

import { Pager as PageArrows } from "@/components/pager";
import { useState, type ReactNode } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { cardClass, choiceChipClass, editorInputClass, EmptyState, Emoji, fieldLabelClass, kickerClass, ScreenHeader, secondaryActionClass, segItemClass, segTrackClass, Toggle } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { describeHolidayRule, nextDate, PUBLIC_HOLIDAYS, type Birthday, type Holiday, type HolidayRule } from "@/lib/holidays";
import { folderNamed, MAX_MIX_DAYS, MAX_ONLY_DAYS, type ArtFolder } from "@/lib/screen-saver";
import { saveHolidays, type HolidayDraft } from "./actions";

/*
 * The Holidays and birthdays screen. The Holidays | Birthdays tabs sit in
 * the header's tab slot. Left: that tab's list (soonest first, a page at a time so nothing
 * scrolls). Right: whatever was tapped, or the public holiday list to add
 * from. Every change waits for the one Save in the header.
 */

type Tab = "holidays" | "birthdays";
type Selection = { kind: "holiday"; id: string } | { kind: "birthday"; id: string } | { kind: "public" } | null;

const PER_PAGE = 10;
const PUBLIC_PER_PAGE = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A new holiday's art days for the screen saver (the database's defaults). */
const ART_DAYS = { art_only_days: 0, art_mix_days: 14 };

let counter = 0;
const newId = () => `new-${Date.now()}-${counter++}`;

export function HolidayManager({
  initial,
  today,
  locale,
  art,
}: {
  initial: HolidayDraft;
  today: string;
  locale: string;
  /** The screen saver's art folders (names and pictures), or null when there's no art folder. */
  art: ArtFolder[] | null;
}) {
  const [draft, setDraft] = useState<HolidayDraft>(initial);
  const [tab, setTab] = useState<Tab>("holidays");
  const [selection, setSelection] = useState<Selection>(initial.holidays.length === 0 ? { kind: "public" } : null);
  const [page, setPage] = useState(0);
  const [listRef, perPage] = useFitRows<HTMLUListElement>(PER_PAGE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useUnsavedChanges(dirty, () => setDraft(initial));

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
  const pages = Math.max(1, Math.ceil(count / perPage));
  const p = Math.min(page, pages - 1);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(0);
    setSelection(next === "holidays" && draft.holidays.length === 0 ? { kind: "public" } : null);
  };

  const addOwnHoliday = () => {
    const id = newId();
    update((d) => ({ ...d, holidays: [...d.holidays, { id, name: "New holiday", icon: null, rule: { kind: "fixed", month: Number(today.slice(5, 7)), day: Number(today.slice(8)) }, public_key: null, ...ART_DAYS }] }));
    setSelection({ kind: "holiday", id });
  };
  const addPublic = (key: string) => {
    const pub = PUBLIC_HOLIDAYS.find((x) => x.key === key);
    if (!pub) return;
    update((d) => ({ ...d, holidays: [...d.holidays, { id: newId(), name: pub.name, icon: pub.icon, rule: pub.rule, public_key: pub.key, ...ART_DAYS }] }));
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
      <ScreenHeader
        title="Holidays"
        sub="and birthdays"
        tabs={
          <div role="tablist" aria-label="Holidays or birthdays" className={segTrackClass}>
            {(["holidays", "birthdays"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => switchTab(t)} className={segItemClass(tab === t)}>
                {t === "holidays" ? "Holidays" : "Birthdays"}
              </button>
            ))}
          </div>
        }
        action={<SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />}
      />

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[26rem_minmax(0,1fr)]">
        {/* Left: this tab's list, soonest first */}
        <section aria-label={tab === "holidays" ? "Holidays" : "Birthdays"} className={`${cardClass} gap-[0.2rem]`}>
          <h2 className="flex shrink-0 items-baseline gap-3 text-[1.75rem] font-bold text-ink">
            {tab === "holidays" ? "Holidays" : "Birthdays"}
            <span className="text-[1.25rem] font-semibold text-ink-muted tabular-nums">{count}</span>
          </h2>
          {count === 0 ? (
            <p className="py-3 text-[1.25rem] font-bold text-ink-muted">{tab === "holidays" ? "No holidays yet" : "No birthdays yet"}</p>
          ) : null}
          <ul ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {tab === "holidays"
              ? holidays.slice(p * perPage, (p + 1) * perPage).map(({ h, next }) => (
                  <Row
                    key={h.id}
                    emoji={h.icon || "🎉"}
                    name={h.name || "Unnamed"}
                    detail={dateLabel(next)}
                    active={selection?.kind === "holiday" && selection.id === h.id}
                    onClick={() => setSelection({ kind: "holiday", id: h.id })}
                  />
                ))
              : birthdays.slice(p * perPage, (p + 1) * perPage).map(({ b, next }) => (
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
          <PageArrows page={p} pages={pages} onPage={setPage} className="justify-center pt-2" />
          <div className="mt-auto flex shrink-0 items-center gap-2 pt-2">
            {tab === "holidays" ? (
              <>
                <button type="button" onClick={() => setSelection({ kind: "public" })} aria-pressed={selection?.kind === "public"} className={`${secondaryActionClass} flex-1 px-4! text-[1.25rem]! ${selection?.kind === "public" ? "bg-ink! text-board!" : ""}`}>
                  <Emoji emoji="🍁" className="size-7" />
                  Public list
                </button>
                <button type="button" onClick={addOwnHoliday} className={`${secondaryActionClass} flex-1 px-4! text-[1.25rem]!`}>
                  <Plus size="1.25rem" weight="bold" aria-hidden />
                  Your own
                </button>
              </>
            ) : (
              <button type="button" onClick={addBirthday} className={`${secondaryActionClass} flex-1 text-[1.25rem]!`}>
                <Plus size="1.25rem" weight="bold" aria-hidden />
                Birthday
              </button>
            )}
          </div>
        </section>

        {/* Right: what was tapped */}
        <section aria-label="Details" className={`${cardClass} gap-5`}>
          {selection?.kind === "public" ? (
            <PublicList added={new Set(draft.holidays.flatMap((h) => (h.public_key ? [h.public_key] : [])))} onAdd={addPublic} dateLabel={(r) => dateLabel(nextDate({ rule: r }, today))} />
          ) : selectedHoliday ? (
            <HolidayEditor
              key={selectedHoliday.id}
              holiday={selectedHoliday}
              next={dateLabel(nextDate(selectedHoliday, today))}
              art={art}
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
              art={art}
              onChange={(c) => setBirthday(selectedBirthday.id, c)}
              onRemove={() => {
                update((d) => ({ ...d, birthdays: d.birthdays.filter((b) => b.id !== selectedBirthday.id) }));
                setSelection(null);
              }}
            />
          ) : tab === "holidays" ? (
            <EmptyState emoji="🎉" title="Tap a holiday" hint="Or add one from the public list, or your own." />
          ) : (
            <EmptyState emoji="🎂" title="Tap a birthday" hint="Or add a new one." />
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
        className={`flex min-h-16 w-full items-center gap-[0.65rem] rounded-[var(--radius)] px-[0.7rem] py-1 text-left ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
      >
        <Emoji emoji={emoji} className="size-[2.15rem]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[1.5rem] leading-[1.1] font-extrabold text-ink">{name}</span>
          <span className="truncate text-[1.15rem] font-bold text-ink-muted tabular-nums">{detail}</span>
        </span>
      </button>
    </li>
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
        <h2 className="min-w-0 flex-1 text-[1.75rem] font-bold text-ink">Public holidays</h2>
        <span className="text-[1.25rem] font-bold text-ink-muted">Tap one to add it</span>
        <PageArrows page={p} pages={pages} onPage={setPage} className="ml-4" />
      </div>
      <ul className="grid min-h-0 grid-cols-3 content-start gap-3">
        {PUBLIC_HOLIDAYS.slice(p * PUBLIC_PER_PAGE, (p + 1) * PUBLIC_PER_PAGE).map((h) => {
          const on = added.has(h.key);
          return (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => onAdd(h.key)}
                disabled={on}
                className={`flex min-h-[5.5rem] w-full items-center gap-[0.7rem] rounded-[var(--radius)] border-2 px-[0.9rem] text-left ${on ? "border-transparent bg-rail" : "border-frame bg-board hover:border-ink"}`}
              >
                <Emoji emoji={h.icon} className="size-[2.6rem]" faded={on} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-[1.35rem] font-extrabold ${on ? "text-ink-muted" : "text-ink"}`}>{h.name}</span>
                  <span className="truncate text-[1.15rem] font-bold text-ink-muted">{on ? "Added" : `${dateLabel(h.rule)} · ${h.where}`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The picture, the name box and the remove button at the top of an editor. */
function EditorTop({ picker, label, value, onName, autoFocus, onRemove }: { picker: ReactNode; label: string; value: string; onName: (v: string) => void; autoFocus?: boolean; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 items-end gap-4">
      {picker}
      <label className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
        <span className={fieldLabelClass}>{label}</span>
        <input value={value} maxLength={40} autoFocus={autoFocus} onChange={(e) => onName(e.target.value)} className={`${editorInputClass} text-[1.75rem]!`} />
      </label>
      <button type="button" onClick={onRemove} className={`${secondaryActionClass} text-danger!`}>
        <Trash size="1.25rem" aria-hidden />
        Take it away
      </button>
    </div>
  );
}

function HolidayEditor({ holiday, next, art, onChange, onRemove }: { holiday: Holiday; next: string; art: ArtFolder[] | null; onChange: (c: Partial<Holiday>) => void; onRemove: () => void }) {
  const fromList = holiday.public_key !== null;
  const rule = holiday.rule;
  return (
    <>
      <EditorTop
        picker={
          <EmojiPicker
            initial={holiday.icon ?? ""}
            fallback="🎉"
            fieldName=""
            nameText={holiday.name}
            onChange={(e) => onChange({ icon: e || null })}
            label={`Picture for ${holiday.name}`}
            className="size-[4.5rem]! self-end!"
            fullScreen
          />
        }
        label="Name"
        value={holiday.name}
        onName={(name) => onChange({ name })}
        onRemove={onRemove}
      />

      {fromList ? (
        <p className="text-[1.5rem] font-bold text-ink-soft">
          <span className="text-ink">{describeHolidayRule(rule)}</span>, from the public list. Next: <span className="tabular-nums">{next}</span>.
        </p>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-4">
            <span className={fieldLabelClass}>Every year on</span>
            <div className="w-[22rem]">
              <Toggle
                label="Every year on"
                value={rule.kind === "nth" ? "nth" : rule.kind === "fixed" ? "fixed" : null}
                options={[
                  { value: "fixed", label: "A date" },
                  { value: "nth", label: "A weekday" },
                ]}
                onChange={(v) =>
                  onChange({
                    rule: v === "nth" ? { kind: "nth", month: "month" in rule ? rule.month : 1, weekday: 1, n: 1 } : { kind: "fixed", month: "month" in rule ? rule.month : 1, day: 1 },
                  })
                }
              />
            </div>
            <span className="ml-auto text-[1.25rem] font-bold text-ink-muted tabular-nums">Next: {next}</span>
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
          {rule.kind === "fixed" || rule.kind === "nth" ? <MonthChips value={rule.month} onChange={(m) => onChange({ rule: { ...rule, month: m } })} /> : null}
          {rule.kind === "fixed" ? <DayInput value={rule.day} onChange={(d) => onChange({ rule: { ...rule, day: d } })} /> : null}
          {rule.kind === "before" || rule.kind === "easter" ? <p className="text-[1.5rem] font-bold text-ink-soft">{describeHolidayRule(rule)}</p> : null}
        </>
      )}
      {art ? (
        <ArtBox folder={folderNamed(art, holiday.name)} name={holiday.name}>
          <Stepper label="Only its art, days before" value={holiday.art_only_days} max={MAX_ONLY_DAYS} onChange={(art_only_days) => onChange({ art_only_days })} />
          <Stepper label="Mixed in, days before" value={holiday.art_mix_days} max={MAX_MIX_DAYS} onChange={(art_mix_days) => onChange({ art_mix_days })} />
        </ArtBox>
      ) : null}
    </>
  );
}

function BirthdayEditor({ birthday, thisYear, art, onChange, onRemove }: { birthday: Birthday; thisYear: number; art: ArtFolder[] | null; onChange: (c: Partial<Birthday>) => void; onRemove: () => void }) {
  return (
    <>
      <EditorTop
        picker={
          <EmojiPicker
            initial={birthday.icon ?? ""}
            fallback="🎂"
            fieldName=""
            nameText={birthday.name}
            onChange={(e) => onChange({ icon: e || null })}
            label={`Picture for ${birthday.name || "the birthday"}`}
            className="size-[4.5rem]! self-end!"
            fullScreen
          />
        }
        label="Whose birthday"
        value={birthday.name}
        onName={(name) => onChange({ name })}
        autoFocus={birthday.name === ""}
        onRemove={onRemove}
      />
      <MonthChips value={birthday.month} onChange={(m) => onChange({ month: m })} />
      <DayInput value={birthday.day} onChange={(d) => onChange({ day: d })} />
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-[0.35rem]">
          <span className={fieldLabelClass}>Born in (optional)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1900}
            max={thisYear}
            value={birthday.birth_year ?? ""}
            onChange={(e) => onChange({ birth_year: e.target.value === "" ? null : Number(e.target.value) })}
            className={`${editorInputClass} w-44! tabular-nums`}
          />
        </label>
        {birthday.birth_year && birthday.birth_year <= thisYear ? (
          <span className="pb-3 text-[1.5rem] font-bold text-ink-soft tabular-nums">Turns {thisYear - birthday.birth_year} this year</span>
        ) : null}
      </div>
      {art && birthday.name.trim() ? <ArtBox folder={folderNamed(art, birthday.name, true)} name={birthday.name} /> : null}
    </>
  );
}

function ChipRow({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={choiceChipClass(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MonthChips({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-[0.35rem]">
      <legend className={`${fieldLabelClass} mb-[0.35rem]`}>Month</legend>
      <div className="grid grid-cols-12 gap-2">
        {MONTHS.map((m, i) => (
          <button key={m} type="button" onClick={() => onChange(i + 1)} aria-pressed={value === i + 1} className={`${choiceChipClass(value === i + 1)} px-0!`}>
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
    <fieldset className="flex flex-col gap-[0.35rem]">
      <legend className={`${fieldLabelClass} mb-[0.35rem]`}>Day</legend>
      <div className="grid grid-cols-11 gap-2">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={value === d}
            className={`flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] border-2 text-[1.35rem] font-bold tabular-nums ${value === d ? "border-ink bg-rail text-ink" : "border-frame bg-board text-ink-soft"}`}
          >
            {d}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The screen saver's art for a holiday or birthday: its folder (found by name) and, for a holiday, its days. */
function ArtBox({ folder, name, children }: { folder: ArtFolder | null; name: string; children?: ReactNode }) {
  return (
    <div className="mt-auto flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 rounded-[var(--radius-card)] bg-rail px-[1.1rem] py-4">
      <span className="flex min-w-0 items-center gap-3">
        <Emoji emoji="🖼" className="size-10" faded={!folder} />
        <span className="flex min-w-0 flex-col">
          <span className={kickerClass}>Screen saver art</span>
          <span className="truncate text-[1.35rem] font-bold text-ink">
            {folder ? `${folder.name} · ${folder.files.length === 1 ? "1 painting" : `${folder.files.length} paintings`}` : `No folder named ${name.trim() || "this"}`}
          </span>
        </span>
      </span>
      {children ? <span className="ml-auto flex flex-wrap items-center gap-6">{children}</span> : null}
    </div>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const step = "flex size-[var(--touch-target)] items-center justify-center rounded-full bg-board text-[1.75rem] font-bold text-ink shadow-raised disabled:opacity-40";
  return (
    <span className="flex items-center gap-2">
      <span className="text-[1.25rem] font-bold text-ink">{label}</span>
      <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className={step}>
        −
      </button>
      <span className="w-10 text-center text-[1.5rem] font-extrabold text-ink tabular-nums">{value}</span>
      <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={step}>
        +
      </button>
    </span>
  );
}
