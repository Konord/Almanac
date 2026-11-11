"use client";

import { useEffect, useState } from "react";
import { useFitRows } from "@/components/use-fit-rows";
import Link from "next/link";
import { ArrowLeft, CaretLeft, CaretRight, Check, X } from "@phosphor-icons/react";
import { emojiImage } from "@/lib/emoji";
import { DONENESS, helperText, minutesText, type Helper } from "@/lib/meal-helpers";
import { BATCHES, batchAmount } from "@/lib/meals";
import { measureText, type Measures } from "@/lib/units";
import { UnitPill } from "../unit-pill";
import { addMinute, startTimer, stopTimer, timeLeft, useAlarm, useNow, useTimers } from "@/components/timer-store";
import { markCooked } from "../actions";

/*
 * Cooking mode: the current step big at the top, the next steps smaller
 * below so you can get ready, the ingredients (times the batches) on
 * the left and little kitchen helpers on the right: timers taken from the
 * step, the oven temperature, and safe inside temperatures.
 */

type CookIngredient = { id: string; name: string; icon: string | null; amount: number | null; unit: string | null; note: string | null };
type CookStep = { id: string; text: string; helpers: Helper[] };

const INGREDIENT_PAGE = 9;

function Picture({ emoji, className }: { emoji: string | null; className: string }) {
  if (!emoji) return null;
  const src = emojiImage(emoji);
  // eslint-disable-next-line @next/next/no-img-element -- small local pictures
  return src ? <img src={src} alt="" aria-hidden draggable={false} className={className} /> : <span className={className}>{emoji}</span>;
}

