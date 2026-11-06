import Link from "next/link";
import { Button, Emoji } from "@/components/ui";
import { IMPORTANCE_LABEL } from "@/lib/chores";
import type { ChoreWithTiming } from "./chores/data";
import { survivalRescue } from "./meals/actions";
import { readyCount, type BackupPart, type MealBasics } from "./meals/data";
import { Modal } from "./meals/parts";
import type { TodayMeal } from "./meals/today";

/*
 * The Survival card, opened by the Survival button on Today. It offers two
 * things in one go: swap the meals still to cook for backup meals, and skip
 * the chores that are due. Routines and to-dos are left alone.
 *
 * It suggests (the next meal gets the readiest backup, chores are ticked
 * unless they're important) and nothing happens until you press "Do it".
 */

/** How many meals the card offers to swap (the rest stay as planned). */
const MEAL_LIMIT = 2;
/** How many backup meals each meal offers, beside "Keep it". */
const BACKUP_CHOICES = 3;
/** How many due chores the card lists (the rest stay on the chores list). */
const CHORE_LIMIT = 6;

export function SurvivalCard({
  meals,
  basics,
  parts,
  chores,
  closeHref,
}: {
  /** Today's meals that still need cooking, soonest first. */
  meals: TodayMeal[];
  basics: MealBasics;
  parts: BackupPart[];
  /** Chores due today. */
  chores: ChoreWithTiming[];
  closeHref: string;
}) {
  // Backup meals, the ones you could make right now first.
  const backups = basics.recipes
    .filter((r) => r.is_backup)
    .map((r) => ({ ...r, ready: readyCount(parts.filter((p) => p.recipe_id === r.id)) }))
    .sort((a, b) => Number(b.ready > 0) - Number(a.ready > 0) || b.ready - a.ready || a.name.localeCompare(b.name))
    .slice(0, BACKUP_CHOICES);
  const shownMeals = meals.slice(0, MEAL_LIMIT);
  const shownChores = chores.slice(0, CHORE_LIMIT);
  const moreChores = chores.length - shownChores.length;
  const heading = "mb-3 text-2xl font-bold text-ink";

  return (
    <Modal title="Survival day" icon={<Emoji emoji="🛟" className="size-12" />} closeHref={closeHref} wide>
      <form action={survivalRescue} className="flex min-h-0 flex-1 flex-col gap-5">
        <input type="hidden" name="returnTo" value="/" />
        <div className="grid min-h-0 flex-1 gap-8 lg:grid-cols-[3fr_2fr]">
          {/* Meals: keep each one, or swap it for a backup. */}
          <section className="flex min-h-0 flex-col">
            <h3 className={heading}>Swap a meal for a backup?</h3>
            {shownMeals.length === 0 ? (
              <p className="text-xl text-ink-muted">No meals left to cook today.</p>
            ) : backups.length === 0 ? (
              <p className="text-xl text-ink-muted">
                No backup meals yet.{" "}
                <Link href="/meals/backups" className="font-bold text-accent underline">
                  Make one
                </Link>
                , like a frozen lasagne and garlic bread.
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {shownMeals.map((meal, i) => {
                  // The next meal gets the readiest backup; later ones are kept unless you pick.
                  const suggested = i === 0 && backups[0].ready > 0 ? backups[0].id : "keep";
                  return (
                    <fieldset key={meal.id} className="flex flex-col gap-2.5">
                      <input type="hidden" name="mealId" value={meal.id} />
                      <legend className="mb-2 flex items-center gap-2.5 text-xl font-bold text-ink">
                        <Emoji emoji={meal.icon} className="size-9" />
                        {meal.name}
                      </legend>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Choice name={`backup-${meal.id}`} value="keep" checked={suggested === "keep"} emoji={meal.icon} label="Keep it" note="As planned" />
                        {backups.map((b) => (
                          <Choice
                            key={b.id}
                            name={`backup-${meal.id}`}
                            value={b.id}
                            checked={suggested === b.id}
                            emoji={b.icon ?? "🧊"}
                            label={b.name}
                            note={b.ready > 0 ? `Enough for ${b.ready}` : "Running out"}
                            warn={b.ready === 0}
                          />
                        ))}
                      </div>
                      <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink">
                        <input type="checkbox" name={`move-${meal.id}`} defaultChecked className="size-7 accent-[var(--color-ink)]" />
                        If swapped, move {meal.name} to the next free night
                      </label>
                    </fieldset>
                  );
                })}
              </div>
            )}
          </section>

          {/* Chores: ticked ones are skipped this time. */}
          <section className="flex min-h-0 flex-col">
            <h3 className={heading}>Skip today&apos;s chores?</h3>
            {shownChores.length === 0 ? (
              <p className="text-xl text-ink-muted">No chores due today.</p>
            ) : (
              <ul className="flex flex-col">
                {shownChores.map((c) => (
                  <li key={c.id} className="border-b border-panel last:border-0">
                    <label className="flex min-h-16 cursor-pointer items-center gap-3.5 py-1">
                      <input type="checkbox" name="skip" value={c.id} defaultChecked={c.importance !== "high"} className="size-7 shrink-0 accent-[var(--color-ink)]" />
                      <Emoji emoji={c.icon ?? "🧹"} className="size-10" />
                      <span className="min-w-0 flex-1 truncate text-xl font-semibold text-ink">{c.name}</span>
                      {c.importance === "high" ? (
                        <span className="shrink-0 rounded-full bg-now px-2.5 py-1 text-sm font-extrabold text-white">{IMPORTANCE_LABEL.high}</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {moreChores > 0 ? (
              <p className="mt-2 text-lg text-ink-muted">
                +{moreChores} more stay on the{" "}
                <Link href="/chores" className="font-bold text-accent">
                  chores list
                </Link>
                .
              </p>
            ) : null}
          </section>
        </div>

        <div className="flex shrink-0 items-center gap-5 border-t border-frame pt-4">
          <Button className="px-8 text-xl">Do it</Button>
          <p className="text-lg text-ink-muted">Skipped chores come back next time. Routines and to-dos stay as they are.</p>
        </div>
      </form>
    </Modal>
  );
}

/** One big tappable choice tile (a radio button). */
function Choice({
  name,
  value,
  checked,
  emoji,
  label,
  note,
  warn = false,
}: {
  name: string;
  value: string;
  checked: boolean;
  emoji: string;
  label: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <label className="flex min-h-18 cursor-pointer items-center gap-3 rounded-2xl border-2 border-frame px-3.5 has-checked:border-meal-ink has-checked:bg-meal">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="sr-only" />
      <Emoji emoji={emoji} className="size-12" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xl leading-tight font-bold text-ink">{label}</span>
        <span className={`truncate text-sm ${warn ? "text-danger" : "text-ink-muted"}`}>{note}</span>
      </span>
    </label>
  );
}
