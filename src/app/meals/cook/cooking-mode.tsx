"use client";

import { Pager } from "@/components/pager";
import { useEffect, useState } from "react";
import { useFitRows } from "@/components/use-fit-rows";
import Link from "next/link";
import { CaretLeft, CaretRight, Check, X } from "@phosphor-icons/react";
import { emojiImage } from "@/lib/emoji";
import { bothTemperatures, DONENESS, minutesText, type Helper } from "@/lib/meal-helpers";
import { batchAmount } from "@/lib/meals";
import { measureText, type Measures } from "@/lib/units";
import { UnitPill } from "../unit-pill";
import { addMinute, startTimer, stopTimer, timeLeft, useAlarm, useNow, useTimers } from "@/components/timer-store";
import { markCooked } from "../actions";
import { BatchSwitch } from "../parts";

/*
 * Cooking mode (g-final-cook): immersive, no app header. The current step
 * big and printed in a yellow card, the next two below so you can get
 * ready, Back / Next; the ingredients (times the batches) to tick off on
 * the left; and kitchen helpers on the right: timers taken from the step
 * (or quick ones), the oven temperature and safe inside temperatures, in
 * both °F and °C.
 */

type CookIngredient = { id: string; name: string; icon: string | null; amount: number | null; unit: string | null; note: string | null };
type CookStep = { id: string; text: string; helpers: Helper[] };