/** Keeps the screen awake while cooking, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    const ask = () => {
      if (document.visibilityState === "visible" && nav.wakeLock) {
        nav.wakeLock
          .request("screen")
          .then((l) => (lock = l))
          .catch(() => {});
      }
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      lock?.release().catch(() => {});
    };
  }, []);
}

export type CookDish = { recipeId: string; name: string; icon: string | null; batches: number; notes: string | null; ingredients: CookIngredient[]; steps: CookStep[] };

export function CookingMode({
  mealId,
  title,
  temperatureUnit,
  canPlanLeftovers,
  dishes,
  measures,
}: {
  mealId: string;
  /** The meal's name, shown when it has more than one dish. */
  title: string;
  temperatureUnit: "celsius" | "fahrenheit";
  canPlanLeftovers: boolean;
  /** The meal's dishes, each with its own steps; tabs switch between them. */
  dishes: CookDish[];
  measures: Measures;
}) {
  useWakeLock();
  const [active, setActive] = useState(0);
  const [stepOf, setStepOf] = useState<number[]>(() => dishes.map(() => 0));
  const [batchesOf, setBatchesOf] = useState<number[]>(() => dishes.map((d) => d.batches));
  const [ticked, setTicked] = useState<string[]>([]);
  const [ingredientPage, setIngredientPage] = useState(0);
  const [ingredientsRef, ingredientsPerPage] = useFitRows<HTMLUListElement>(INGREDIENT_PAGE);
  const [finishing, setFinishing] = useState(false);
  const dish = dishes[active];
  const { name, icon, notes, ingredients, steps } = dish;
  const step = stepOf[active] ?? 0;
  const setStep = (n: number) => setStepOf((all) => all.map((v, i) => (i === active ? n : v)));
  const batches = batchesOf[active] ?? 1;
  const setBatches = (n: number) => setBatchesOf((all) => all.map((v, i) => (i === active ? n : v)));
  const timers = useTimers();
  const now = useNow(timers.length > 0);
  useAlarm(timers, now);

  const current = steps[step];
  const upcoming = steps.slice(step + 1, step + 3);
  const last = step >= steps.length - 1;
  const deg = temperatureUnit === "celsius" ? "°C" : "°F";
  const oven = steps.flatMap((s, i) => s.helpers.filter((h) => h.kind === "oven").map((h) => ({ ...h, at: i })))[0];
  const doneness = steps.flatMap((s) => s.helpers.filter((h) => h.kind === "doneness"));
  const stepTimers = current?.helpers.filter((h) => h.kind === "timer") ?? [];

  const pages = Math.max(1, Math.ceil(ingredients.length / ingredientsPerPage));
  const iPage = Math.min(ingredientPage, pages - 1);

  return (
    <div className="flex h-dvh flex-col gap-4 overflow-hidden bg-board p-5 lg:p-7">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-4">
        <Link href="/" aria-label="Leave cooking mode" className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink">
          <ArrowLeft size="1.75rem" weight="bold" aria-hidden />
        </Link>
        <Picture emoji={icon} className="size-16" />
        <h1 className="min-w-0 truncate text-5xl font-extrabold tracking-tight text-ink">{dishes.length > 1 ? title : name}</h1>
        {dishes.length > 1 ? (
          <nav aria-label="Dishes" className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
            {dishes.slice(0, 6).map((d, i) => (
              <button
                key={d.recipeId + i}
                type="button"
                aria-pressed={i === active}
                onClick={() => {
                  setActive(i);
                  setIngredientPage(0);
                }}
                className={`flex min-h-[var(--touch-target)] min-w-0 items-center gap-2 rounded-2xl px-3.5 text-lg font-bold ${i === active ? "bg-ink text-board" : "bg-rail text-ink-soft"}`}
              >
                <Picture emoji={d.icon} className="size-8 shrink-0" />
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex items-center gap-1 rounded-2xl bg-meal p-1.5 text-meal-ink" role="group" aria-label="Batches">
          {BATCHES.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={batches === b}
              onClick={() => setBatches(b)}
              className={`flex h-12 min-w-16 items-center justify-center rounded-xl px-3 text-xl font-bold ${batches === b ? "bg-board text-ink" : ""}`}
            >
              ×{b}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[24rem_minmax(0,1fr)_26rem] gap-5">
        {/* Ingredients */}
        <section className="flex min-h-0 flex-col gap-2 rounded-[var(--radius-card)] border border-frame p-4">
          <h2 className="text-2xl font-bold text-ink">Ingredients</h2>
          {batches > 1 ? <p className="text-base text-ink-muted">Everything ×{batches}, for {batches} batches.</p> : null}
          <ul ref={ingredientsRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {ingredients.slice(iPage * ingredientsPerPage, (iPage + 1) * ingredientsPerPage).map((ing) => {
              const done = ticked.includes(ing.id);
              const scaled = batchAmount(ing.amount, batches);
              const amount = measureText(scaled, ing.unit);
              return (
                <li key={ing.id}>
                  <button
                    type="button"
                    onClick={() => setTicked((t) => (done ? t.filter((x) => x !== ing.id) : [...t, ing.id]))}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left ${done ? "opacity-45" : ""}`}
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${done ? "border-success bg-success text-white" : "border-check-border"}`}>
                      {done ? <Check size="1.25rem" weight="bold" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {amount ? <UnitPill amount={scaled} unit={ing.unit} text={amount} measures={measures} /> : null}
                      <span className={`text-xl text-ink ${done ? "line-through" : ""}`}>{ing.name}</span>
                      {ing.note ? <span className="block truncate text-base text-ink-muted">{ing.note}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {ingredients.length === 0 ? <li className="text-lg text-ink-muted">No ingredients written down.</li> : null}
          </ul>
          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <button type="button" aria-label="Previous" disabled={iPage === 0} onClick={() => setIngredientPage(iPage - 1)} className="flex size-12 items-center justify-center rounded-full bg-rail disabled:opacity-30">
                <CaretLeft size="1.25rem" weight="bold" aria-hidden />
              </button>
              <span className="text-lg font-bold text-ink-muted">
                {iPage + 1} of {pages}
              </span>
              <button type="button" aria-label="Next" disabled={iPage >= pages - 1} onClick={() => setIngredientPage(iPage + 1)} className="flex size-12 items-center justify-center rounded-full bg-rail disabled:opacity-30">
                <CaretRight size="1.25rem" weight="bold" aria-hidden />
              </button>
            </div>
          ) : null}
        </section>

        {/* Steps */}
        <section className="flex min-h-0 flex-col gap-4">
          {current ? (
            <>
              <div className="flex min-h-0 flex-[3] flex-col gap-4 overflow-hidden rounded-[var(--radius-card)] bg-meal p-7 text-meal-ink">
                <span className="text-xl font-bold">
                  Step {step + 1} of {steps.length}
                </span>
                <p className="min-h-0 flex-1 overflow-hidden text-[2.75rem] leading-[1.2] font-bold text-ink">{current.text}</p>
                {stepTimers.length ? (
                  <div className="flex flex-wrap gap-3">
                    {stepTimers.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => startTimer(h.label ?? `Step ${step + 1}`, h.minutes ?? 1, mealId)}
                        className="inline-flex min-h-16 items-center gap-3 rounded-2xl bg-ink px-6 text-2xl font-bold text-board"
                      >
                        ⏲️ Start {minutesText(h.minutes ?? 0)}
                        {h.label ? <span className="font-normal opacity-80">· {h.label}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex min-h-0 flex-[2] flex-col gap-2 overflow-hidden">
                {upcoming.length ? <h2 className="text-xl font-bold text-ink-muted">Coming up</h2> : null}
                {upcoming.map((s, i) => (
                  <div key={s.id} className="flex min-h-0 gap-3 rounded-2xl bg-rail p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-board text-lg font-extrabold text-ink">{step + i + 2}</span>
                    <p className="line-clamp-3 min-w-0 flex-1 text-2xl leading-snug text-ink-soft">{s.text}</p>
                  </div>
                ))}
                {last && notes ? <p className="font-hand line-clamp-4 text-2xl text-ink-soft">📝 {notes}</p> : null}
              </div>
            </>
          ) : (
            <p className="text-2xl text-ink-muted">This recipe has no steps yet. Add them in the recipe card.</p>
          )}
          <div className="flex shrink-0 gap-4">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              className="flex min-h-20 flex-1 items-center justify-center gap-2 rounded-2xl bg-rail text-2xl font-bold text-ink disabled:opacity-30"
            >
              <CaretLeft size="1.75rem" weight="bold" aria-hidden />
              Back
            </button>
            {last || !current ? (
              <button type="button" onClick={() => setFinishing(true)} className="flex min-h-20 flex-[2] items-center justify-center gap-2 rounded-2xl bg-success text-2xl font-bold text-white">
                <Check size="1.75rem" weight="bold" aria-hidden />
                Done cooking
              </button>
            ) : (
              <button type="button" onClick={() => setStep(step + 1)} className="flex min-h-20 flex-[2] items-center justify-center gap-2 rounded-2xl bg-ink text-2xl font-bold text-board">
                Next step
                <CaretRight size="1.75rem" weight="bold" aria-hidden />
              </button>
            )}
          </div>
        </section>

        {/* Kitchen helpers */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <section className="flex min-h-0 flex-col gap-2 rounded-[var(--radius-card)] border border-frame p-4">
            <h2 className="text-2xl font-bold text-ink">⏲️ Timers</h2>
            {timers.slice(0, 4).map((t) => {
              const done = t.endsAt <= now;
              return (
                <div key={t.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${done ? "animate-pulse bg-now text-white" : "bg-rail text-ink"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">{t.label}</span>
                    <span className="text-3xl font-extrabold tabular-nums">{done ? "Done!" : timeLeft(t, now)}</span>
                  </span>
                  <button type="button" onClick={() => addMinute(t.id)} className="min-h-12 rounded-xl bg-board/70 px-3 text-lg font-bold text-ink">
                    +1 min
                  </button>
                  <button type="button" aria-label="Stop" onClick={() => stopTimer(t.id)} className="flex size-12 items-center justify-center rounded-full bg-board/70 text-ink">
                    <X size="1.25rem" weight="bold" aria-hidden />
                  </button>
                </div>
              );
            })}
            <div className="grid grid-cols-4 gap-2">
              {[1, 5, 10, 15].map((m) => (
                <button key={m} type="button" onClick={() => startTimer(`${m} min`, m, mealId)} className="min-h-[var(--touch-target)] rounded-xl bg-rail text-lg font-bold text-ink">
                  {m} min
                </button>
              ))}
            </div>
          </section>

          {oven ? (
            <section className="flex items-center gap-4 rounded-[var(--radius-card)] border border-frame p-4">
              <Picture emoji="🔥" className="size-12" />
              <div>
                <p className="text-3xl font-extrabold text-ink">
                  Oven {oven.temperature}
                  {deg}
                </p>
                <p className="text-lg text-ink-muted">{oven.at > step ? `Heat it up for step ${oven.at + 1}.` : "It should be hot now."}</p>
              </div>
            </section>
          ) : null}

          <section className="flex min-h-0 flex-col gap-1.5 rounded-[var(--radius-card)] border border-frame p-4">
            <h2 className="text-2xl font-bold text-ink">🌡️ Safe inside</h2>
            {doneness.length ? (
              doneness.slice(0, 2).map((h, i) => (
                <p key={i} className="text-2xl font-bold text-ink">
                  {helperText(h, temperatureUnit)}
                </p>
              ))
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {DONENESS.slice(0, doneness.length ? 3 : 5).map((d) => (
                <li key={d.label} className="flex justify-between gap-2 text-lg text-ink-soft">
                  <span className="truncate">{d.label}</span>
                  <span className="font-bold tabular-nums">
                    {temperatureUnit === "celsius" ? d.celsius : d.fahrenheit}
                    {deg}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {finishing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(30,35,45,0.32)] p-8">
          <form action={markCooked} className="flex w-full max-w-[44rem] flex-col gap-5 rounded-[var(--radius-card)] bg-board p-8 shadow-[0_0_2.5rem_rgba(30,35,45,0.25)]">
            <input type="hidden" name="mealId" value={mealId} />
            <input type="hidden" name="returnTo" value="/meals" />
            <h2 className="text-4xl font-extrabold text-ink">All done?</h2>
            {doneness.length ? (
              <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-xl text-ink">
                <input type="checkbox" required className="size-7 accent-[var(--color-ink)]" />
                I checked it reached {doneness.map((h) => `${h.temperature}${deg}`).join(" / ")} inside
              </label>
            ) : null}
            {canPlanLeftovers ? (
              <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-xl text-ink">
                <input type="checkbox" name="leftovers" value="lunch" className="size-7 accent-[var(--color-ink)]" />
                There are leftovers: plan them for tomorrow&apos;s lunch
              </label>
            ) : null}
            <div className="flex gap-3">
              <button type="button" onClick={() => setFinishing(false)} className="min-h-[var(--touch-target)] flex-1 rounded-[var(--radius)] bg-rail text-xl font-bold text-ink">
                Not yet
              </button>
              <button className="min-h-[var(--touch-target)] flex-[2] rounded-[var(--radius)] bg-success text-xl font-bold text-white">Done, enjoy!</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
