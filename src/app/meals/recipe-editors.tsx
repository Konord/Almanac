"use client";

import { Pager } from "@/components/pager";
import { useState } from "react";
import { useFitRows } from "@/components/use-fit-rows";
import { Plus, Trash, X } from "@phosphor-icons/react";
import { helperText, spotHelpers, type Helper } from "@/lib/meal-helpers";

/*
 * The dish editor's ingredient and step lists. Both show the list a page at
 * a time (nothing scrolls). The dish editor holds the lists and sends them
 * with everything else when you tap its one Save.
 */

function PageArrows({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  return <Pager page={page} pages={pages} onPage={setPage} />;
}

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export type IngredientDraft = { amount: string; unit: string; name: string; note: string; putAway: boolean };

const INGREDIENT_PAGE = 8;
const cell = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

export const BLANK_INGREDIENT: IngredientDraft = { amount: "", unit: "", name: "", note: "", putAway: false };

export function IngredientsEditor({ rows, setRows }: { rows: IngredientDraft[]; setRows: (change: (rows: IngredientDraft[]) => IngredientDraft[]) => void }) {
  const [page, setPage] = useState(0);
  const [listRef, perPage] = useFitRows<HTMLDivElement>(INGREDIENT_PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const p = Math.min(page, pages - 1);
  const from = p * perPage;

  const change = (i: number, patch: Partial<IngredientDraft>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const add = () => {
    setRows((r) => [...r, BLANK_INGREDIENT]);
    setPage(Math.floor(rows.length / perPage));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-[7rem_8rem_minmax(0,1fr)_minmax(0,0.8fr)_10rem_3.5rem] gap-2 text-base font-bold text-ink-muted">
        <span>Amount</span>
        <span>Unit</span>
        <span>Ingredient</span>
        <span>Note</span>
        <span>Put away if swapped</span>
        <span />
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {rows.slice(from, from + perPage).map((row, k) => {
          const i = from + k;
          return (
            <div key={i} className="grid grid-cols-[7rem_8rem_minmax(0,1fr)_minmax(0,0.8fr)_10rem_3.5rem] items-center gap-2">
              <input aria-label="Amount" className={cell} value={row.amount} inputMode="decimal" placeholder="1.5" onChange={(e) => change(i, { amount: e.target.value })} />
              <input aria-label="Unit" className={cell} value={row.unit} placeholder="cup" maxLength={20} onChange={(e) => change(i, { unit: e.target.value })} />
              <input aria-label="Ingredient" className={cell} value={row.name} placeholder="Ground beef" maxLength={60} onChange={(e) => change(i, { name: e.target.value })} />
              <input aria-label="Note" className={cell} value={row.note} placeholder="diced" maxLength={80} onChange={(e) => change(i, { note: e.target.value })} />
              <button
                type="button"
                aria-pressed={row.putAway}
                onClick={() => change(i, { putAway: !row.putAway })}
                className={`min-h-[var(--touch-target)] rounded-full border-2 text-base font-bold ${row.putAway ? "border-ink bg-rail text-ink" : "border-frame text-ink-muted"}`}
              >
                {row.putAway ? "🧊 Yes" : "No"}
              </button>
              <button type="button" aria-label="Remove" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-rail">
                <Trash size="1.375rem" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-4 border-t border-frame pt-3">
        <button type="button" onClick={add} className="inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink">
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Ingredient
        </button>
        <PageArrows page={p} pages={pages} setPage={setPage} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps, with the helpers Almanac spots in them
// ---------------------------------------------------------------------------

export type StepDraft = { text: string; helpers: Helper[] };
/** A step being edited: also the spotted helpers you said no to. */
export type EditingStep = StepDraft & { dismissed: string[] };

const STEP_PAGE = 3;
const keyOf = (h: Helper) => `${h.kind}|${h.minutes ?? ""}|${h.temperature ?? ""}`;

const HELPER_EMOJI: Record<Helper["kind"], string> = { timer: "⏲️", heads_up: "🔔", oven: "🔥", doneness: "🌡️" };

export function StepsEditor({
  steps,
  setSteps,
  temperatureUnit,
}: {
  steps: EditingStep[];
  setSteps: (change: (steps: EditingStep[]) => EditingStep[]) => void;
  temperatureUnit: "celsius" | "fahrenheit";
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(steps.length / STEP_PAGE));
  const p = Math.min(page, pages - 1);
  const from = p * STEP_PAGE;

  const change = (i: number, patch: Partial<EditingStep>) => setSteps((s) => s.map((step, j) => (j === i ? { ...step, ...patch } : step)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ol className="flex min-h-0 flex-1 flex-col gap-3">
        {steps.slice(from, from + STEP_PAGE).map((step, k) => {
          const i = from + k;
          const kept = new Set(step.helpers.map(keyOf));
          const suggested = spotHelpers(step.text, temperatureUnit).filter((h) => !kept.has(keyOf(h)) && !step.dismissed.includes(keyOf(h)));
          return (
            <li key={i} className="flex min-h-0 flex-1 gap-3 rounded-2xl bg-rail p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-board text-xl font-extrabold text-ink">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <textarea
                  aria-label={`Step ${i + 1}`}
                  value={step.text}
                  maxLength={400}
                  rows={2}
                  onChange={(e) => change(i, { text: e.target.value })}
                  className="min-h-0 flex-1 resize-none rounded-[var(--radius)] border-2 border-frame bg-board p-3 text-lg text-ink outline-none focus:border-accent"
                  placeholder="Bake for 45 minutes at 375°F."
                />
                <div className="flex flex-wrap gap-2">
                  {step.helpers.map((h) => (
                    <span key={keyOf(h)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-meal pr-1 pl-3 text-base font-bold text-meal-ink">
                      {HELPER_EMOJI[h.kind]} {helperText(h, temperatureUnit)}
                      <button
                        type="button"
                        aria-label="Remove helper"
                        onClick={() => change(i, { helpers: step.helpers.filter((x) => keyOf(x) !== keyOf(h)), dismissed: [...step.dismissed, keyOf(h)] })}
                        className="flex size-9 items-center justify-center rounded-full hover:bg-board/60"
                      >
                        <X size="1rem" weight="bold" aria-hidden />
                      </button>
                    </span>
                  ))}
                  {suggested.map((h) => (
                    <button
                      key={keyOf(h)}
                      type="button"
                      onClick={() => change(i, { helpers: [...step.helpers, h] })}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-meal-ink/60 px-3 text-base font-bold text-meal-ink"
                    >
                      {HELPER_EMOJI[h.kind]} {helperText(h, temperatureUnit)} <span className="font-normal">· keep</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  aria-label="Remove step"
                  onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
                  className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-board"
                >
                  <Trash size="1.375rem" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex shrink-0 items-center gap-4 border-t border-frame pt-3">
        <button
          type="button"
          onClick={() => {
            setSteps((s) => [...s, { text: "", helpers: [], dismissed: [] }]);
            setPage(Math.floor(steps.length / STEP_PAGE));
          }}
          className="inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink"
        >
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Step
        </button>
        <PageArrows page={p} pages={pages} setPage={setPage} />
      </div>
    </div>
  );
}
