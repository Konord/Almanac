"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, CheckCircle, Plus, Sparkle, Suitcase, X } from "@phosphor-icons/react";
import { Avatar, Emoji } from "@/components/ui";
import { LeaveDialog, useUnsavedChanges } from "@/components/unsaved-changes";
import { eventEmoji } from "@/lib/emoji";
import {
  addChoreDay,
  applyFix,
  dismiss,
  mealIsOff,
  moveChoreDay,
  reviewProblems,
  setDayType,
  setMeal,
  takeOffChoreDay,
  type ReviewDraft,
} from "@/lib/weekly-review";
import { saveReview } from "./actions";
import type { ReviewColumn, ReviewData } from "./data";

/** What the picker box offers. */
type Picker = { title: string; options: { key: string; label: string; icon?: string | null; danger?: boolean; pick: () => void }[] };

/** How many problems show at once (fixing one shows the next). */
const PROBLEMS_SHOWN = 3;
/** How many choices fit in the picker box before it pages. */
const PICKS_SHOWN = 12;

/**
 * The weekly review: seven days side by side, each with everyone's kind of
 * day, its chore days, its meals and a glance at its plans. Tap any of them
 * to change it. Problems show along the bottom with a fix to approve. All
 * changes wait for Confirm week.
 */
export function ReviewBoard({ data, range, weekHref }: { data: ReviewData; range: string; weekHref: { prev: string; next: string; coming: string; isComing: boolean } }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ReviewDraft>(data.initial);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goTo, setGoTo] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.initial);
  const guard = useUnsavedChanges(dirty);

  const choreDay = new Map(data.choreDays.map((d) => [d.id, d]));
  const freeDay = data.choreDays.find((d) => d.is_free);
  const dayType = new Map(data.dayTypes.map((t) => [t.id, t]));
  const category = new Map(data.categories.map((c) => [c.id, c]));
  const open = data.columns.filter((c) => !c.past);

  const change = (f: (d: ReviewDraft) => ReviewDraft) => {
    setError(null);
    setDraft(f);
    setPicker(null);
  };
  const ask = (p: Picker) => {
    setPage(0);
    setPicker(p);
  };

  const problems = reviewProblems({
    draft,
    days: data.columns,
    choreDays: data.choreDays,
    categoryNames: Object.fromEntries(data.categories.map((c) => [c.id, c.name])),
    hardChores: data.hardChores,
  });
  const flagged = new Set(problems.map((p) => p.date));

  const confirm = async (then?: string | null) => {
    setSaving(true);
    const result = await saveReview(data.week, draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      setGoTo(null);
      return;
    }
    guard.saved(then ?? goTo);
    setGoTo(null);
  };
  /** Another week: ask first when there are changes (the menu's links ask by themselves). */
  const go = (href: string) => (dirty ? setGoTo(href) : router.push(href));

  // --- What tapping each thing offers --------------------------------------

  const pickDayType = (col: ReviewColumn, memberId: string, name: string) =>
    ask({
      title: `${name} on ${col.name}`,
      options: data.dayTypes
        .filter((t) => t.member_id === memberId)
        .map((t) => ({ key: t.id, label: t.name, icon: t.icon, pick: () => change((d) => setDayType(d, col.date, memberId, t.id)) })),
    });

  const pickChoreDay = (col: ReviewColumn, id: string) => {
    const cd = choreDay.get(id);
    if (!cd) return;
    ask({
      title: `${cd.name} on ${col.name}`,
      options: [
        ...open
          .filter((c) => c.date !== col.date && !(draft.choreDays[c.date] ?? []).includes(id))
          .map((c) => ({ key: c.date, label: `Move to ${c.name}`, icon: cd.icon, pick: () => change((d) => moveChoreDay(d, id, col.date, c.date)) })),
        { key: "off", label: `Take off ${col.name}`, danger: true, pick: () => change((d) => takeOffChoreDay(d, col.date, id)) },
      ],
    });
  };

  const addChore = (col: ReviewColumn) =>
    ask({
      title: `Another chore day on ${col.name}`,
      options: data.choreDays
        .filter((cd) => !cd.is_free && !(draft.choreDays[col.date] ?? []).includes(cd.id))
        .map((cd) => ({ key: cd.id, label: cd.name, icon: cd.icon, pick: () => change((d) => addChoreDay(d, col.date, cd.id)) })),
    });

  const pickMeal = (col: ReviewColumn, mealId: string, title: string) => {
    const time = data.mealTimeOf[mealId];
    const now = mealId in draft.meals ? draft.meals[mealId] : undefined;
    ask({
      title: `${title} on ${col.name}`,
      options: [
        ...data.categories
          .filter((c) => (c.meal_time_ids.length === 0 || c.meal_time_ids.includes(time)) && c.id !== now)
          .map((c) => ({ key: c.id, label: c.name, icon: c.icon, pick: () => change((d) => setMeal(d, mealId, c.id)) })),
        mealIsOff(draft, mealId)
          ? {
              key: "back",
              label: "Put it back",
              pick: () =>
                change((d) => {
                  const meals = { ...d.meals };
                  delete meals[mealId];
                  return { ...d, meals };
                }),
            }
          : { key: "off", label: "Take it off", danger: true, pick: () => change((d) => setMeal(d, mealId, null)) },
      ],
    });
  };

  // --- The screen ----------------------------------------------------------

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 lg:h-18 lg:flex-nowrap">
        <h1 className="text-3xl font-extrabold tracking-[-0.03rem] text-ink lg:text-5xl">Weekly review</h1>
        <div className="flex items-center gap-1 rounded-2xl bg-panel p-1.25">
          <WeekButton label="Week before" onClick={() => go(weekHref.prev)} icon="prev" />
          <span className="px-2 text-lg font-bold text-ink">{range}</span>
          <WeekButton label="Week after" onClick={() => go(weekHref.next)} icon="next" />
        </div>
        {weekHref.isComing ? null : (
          <button type="button" onClick={() => go(weekHref.coming)} className="flex min-h-[var(--touch-target)] items-center rounded-2xl px-3 text-base font-bold text-accent">
            The coming week
          </button>
        )}
        {data.reviewed ? (
          <span className="flex items-center gap-1.5 text-base font-bold text-success">
            <CheckCircle size="1.375rem" weight="fill" aria-hidden />
            Confirmed
          </span>
        ) : null}
        <p className="text-base text-ink-muted lg:ml-auto">Tap anything to change it.</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {data.columns.map((col) => (
          <section
            key={col.date}
            className={`flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden rounded-[var(--radius-card)] border px-2.5 py-3 ${
              col.past ? "border-frame bg-rail opacity-55" : flagged.has(col.date) ? "border-accent bg-board" : "border-frame bg-board"
            }`}
            aria-label={col.name}
          >
            <div className="flex items-center gap-1.5">
              <h2 className="min-w-0 flex-1 truncate text-2xl font-extrabold text-ink">{col.label}</h2>
              {col.away ? <Badge icon="away" label="Away" /> : col.busy ? <Badge icon="busy" label="Busy" /> : null}
            </div>

            <Group title="Kind of day">
              {data.members.map((m) => {
                const t = dayType.get(draft.dayTypes[col.date]?.[m.id] ?? "");
                const changed = (data.initial.dayTypes[col.date]?.[m.id] ?? "") !== (draft.dayTypes[col.date]?.[m.id] ?? "");
                return (
                  <Tap key={m.id} disabled={col.past} changed={changed} onClick={() => pickDayType(col, m.id, m.name)} title={`${m.name}: ${t?.name ?? "No kind of day"}`}>
                    <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" />
                    <Emoji emoji={t?.icon} className="size-6" />
                    <span className="min-w-0 truncate">{t?.name ?? "—"}</span>
                  </Tap>
                );
              })}
            </Group>

            <Group title="Chores">
              {(draft.choreDays[col.date] ?? []).length === 0 ? (
                <span className="flex min-h-11 items-center gap-2 px-1.5 text-lg font-bold text-ink-muted">
                  <Emoji emoji={col.away ? "🧳" : (freeDay?.icon ?? "🌿")} className="size-6" />
                  <span className="truncate">{col.away ? "None: away" : (freeDay?.name ?? "Free day")}</span>
                </span>
              ) : (
                (draft.choreDays[col.date] ?? []).map((id) => {
                  const cd = choreDay.get(id);
                  const changed = !(data.initial.choreDays[col.date] ?? []).includes(id);
                  return (
                    <Tap key={id} disabled={col.past} changed={changed} onClick={() => pickChoreDay(col, id)} title={cd?.name ?? ""}>
                      <Emoji emoji={cd?.icon ?? "🧹"} className="size-6" />
                      <span className="min-w-0 truncate">{cd?.name}</span>
                    </Tap>
                  );
                })
              )}
              {col.past ? null : (
                <button
                  type="button"
                  onClick={() => addChore(col)}
                  className="flex min-h-11 items-center gap-1 rounded-xl px-1.5 text-base font-bold text-ink-muted hover:bg-rail"
                  aria-label={`Add a chore day on ${col.name}`}
                >
                  <Plus size="1rem" weight="bold" aria-hidden />
                  Chore day
                </button>
              )}
            </Group>

            <Group title="Meals">
              {col.meals.length === 0 ? <span className="px-1.5 text-lg text-ink-muted">Nothing planned</span> : null}
              {col.meals.map((meal) => {
                const swapped = draft.meals[meal.id];
                const off = mealIsOff(draft, meal.id);
                const look = swapped ? { title: category.get(swapped)?.name ?? "Meal", icon: category.get(swapped)?.icon ?? "🍽️" } : col.mealLooks[meal.id];
                return (
                  <Tap
                    key={meal.id}
                    disabled={col.past}
                    changed={meal.id in draft.meals}
                    meal
                    onClick={() => pickMeal(col, meal.id, meal.mealTimeName)}
                    title={`${meal.mealTimeName}: ${look?.title}`}
                  >
                    <Emoji emoji={look?.icon} className="size-6" faded={off} />
                    <span className={`min-w-0 truncate ${off ? "text-ink-muted line-through" : ""}`}>{look?.title}</span>
                  </Tap>
                );
              })}
            </Group>

            <Group title="Plans" grow>
              {col.events.length === 0 ? <span className="px-1.5 text-lg text-ink-muted">Nothing on</span> : null}
              {col.events.map((e) => (
                <span key={e.id} className="flex min-h-8 items-center gap-1.5 px-1.5 text-base text-ink">
                  <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-5" />
                  {e.time ? <span className="shrink-0 font-bold text-ink-muted">{e.time}</span> : null}
                  <span className="min-w-0 truncate">{e.title}</span>
                </span>
              ))}
              {col.moreEvents > 0 ? <span className="px-1.5 text-sm font-bold text-ink-muted">+ {col.moreEvents} more</span> : null}
            </Group>
          </section>
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 rounded-[var(--radius-card)] bg-rail px-4 py-3" aria-label="Things to check">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <Sparkle size="1.25rem" weight="fill" className="text-accent" aria-hidden />
            {problems.length === 0 ? "Nothing to check this week" : `Things to check (${problems.length})`}
          </h2>
          {problems.length === 0 ? <p className="text-base text-ink-muted">Every day has its usual kind of day, chore days and meals, with nothing in the way.</p> : null}
          {problems.slice(0, PROBLEMS_SHOWN).map((p) => (
            <div key={p.id} className="flex min-h-10 items-center gap-2.5">
              <p className="min-w-0 flex-1 truncate text-base text-ink" title={p.text}>
                {p.text}
              </p>
              {p.fix ? (
                <button
                  type="button"
                  onClick={() => change((d) => applyFix(d, p.fix!.apply))}
                  className="flex min-h-10 shrink-0 items-center rounded-xl bg-ink px-3.5 text-base font-bold text-board"
                >
                  {p.fix.label}
                </button>
              ) : null}
              {p.link ? (
                <Link href={p.link.href} className="flex min-h-10 shrink-0 items-center rounded-xl bg-board px-3.5 text-base font-bold text-ink">
                  {p.link.label}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => change((d) => dismiss(d, p.id))}
                className="flex min-h-10 shrink-0 items-center rounded-xl px-2.5 text-base font-bold text-ink-muted hover:bg-board"
              >
                Leave it
              </button>
            </div>
          ))}
          {problems.length > PROBLEMS_SHOWN ? <p className="text-sm font-bold text-ink-muted">+ {problems.length - PROBLEMS_SHOWN} more after these</p> : null}
        </section>

        <section className={`flex shrink-0 flex-col justify-center gap-2.5 rounded-[var(--radius-card)] px-4 py-3 lg:w-80 ${dirty ? "bg-[color-mix(in_srgb,var(--color-accent)_9%,white)]" : "bg-rail"}`}>
          <p className={`text-base font-bold ${error ? "text-danger" : dirty ? "text-accent" : "text-ink-muted"}`} role="status">
            {error ?? (dirty ? "You have changes that aren't saved yet." : data.reviewed ? "This week is confirmed. Change anything and confirm again." : "Looks right? Confirm the week.")}
          </p>
          <div className="flex gap-2">
            {dirty ? (
              <button type="button" onClick={() => setDraft(data.initial)} disabled={saving} className="flex min-h-[var(--touch-target)] items-center rounded-xl px-3 text-base font-bold text-ink hover:bg-board">
                Undo changes
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => confirm()}
              disabled={saving || open.length === 0}
              className="ml-auto flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-ink px-6 text-lg font-bold text-board disabled:opacity-40"
            >
              {saving ? "Saving…" : "Confirm week"}
            </button>
          </div>
        </section>
      </div>

      {picker ? <PickerBox picker={picker} page={page} setPage={setPage} onClose={() => setPicker(null)} /> : null}
      {guard.leaving || goTo ? (
        <LeaveDialog
          what="this week"
          saving={saving}
          onSave={() => confirm(guard.leaving ?? goTo)}
          onStay={() => {
            guard.stay();
            setGoTo(null);
          }}
          onLeave={() => {
            if (goTo) {
              const to = goTo;
              setGoTo(null);
              setDraft(data.initial);
              router.push(to);
            } else guard.leaveWithoutSaving();
          }}
        />
      ) : null}
    </>
  );
}

function WeekButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: "prev" | "next" }) {
  const Icon = icon === "prev" ? CaretLeft : CaretRight;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-[var(--touch-target)] items-center justify-center rounded-xl text-ink hover:bg-board">
      <Icon size="1.5rem" weight="bold" aria-hidden />
    </button>
  );
}

