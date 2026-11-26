"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/** The mock's plain `.who-chip`: grey frame; picked, an ink border on grey. */
const chipBase =
  "inline-flex min-h-[var(--touch-target)] cursor-pointer items-center justify-center gap-[0.4rem] rounded-full border-2 px-[1.1rem] text-[1.25rem] font-bold whitespace-nowrap text-ink select-none";
/** For a chip that is a <label> round a radio or checkbox. */
export const choiceChipClass = `${chipBase} border-frame bg-board has-checked:border-ink has-checked:bg-panel has-focus-visible:outline-2 has-focus-visible:outline-ink`;
/** For a chip that is a button. */
export const chipButtonClass = (on: boolean) => `${chipBase} ${on ? "border-ink bg-panel" : "border-frame bg-board"}`;

/**
 * Pick one or none: chips where tapping the picked one again un-picks it
 * (the mock's "Kind of day" row has no "None" chip). Sends `name` with
 * the form: the picked value, or "" for none.
 */
export function ToggleChips({
  name,
  label,
  options,
  initial,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; leading?: ReactNode }[];
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <fieldset className="flex min-w-0 flex-col gap-[0.35rem]">
      <legend className="mb-[0.35rem] text-[1.15rem] font-bold text-ink-muted">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-[0.45rem]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => setValue(value === o.value ? "" : o.value)}
            className={`${chipButtonClass(value === o.value)} ${o.leading ? "gap-[0.3rem]! pl-[0.65rem]! pr-[0.9rem]!" : ""}`}
          >
            {o.leading}
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Tabs across the top of the event sheet: the event itself first, then the
 * rarer settings. Only one shows at a time, so the sheet never needs to
 * scroll. Every tab stays in the form (just hidden), so whatever you set
 * in one is still sent when you press Save.
 *
 * The look is the mock's `.sheet-tabs` (g-final-event.html): a grey track
 * as wide as its words, the open tab raised in white.
 */
export function CardTabs({ tabs, initial = 0 }: { tabs: { label: string; panel: ReactNode }[]; initial?: number }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 gap-1 self-start rounded-[var(--radius)] bg-panel p-1" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={open === i}
            onClick={() => setOpen(i)}
            className={`flex min-h-12 items-center justify-center rounded-[calc(var(--radius)-0.1rem)] px-[1.1rem] text-[1.25rem] font-bold ${
              open === i ? "bg-board text-ink shadow-raised" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={open !== i} className="grid min-h-0 content-start gap-4">
          {t.panel}
        </div>
      ))}
    </div>
  );
}

/*
 * The event sheet's views (Connor, 2026-11-26, look A): the main view reads
 * like a sentence; Repeats and More options (and, editing, Heads-ups) are
 * views of their own with a Back button. Every view stays in the form, only
 * hidden, so Save sends everything.
 */
type SheetView = "main" | "repeats" | "more" | "heads-ups";
const SheetViewContext = createContext<{ show: (v: SheetView) => void; repeat: string }>({ show: () => {}, repeat: "none" });

const REPEAT_WORDS: Record<string, string> = { none: "never", daily: "daily", weekly: "weekly", monthly: "monthly", yearly: "yearly" };

export function SheetViews({
  main,
  repeats,
  more,
  headsUps,
  initial = "main",
  initialRepeat = "none",
}: {
  main: ReactNode;
  repeats: ReactNode;
  more: ReactNode;
  headsUps?: ReactNode;
  initial?: SheetView;
  initialRepeat?: string;
}) {
  const [view, setView] = useState<SheetView>(initial);
  const [repeat, setRepeat] = useState(initialRepeat);
  const back = (title: string) => (
    <div className="flex shrink-0 items-center gap-3">
      <button type="button" onClick={() => setView(view === "heads-ups" ? "more" : "main")} className={chipButtonClass(false)}>
        ‹ Back
      </button>
      <span className="text-[1.5rem] font-bold text-ink">{title}</span>
    </div>
  );
  return (
    <SheetViewContext.Provider value={{ show: setView, repeat }}>
      <div hidden={view !== "main"} className="grid min-h-0 content-start gap-4">
        {main}
      </div>
      <div
        hidden={view !== "repeats"}
        className="grid min-h-0 content-start gap-4"
        onChange={(e) => {
          const t = e.target as HTMLInputElement;
          if (t.name === "repeatFrequency") setRepeat(t.value);
        }}
      >
        {back("Repeats")}
        {repeats}
      </div>
      <div hidden={view !== "more"} className="grid min-h-0 content-start gap-4">
        {back("More options")}
        {more}
      </div>
      {headsUps ? (
        <div hidden={view !== "heads-ups"} className="grid min-h-0 content-start gap-4">
          {back("Heads-ups")}
          {headsUps}
        </div>
      ) : null}
    </SheetViewContext.Provider>
  );
}

/** "Repeats: weekly ›" on the main view. */
export function RepeatsButton() {
  const { show, repeat } = useContext(SheetViewContext);
  return (
    <button type="button" onClick={() => show("repeats")} className={chipButtonClass(repeat !== "none")}>
      Repeats: {REPEAT_WORDS[repeat] ?? repeat} ›
    </button>
  );
}

/** A labelled button that opens another view ("More options ›", "Heads-ups ›"). */
export function SheetViewButton({ view, children }: { view: Exclude<SheetView, "main">; children: ReactNode }) {
  const { show } = useContext(SheetViewContext);
  return (
    <button type="button" onClick={() => show(view)} className={`${chipButtonClass(false)} justify-self-start`}>
      {children} ›
    </button>
  );
}
