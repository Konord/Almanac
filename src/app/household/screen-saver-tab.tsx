"use client";

import { useState, type ReactNode } from "react";
import { Clock, FrameCorners, FolderSimple, Monitor, Moon, Play, Plus, Sun, SunHorizon, X } from "@phosphor-icons/react";
import { Card, EmptyState } from "@/components/ui";
import { Pager } from "@/components/pager";
import { PREVIEW_EVENT } from "@/components/screen-saver";
import { BACK_AFTER_CHOICES, IDLE_CHOICES, MAX_SET_TIMES, dinnerBlocks, type MatColour, type ScreenSaverSettings, type SetTime } from "@/lib/screen-saver";
import { LEVEL_CHOICES, type BrightnessSettings, type Warmth } from "@/lib/brightness";
import { useLauncher } from "@/components/launcher-store";
import { Choice } from "./fields";
import { TimeField } from "@/components/touch-pickers";

/*
 * Settings › Screen saver (2026-11-12): when the art screen saver comes on,
 * and the art folders it found. "When" holds the settings (kept until the
 * screen's one Save); "Art folders" only shows what's in the folder, since
 * folders are found by their names.
 *
 * "Brightness" (2026-11-16) sets the kitchen screen's day and evening
 * levels (src/lib/brightness.ts), next to the overnight "Screen off".
 */

export type ArtFolderInfo = { name: string; count: number; use: string; matched: boolean };
export type ArtOverview = { root: string | null; problem: string | null; folders: ArtFolderInfo[] };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FOLDERS_PER_PAGE = 18;


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

export type ScreenSaverView = "when" | "brightness" | "folders";

export function ScreenSaverTab({
  value,
  onChange,
  here,
  onHere,
  mealTimes,
  art,
  view,
  onView: setView,
  brightness,
  onBrightness,
}: {
  value: ScreenSaverSettings;
  onChange: (v: ScreenSaverSettings) => void;
  brightness: BrightnessSettings;
  onBrightness: (v: BrightnessSettings) => void;
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
              { id: "brightness", label: "Brightness", icon: Sun },
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
              <Overnight value={value} set={set} />
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
                      <TimeField aria-label="From" value={t.start} step={5} onChange={(v) => setTime(i, { start: v })} className="w-44! text-lg!" />
                      to
                      <TimeField aria-label="Until" value={t.end} step={5} onChange={(v) => setTime(i, { end: v })} className="w-44! text-lg!" />
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
      ) : view === "brightness" ? (
        <BrightnessView value={brightness} onChange={onBrightness} saver={value} setSaver={set} />
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

/** Overnight: as usual, art, or the screen off, and from when to when. Shared by "When" and "Brightness". */
function Overnight({ value, set }: { value: ScreenSaverSettings; set: (c: Partial<ScreenSaverSettings>) => void }) {
  return (
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
          <TimeField aria-label="Overnight from" value={value.overnight.start} step={5} onChange={(t) => set({ overnight: { ...value.overnight, start: t } })} className="w-44! text-lg!" />
          to
          <TimeField aria-label="Overnight until" value={value.overnight.end} step={5} onChange={(t) => set({ overnight: { ...value.overnight, end: t } })} className="w-44! text-lg!" />
        </div>
      ) : null}
    </div>
  );
}

/*
 * Brightness (2026-11-16): the kitchen screen's day and evening levels,
 * and the overnight screen off beside them, so the whole day is on one
 * screen. Levels are big chips rather than a slider: they're set once.
 */
function BrightnessView({
  value,
  onChange,
  saver,
  setSaver,
}: {
  value: BrightnessSettings;
  onChange: (v: BrightnessSettings) => void;
  saver: ScreenSaverSettings;
  setSaver: (c: Partial<ScreenSaverSettings>) => void;
}) {
  const { helper } = useLauncher();
  const set = (c: Partial<BrightnessSettings>) => onChange({ ...value, ...c });
  const here = helper ? helper.brightness : null;
  const levels = LEVEL_CHOICES.map((p) => ({ value: p, label: `${p}%` }));

  const part = (which: "day" | "evening", label: string) => (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">{label}</span>
        <TimeField
          aria-label={label}
          value={value[which].start}
          step={5}
          onChange={(t) => set({ [which]: { ...value[which], start: t } })}
          className="w-44! text-lg!"
        />
      </label>
      <Choice label="Brightness" value={value[which].percent} onChange={(percent) => set({ [which]: { ...value[which], percent } })} options={levels} />
    </>
  );

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
      <Card title="Day" icon={Sun} tint="orange">
        <div className="mt-2 flex flex-col gap-4">
          <Choice
            label="Change by itself"
            value={value.scheduled ? "on" : "off"}
            onChange={(v) => set({ scheduled: v === "on" })}
            options={[
              { value: "on", label: "Day and evening" },
              { value: "off", label: "Only the slider" },
            ]}
          />
          {value.scheduled ? part("day", "Day starts at") : null}
        </div>
      </Card>

      <Card title="Evening" icon={SunHorizon} tint="purple">
        <div className="mt-2 flex flex-col gap-4">
          {value.scheduled ? (
            <>
              {part("evening", "Evening starts at")}
              {/* Few monitors let a computer reach their "low blue" mode; turning down the blue does the same job. */}
              <Choice<Warmth>
                label="Warmer colour (less blue)"
                value={value.evening.warmth}
                onChange={(warmth) => set({ evening: { ...value.evening, warmth } })}
                options={[
                  { value: "none", label: "Off" },
                  { value: "weak", label: "A little" },
                  { value: "medium", label: "Some" },
                  { value: "strong", label: "A lot" },
                ]}
              />
            </>
          ) : (
            <p className="text-lg text-ink-muted">The screen stays where the tray&apos;s slider puts it.</p>
          )}
        </div>
      </Card>

      <Card title="Night" icon={Moon} tint="blue">
        <div className="mt-2 flex flex-col gap-4">
          <Overnight value={saver} set={setSaver} />
          <p className="text-lg text-ink-muted">
            {saver.overnight.mode === "off" && value.scheduled
              ? "A touch in the night wakes the screen at the evening level."
              : "The tray's slider changes the brightness any time, until the next change."}
          </p>
          <p className="mt-auto text-lg text-ink-muted">
            {here === null ? "This screen can't change its brightness. The kitchen screen can." : `This screen is at ${here}% now.`}
          </p>
        </div>
      </Card>
    </div>
  );
}