function Badge({ icon, label }: { icon: "away" | "busy"; label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-panel px-1.5 py-0.5 text-xs font-bold text-ink-soft">
      {icon === "away" ? <Suitcase size="0.875rem" aria-hidden /> : null}
      {label}
    </span>
  );
}

function Group({ title, grow = false, children }: { title: string; grow?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col gap-0.5 ${grow ? "flex-1 overflow-hidden" : "shrink-0"}`}>
      <h3 className="px-1.5 text-sm font-bold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}

/** A tappable row in a day: a kind of day, a chore day or a meal. Dashed when changed. */
function Tap({
  children,
  onClick,
  disabled,
  changed,
  meal = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  changed: boolean;
  meal?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border-2 px-1.5 text-left text-lg font-bold text-ink ${
        changed ? "border-dashed border-accent" : "border-transparent"
      } ${meal ? "bg-meal text-meal-ink" : "hover:bg-rail"}`}
    >
      {children}
    </button>
  );
}

function PickerBox({ picker, page, setPage, onClose }: { picker: Picker; page: number; setPage: (p: number) => void; onClose: () => void }) {
  const pages = Math.max(1, Math.ceil(picker.options.length / PICKS_SHOWN));
  const shown = picker.options.slice(page * PICKS_SHOWN, (page + 1) * PICKS_SHOWN);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,35,45,0.35)]" role="dialog" aria-label={picker.title} onClick={onClose}>
      <div className="flex w-[44rem] max-w-[92vw] flex-col gap-4 rounded-[var(--radius-card)] bg-board p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-2xl font-extrabold text-ink">{picker.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-[var(--touch-target)] items-center justify-center rounded-xl text-ink hover:bg-rail">
            <X size="1.5rem" weight="bold" aria-hidden />
          </button>
        </div>
        {shown.length === 0 ? <p className="text-lg text-ink-muted">Nothing else to pick.</p> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.pick}
              className={`flex min-h-[var(--touch-target)] min-w-0 items-center gap-2 rounded-[var(--radius)] px-3 text-left text-lg font-bold ${
                o.danger ? "bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] text-danger" : "bg-rail text-ink hover:bg-panel"
              }`}
            >
              {o.icon ? <Emoji emoji={o.icon} className="size-7" /> : null}
              <span className="min-w-0 truncate">{o.label}</span>
            </button>
          ))}
        </div>
        {pages > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-base text-ink-muted">
              {page + 1} of {pages}
            </span>
            <button type="button" onClick={() => setPage((page + 1) % pages)} className="flex min-h-11 items-center rounded-xl bg-rail px-4 text-base font-bold text-ink">
              More
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
