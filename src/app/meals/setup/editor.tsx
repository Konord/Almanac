"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CaretLeft, CaretRight, Plus, Trash } from "@phosphor-icons/react";
import { Card, Emoji, ScreenHeader, Segmented } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { saveMealSetup } from "../actions";
import { MENU_TABS } from "../menu-tabs";
import type { MealCategory } from "../data";
import type { MealSetupDraft, MealTimeDraft } from "./draft";

/*
 * Meal times (rebuilt 2026-11-10 for one Save): the meal times (rows in the
 * weekly review) and presets (Tuesday dinner is Tacos). Every change waits
 * for Save in the header; leaving with changes asks first.
 */

type Tab = "times" | "presets";
const PER_PAGE = 7;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let counter = 0;
const newId = () => `new-${Date.now()}-${counter++}`;

const inputClass = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-accent";

export function MealSetupEditor({ initial, categories, weekStartsOn }: { initial: MealSetupDraft; categories: MealCategory[]; weekStartsOn: 0 | 1 }) {
  const [draft, setDraft] = useState<MealSetupDraft>(initial);
  const [tab, setTab] = useState<Tab>("times");
  const [page, setPage] = useState(0);
  const [listRef, perPage] = useFitRows<HTMLUListElement>(PER_PAGE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useUnsavedChanges(dirty);

  const update = (change: (d: MealSetupDraft) => MealSetupDraft) => {
    setError(null);
    setDraft(change);
  };
  const setTime = (id: string, changes: Partial<MealTimeDraft>) => update((d) => ({ ...d, times: d.times.map((t) => (t.id === id ? { ...t, ...changes } : t)) }));
  const move = (i: number, by: -1 | 1) =>
    update((d) => {
      const times = [...d.times];
      [times[i], times[i + by]] = [times[i + by], times[i]];
      return { ...d, times };
    });
  const remove = (id: string) =>
    update((d) => ({
      times: d.times.filter((t) => t.id !== id),
      presets: Object.fromEntries(Object.entries(d.presets).filter(([key]) => key.split("|")[1] !== id)),
    }));
  const add = () => {
    update((d) => ({ ...d, times: [...d.times, { id: newId(), name: "", icon: null, usual: "12:00", onPlanner: true }] }));
    setPage(Math.floor(draft.times.length / perPage));
  };

  const save = async (then?: string | null) => {
    setSaving(true);
    const result = await saveMealSetup(draft);
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

  const pages = Math.max(1, Math.ceil(draft.times.length / perPage));
  const p = Math.min(page, pages - 1);
  const shown = draft.times.slice(p * perPage, (p + 1) * perPage);
  const presetTimes = draft.times.filter((t) => t.onPlanner).slice(0, 5);
  const days = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);

  return (
    <>
      <ScreenHeader title="Meal times">
        <nav aria-label="Setup" className="flex gap-1 rounded-2xl bg-panel p-1.25">
          {(
            [
              { tab: "times", label: "Meal times" },
              { tab: "presets", label: "Presets" },
            ] as const
          ).map((t) => (
            <button
              key={t.tab}
              type="button"
              onClick={() => setTab(t.tab)}
              aria-pressed={tab === t.tab}
              className={`flex min-h-[var(--touch-target)] items-center rounded-xl px-5 text-base font-bold ${tab === t.tab ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4 lg:ml-auto">
          <Segmented label="Menu Manager" options={MENU_TABS.map((t) => ({ href: t.href, label: t.label, active: t.tab === "setup" }))} />
          <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
        </div>
      </ScreenHeader>

      {tab === "times" ? (
        <Card
          title="Meal times"
          className="lg:flex-1"
          aside={
            pages > 1 ? (
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)} className="flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
                  <CaretLeft size="1.25rem" weight="bold" aria-hidden />
                </button>
                <span className="text-base font-bold text-ink-muted">
                  {p + 1} of {pages}
                </span>
                <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
                  <CaretRight size="1.25rem" weight="bold" aria-hidden />
                </button>
              </div>
            ) : null
          }
        >
          <p className="mb-3 text-lg text-ink-muted">Each meal time is a row in the weekly review. Taking one away also takes away the meals planned in it.</p>
          <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            {shown.map((t, k) => {
              const i = p * perPage + k;
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-rail p-2.5">
                  <EmojiPicker initial={t.icon ?? ""} fieldName="" nameText={t.name} onChange={(icon) => setTime(t.id, { icon: icon || null })} label={`Picture for ${t.name || "this meal time"}`} fullScreen />
                  <input value={t.name} onChange={(e) => setTime(t.id, { name: e.target.value })} aria-label="Name" placeholder="Like Breakfast" maxLength={30} autoFocus={!t.name} className={`${inputClass} min-w-0 flex-1`} />
                  <input type="time" value={t.usual} onChange={(e) => setTime(t.id, { usual: e.target.value })} aria-label="Usual time" className={`${inputClass} w-44`} />
                  <button
                    type="button"
                    aria-pressed={t.onPlanner}
                    onClick={() => setTime(t.id, { onPlanner: !t.onPlanner })}
                    className={`flex min-h-[var(--touch-target)] shrink-0 items-center rounded-full border-2 px-4 text-lg text-ink ${t.onPlanner ? "border-ink bg-board font-bold" : "border-frame bg-rail text-ink-muted"}`}
                  >
                    {t.onPlanner ? "On the planner" : "Not on the planner"}
                  </button>
                  {([-1, 1] as const).map((by) => (
                    <button
                      key={by}
                      type="button"
                      aria-label={by === -1 ? "Move up" : "Move down"}
                      disabled={by === -1 ? i === 0 : i === draft.times.length - 1}
                      onClick={() => move(i, by)}
                      className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-board text-ink disabled:opacity-30"
                    >
                      {by === -1 ? <ArrowUp size="1.375rem" weight="bold" aria-hidden /> : <ArrowDown size="1.375rem" weight="bold" aria-hidden />}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={`Remove ${t.name || "this meal time"}`}
                    disabled={draft.times.length <= 1}
                    onClick={() => remove(t.id)}
                    className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full text-danger hover:bg-board disabled:opacity-30"
                  >
                    <Trash size="1.375rem" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={add} className="mt-3 flex min-h-[var(--touch-target)] items-center gap-2 self-start rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel">
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Add a meal time
          </button>
        </Card>
      ) : (
        <Card title="Presets" className="lg:flex-1">
          <p className="mb-3 text-lg text-ink-muted">A preset puts a category on the planner each week (Tuesday dinner is Tacos). You just choose which tacos.</p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "10rem repeat(7, minmax(0, 1fr))" }}>
            <span />
            {days.map((d) => (
              <span key={d} className="text-center text-xl font-bold text-ink">
                {WEEKDAYS[d]}
              </span>
            ))}
            {presetTimes.map((t) => (
              <div key={t.id} className="contents">
                <span className="flex min-w-0 items-center gap-2 text-xl font-bold text-ink">
                  <Emoji emoji={t.icon} className="size-9" />
                  <span className="truncate">{t.name || "New"}</span>
                </span>
                {days.map((d) => {
                  const key = `${d}|${t.id}`;
                  return (
                    <select
                      key={d}
                      value={draft.presets[key] ?? ""}
                      aria-label={`${WEEKDAYS[d]} ${t.name}`}
                      onChange={(e) =>
                        update((dr) => {
                          const presets = { ...dr.presets };
                          if (e.target.value) presets[key] = e.target.value;
                          else delete presets[key];
                          return { ...dr, presets };
                        })
                      }
                      className={`${inputClass} min-w-0 px-2 text-base ${draft.presets[key] ? "border-meal-ink bg-meal font-bold" : ""}`}
                    >
                      <option value="">—</option>
                      {categories
                        .filter((c) => c.active && (c.meal_time_ids.length === 0 || c.meal_time_ids.includes(t.id)))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                    </select>
                  );
                })}
              </div>
            ))}
          </div>
          {draft.times.some((t) => t.onPlanner && t.id.startsWith("new-")) ? <p className="mt-3 text-base text-ink-muted">New meal times can only use categories for every meal until you save.</p> : null}
        </Card>
      )}

      {guard.leaving ? <LeaveDialog what="some meal times or presets" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} /> : null}
    </>
  );
}
