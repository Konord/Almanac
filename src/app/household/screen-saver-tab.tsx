"use client";

import { useState, type ReactNode } from "react";
import { Clock, FrameCorners, FolderSimple, Monitor, Play, Plus, X } from "@phosphor-icons/react";
import { Card, EmptyState } from "@/components/ui";
import { Pager } from "@/components/pager";
import { PREVIEW_EVENT } from "@/components/screen-saver";
import { BACK_AFTER_CHOICES, IDLE_CHOICES, MAX_SET_TIMES, dinnerBlocks, type MatColour, type ScreenSaverSettings, type SetTime } from "@/lib/screen-saver";
import { Choice } from "./fields";

/*
 * Settings › Screen saver (2026-11-12): when the art screen saver comes on,
 * and the art folders it found. "When" holds the settings (kept until the
 * screen's one Save); "Art folders" only shows what's in the folder, since
 * folders are found by their names.
 */

export type ArtFolderInfo = { name: string; count: number; use: string; matched: boolean };
export type ArtOverview = { root: string | null; problem: string | null; folders: ArtFolderInfo[] };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FOLDERS_PER_PAGE = 18;

const inputClass = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

function Toggle({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full border-2 px-3.5 text-lg text-ink ${on ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
    >
      {children}
    </button>
  );
}

const minutesLabel = (m: number) => (m === 0 ? "Never" : m === 60 ? "1 hour" : `${m} min`);

export type ScreenSaverView = "when" | "folders";

export function ScreenSaverTab({
  value,
  onChange,
  here,
  onHere,
  mealTimes,
  art,
  view,
  onView: setView,
}: {
  value: ScreenSaverSettings;
  onChange: (v: ScreenSaverSettings) => void;
  here: boolean;
  onHere: (on: boolean) => void;
  mealTimes: { id: string; name: string }[];
  art: ArtOverview;
  view: ScreenSaverView;
  onView: (v: ScreenSaverView) => void;
}) {
  const [page, setPage] = useState(0);
  const set = (c: Partial<ScreenSaverSettings>) => onChange({ ...value, ...c });
  const meals = value.duringMeals ?? dinnerBlocks(mealTimes);
  const setTime = (i: number, c: Partial<SetTime>) => set({ times: value.times.map((t, k) => (k === i ? { ...t, ...c } : t)) });

  const paintings = art.folders.reduce((n, f) => n + f.count, 0);
  const pages = Math.max(1, Math.ceil(art.folders.length / FOLDERS_PER_PAGE));
  const p = Math.min(page, pages - 1);

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      <div className="flex shrink-0 items-center gap-3">
        <nav aria-label="Screen saver" className="flex gap-1 rounded-2xl bg-panel p-1.25">
          {(
            [
              { id: "when", label: "When", icon: Clock },
              { id: "folders", label: "Art folders", icon: FolderSimple },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              aria-pressed={view === t.id}
              className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-xl px-5 text-lg font-bold ${view === t.id ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
            >
              <t.icon size="1.375rem" aria-hidden />
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => (paintings > 0 ? window.dispatchEvent(new Event(PREVIEW_EVENT)) : setView("folders"))}
          className="ml-auto flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel"
        >
          <Play size="1.25rem" weight="fill" aria-hidden />
          {paintings > 0 ? "Try it" : "No paintings found"}
        </button>
      </div>

      {view === "when" ? (
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
          <Card title="This screen" icon={Monitor} tint="teal">
            <div className="mt-2 flex flex-col gap-4">
              <Choice label="Screen saver here" value={here ? "on" : "off"} onChange={(v) => onHere(v === "on")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
              <Choice label="After no touch for" value={value.idleMinutes} onChange={(idleMinutes) => set({ idleMinutes })} options={IDLE_CHOICES.map((m) => ({ value: m, label: minutesLabel(m) }))} />
              <Choice label="Back after a tap, in meals and set times" value={value.backAfterMinutes} onChange={(backAfterMinutes) => set({ backAfterMinutes })} options={BACK_AFTER_CHOICES.map((m) => ({ value: m, label: `${m} min` }))} />
              <div className="flex flex-col gap-2">
                <Choice
                  label="Overnight"
                  value={value.overnight.mode}
                  onChange={(mode) => set({ overnight: { ...value.overnight, mode } })}
                  options={[
                    { value: "none", label: "As usual" },
                    { value: "art", label: "Show art" },
                    { value: "off", label: "Screen off" },
                  ]}
                />
                {value.overnight.mode !== "none" ? (
                  <div className="flex items-center gap-2 text-lg text-ink">
                    <input type="time" aria-label="Overnight from" value={value.overnight.start} onChange={(e) => e.target.value && set({ overnight: { ...value.overnight, start: e.target.value } })} className={`${inputClass} w-44`} />
                    to
                    <input type="time" aria-label="Overnight until" value={value.overnight.end} onChange={(e) => e.target.value && set({ overnight: { ...value.overnight, end: e.target.value } })} className={`${inputClass} w-44`} />
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card title="Comes on" icon={Clock} tint="blue">
            <div className="mt-2 flex flex-col gap-4">
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-base font-bold text-ink">While eating</legend>
                {mealTimes.length === 0 ? (
                  <p className="text-lg text-ink-muted">No meal blocks yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {mealTimes.map((t) => {
                      const on = meals.includes(t.id);
                      return (
                        <Toggle key={t.id} on={on} onClick={() => set({ duringMeals: on ? meals.filter((x) => x !== t.id) : [...meals, t.id] })}>
                          {t.name}
                        </Toggle>
                      );
                    })}
                  </div>
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1.5 text-base font-bold text-ink">Set times</legend>
                {value.times.map((t, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-2xl bg-rail p-2.5">
                    <div className="flex gap-1">
                      {WEEKDAYS.map((d, w) => (
                        <button
                          key={w}
                          type="button"
                          aria-label={WEEKDAY_NAMES[w]}
                          aria-pressed={t.days.includes(w)}
                          onClick={() => setTime(i, { days: t.days.includes(w) ? t.days.filter((x) => x !== w) : [...t.days, w].sort() })}
                          className={`flex size-[calc(var(--touch-target)*0.82)] items-center justify-center rounded-full text-lg font-bold ${t.days.includes(w) ? "bg-ink text-board" : "bg-board text-ink-muted"}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-lg text-ink">
                      <input type="time" aria-label="From" value={t.start} onChange={(e) => e.target.value && setTime(i, { start: e.target.value })} className={`${inputClass} w-44`} />
                      to
                      <input type="time" aria-label="Until" value={t.end} onChange={(e) => e.target.value && setTime(i, { end: e.target.value })} className={`${inputClass} w-44`} />
                      <button type="button" aria-label="Take this time away" onClick={() => set({ times: value.times.filter((_, k) => k !== i) })} className="ml-auto flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-board">
                        <X size="1.375rem" weight="bold" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
                {value.times.length < MAX_SET_TIMES ? (
                  <button
                    type="button"
                    onClick={() => set({ times: [...value.times, { days: [0, 6], start: "08:00", end: "10:00" }] })}
                    className="flex min-h-[var(--touch-target)] items-center gap-2 self-start rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel"
                  >
                    <Plus size="1.25rem" weight="bold" aria-hidden />
                    Add a time
                  </button>
                ) : null}
              </fieldset>
            </div>
          </Card>

          <Card title="Paintings" icon={FrameCorners} tint="orange">
            <div className="mt-2 flex flex-col gap-4">
              <Choice
                label="New painting"
                value={value.every}
                onChange={(every) => set({ every })}
                options={[
                  { value: "day", label: "Every day" },
                  { value: "twice", label: "Twice a day" },
                  { value: "2h", label: "Every 2 hours" },
                  { value: "start", label: "Each time it starts" },
                ]}
              />
              <Choice
                label="Seasonal art on ordinary days"
                value={value.seasonal}
                onChange={(seasonal) => set({ seasonal })}
                options={[
                  { value: "rarely", label: "Now and then" },
                  { value: "half", label: "Half the time" },
                  { value: "mostly", label: "Mostly" },
                ]}
              />
              <Choice<MatColour>
                label="Mat"
                value={value.mat}
                onChange={(mat) => set({ mat })}
                options={(["white", "cream", "charcoal"] as const).map((m) => ({
                  value: m,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className="size-6 rounded-md border border-frame" style={{ background: `var(--color-mat-${m})` }} aria-hidden />
                      {m === "white" ? "White" : m === "cream" ? "Cream" : "Charcoal"}
                    </span>
                  ),
                }))}
              />
            </div>
          </Card>
        </div>
      ) : (
        <Card
          title={art.root ?? "Art folders"}
          icon={FolderSimple}
          tint="purple"
          className="lg:flex-1"
          aside={<Pager page={p} pages={pages} onPage={setPage} />}
        >
          {art.problem || art.folders.length === 0 ? (
            <EmptyState
              emoji="🖼"
              title={art.problem === "ART_FOLDER isn't set" ? "No art folder yet" : (art.problem ?? "No folders in the art folder")}
              hint={
                art.problem === "ART_FOLDER isn't set" ? (
                  <>
                    Add <code className="rounded bg-rail px-1.5">ART_FOLDER=</code> and the folder&apos;s path to .env.local, then restart Almanac.
                  </>
                ) : (
                  "Folders named General, Spring, Summer, Autumn, Winter, a holiday or a birthday."
                )
              }
            />
          ) : (
            <ul className="mt-2 grid min-h-0 flex-1 grid-cols-6 grid-rows-3 gap-3">
              {art.folders.slice(p * FOLDERS_PER_PAGE, (p + 1) * FOLDERS_PER_PAGE).map((f) => (
                <li key={f.name} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-frame p-3">
                  <span className="truncate text-xl font-bold text-ink" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-base text-ink-muted">{f.count === 1 ? "1 painting" : `${f.count} paintings`}</span>
                  <span
                    className={`mt-auto self-start truncate rounded-lg px-2.5 py-1 text-base font-bold ${f.matched ? "bg-rail text-ink" : "bg-alert-soft text-danger"}`}
                  >
                    {f.use}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