const INGREDIENT_PAGE = 9;
/** The side cards (g-final-cook: white, raised, 1.25rem × 1.4rem). */
const card = "flex min-h-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised";
const h2 = "shrink-0 text-2xl font-bold text-ink";

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
  backHref,
  title,
  temperatureUnit,
  canPlanLeftovers,
  dishes,
  measures,
}: {
  /** The planned meal being cooked; null when cooking a dish from the Dishes tab (nothing to mark done). */
  mealId: string | null;
  /** Where the back arrow (and Done, for a dish) goes. */
  backHref: string;
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
    <div className="flex h-dvh flex-col overflow-hidden bg-board px-8 py-6">
      {/* Top: back, the dish, (dish tabs), batches. Immersive: no app header, no tabs slot, no weather. */}
      <header className="flex shrink-0 items-center gap-4">
        <Link href={backHref} aria-label="Leave cooking mode" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink">
          <CaretLeft size="1.5rem" weight="bold" aria-hidden />
        </Link>
        <Picture emoji={icon} className="size-[4.5rem] shrink-0" />
        <h1 className="min-w-0 truncate text-[3.5rem] leading-none font-extrabold tracking-[-0.03em] text-ink">{dishes.length > 1 ? title : name}</h1>
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
                className={`flex min-h-[var(--touch-target)] min-w-0 items-center gap-2 rounded-[var(--radius)] px-3.5 text-lg font-bold ${i === active ? "bg-ink text-board" : "bg-panel text-ink-soft"}`}
              >
                <Picture emoji={d.icon} className="size-8 shrink-0" />
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}
        <BatchSwitch value={batches} onPick={setBatches} tone="meal" big />
      </header>

      <div className="mt-[1.15rem] grid min-h-0 flex-1 grid-cols-[24rem_minmax(0,1fr)_24rem] gap-5">
        {/* Ingredients, times the batches: tap to tick off. */}
        <section className={card}>
          <h2 className={h2}>Ingredients</h2>
          {batches > 1 ? <p className="text-lg font-bold text-ink-muted">Everything ×{batches}, for {batches} batches.</p> : null}
          <ul ref={ingredientsRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {ingredients.slice(iPage * ingredientsPerPage, (iPage + 1) * ingredientsPerPage).map((ing) => {
              const done = ticked.includes(ing.id);
              const scaled = batchAmount(ing.amount, batches);
              const amount = measureText(scaled, ing.unit);
              return (
                <li key={ing.id}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() => setTicked((t) => (done ? t.filter((x) => x !== ing.id) : [...t, ing.id]))}
                    className="flex min-h-[3.5rem] w-full items-center gap-[0.7rem] text-left"
                  >
                    <span className={`flex size-12 shrink-0 items-center justify-center rounded-full border-[0.2rem] ${done ? "border-success bg-success text-white" : "border-check-border"}`}>
                      {done ? <Check size="1.25rem" weight="bold" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {amount ? <UnitPill amount={scaled} unit={ing.unit} text={amount} measures={measures} size="md" /> : null}
                      <span className={`text-[1.5rem] font-bold ${done ? "text-ink-muted line-through" : "text-ink"}`}>
                        {ing.name}
                        {ing.note ? `, ${ing.note}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {ingredients.length === 0 ? <li className="text-lg text-ink-muted">No ingredients written down.</li> : null}
          </ul>
          <Pager page={iPage} pages={pages} onPage={setIngredientPage} className="justify-center" />
        </section>

        {/* The step: one big printed step, the next two below, Back / Next. */}
        <section className="flex min-h-0 flex-col gap-[0.8rem]">
          {current ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-[0.8rem] overflow-hidden rounded-[var(--radius-dialog)] bg-meal px-8 py-7">
                <span className="tabular text-[1.15rem] font-bold tracking-[0.06em] text-meal-ink uppercase">
                  Step {step + 1} of {steps.length}
                </span>
                <p className="min-h-0 flex-1 overflow-hidden text-[3rem] leading-[1.2] font-extrabold tracking-[-0.02em] text-ink">{current.text}</p>
              </div>
              {upcoming.length ? (
                <div className="flex shrink-0 flex-col gap-2">
                  <h2 className="text-[1.25rem] font-bold text-ink-muted">Coming up</h2>
                  {upcoming.map((s, i) => (
                    <div key={s.id} className="flex min-h-[4.5rem] items-start gap-[0.7rem] rounded-[var(--radius)] bg-rail px-4 py-[0.8rem]">
                      <span className="tabular flex size-10 shrink-0 items-center justify-center rounded-full bg-board text-[1.25rem] font-extrabold text-ink">{step + i + 2}</span>
                      <p className="line-clamp-2 min-w-0 flex-1 pt-1 text-[1.5rem] leading-[1.2] font-bold text-ink">{s.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {last && notes ? <p className="font-hand line-clamp-3 shrink-0 text-2xl text-ink-soft">📝 {notes}</p> : null}
            </>
          ) : (
            <p className="flex-1 text-2xl text-ink-muted">No steps yet</p>
          )}
          <div className="mt-[0.2rem] flex shrink-0 gap-[0.8rem]">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              className="flex min-h-[4.5rem] flex-1 items-center justify-center gap-2 rounded-[var(--radius)] bg-panel text-[1.75rem] font-bold text-ink disabled:opacity-40"
            >
              <CaretLeft size="1.75rem" weight="bold" aria-hidden />
              Back
            </button>
            {(last || !current) && mealId ? (
              <button type="button" onClick={() => setFinishing(true)} className="flex min-h-[4.5rem] flex-[2] items-center justify-center gap-2 rounded-[var(--radius)] bg-success text-[1.75rem] font-bold text-white">
                <Check size="1.75rem" weight="bold" aria-hidden />
                Done cooking
              </button>
            ) : last || !current ? (
              // Cooking a dish from the Dishes tab: no planned meal to mark, so Done just goes back.
              <Link href={backHref} className="flex min-h-[4.5rem] flex-[2] items-center justify-center gap-2 rounded-[var(--radius)] bg-success text-[1.75rem] font-bold text-white">
                <Check size="1.75rem" weight="bold" aria-hidden />
                Done cooking
              </Link>
            ) : (
              <button type="button" onClick={() => setStep(step + 1)} className="flex min-h-[4.5rem] flex-[2] items-center justify-center gap-2 rounded-[var(--radius)] bg-ink text-[1.75rem] font-bold text-board">
                Next step
                <CaretRight size="1.75rem" weight="bold" aria-hidden />
              </button>
            )}
          </div>
        </section>

        {/* Kitchen helpers: timers (from the step, or quick ones), the oven, safe inside temperatures. */}
        <aside className={`${card} gap-2`}>
          <h2 className={h2}>Timers</h2>
          {timers.slice(0, 3).map((t) => {
            const done = t.endsAt <= now;
            return (
              <div key={t.id} className={`flex items-center gap-2 rounded-[var(--radius)] px-3 py-2 ${done ? "animate-pulse bg-now text-white" : "bg-rail text-ink"}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{t.label}</span>
                  <span className="tabular text-3xl font-extrabold">{done ? "Done!" : timeLeft(t, now)}</span>
                </span>
                <button type="button" onClick={() => addMinute(t.id)} className="min-h-12 rounded-[var(--radius-small)] bg-board/70 px-3 text-lg font-bold text-ink">
                  +1 min
                </button>
                <button type="button" aria-label="Stop" onClick={() => stopTimer(t.id)} className="flex size-12 items-center justify-center rounded-full bg-board/70 text-ink">
                  <X size="1.25rem" weight="bold" aria-hidden />
                </button>
              </div>
            );
          })}
          {timers.length === 0 ? <p className="text-[1.25rem] text-ink-muted">None running.{stepTimers.length ? " This step has one:" : ""}</p> : null}
          {stepTimers.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => startTimer(h.label ?? `Step ${step + 1}`, h.minutes ?? 1, mealId)}
              className="flex min-h-[var(--touch-target)] items-center justify-center gap-2 rounded-[var(--radius)] bg-meal px-4 text-[1.25rem] font-bold text-meal-ink"
            >
              Start {minutesText(h.minutes ?? 0)}
              {h.label ? ` · ${h.label.toLowerCase()}` : ""}
            </button>
          ))}
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 5, 10, 15].map((m) => (
              <button key={m} type="button" onClick={() => startTimer(`${m} min`, m, mealId)} className="tabular min-h-12 rounded-[var(--radius-small)] bg-panel text-lg font-bold text-ink">
                {m} min
              </button>
            ))}
          </div>

          {oven ? (
            <>
              <h2 className={`${h2} mt-[0.6rem]`}>Oven</h2>
              <p className="tabular text-[1.75rem] font-extrabold text-ink">{bothTemperatures(oven.temperature ?? 0, temperatureUnit, "oven")}</p>
              <p className="text-lg text-ink-muted">{oven.at > step ? `Heat it up for step ${oven.at + 1}.` : "It should be hot now."}</p>
            </>
          ) : null}

          <h2 className={`${h2} mt-[0.6rem]`}>Safe inside</h2>
          {doneness.slice(0, 2).map((h, i) => (
            <p key={i} className="tabular text-[1.5rem] font-bold text-ink">
              {h.label ?? "Inside"} {bothTemperatures(h.temperature ?? 0, temperatureUnit, "doneness")}
            </p>
          ))}
          {doneness.length === 0 ? (
            <ul className="flex flex-col">
              {DONENESS.slice(0, 4).map((d) => (
                <li key={d.label} className="flex justify-between gap-2 text-lg text-ink-soft">
                  <span className="truncate">{d.label}</span>
                  <span className="tabular font-bold">
                    {temperatureUnit === "celsius" ? d.celsius : d.fahrenheit}
                    {deg}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>

      {finishing && mealId ? (
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
