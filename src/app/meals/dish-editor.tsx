"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { Chips, Emoji, Field, Input, segItemClass, segTrackClass } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { NumberStepper } from "@/components/touch-pickers";
import { LeaveDialog, SaveButton } from "@/components/unsaved-changes";
import { removeRecipe, saveDish } from "./actions";
import { BLANK_INGREDIENT, IngredientsEditor, StepsEditor, type EditingStep, type IngredientDraft, type StepDraft } from "./recipe-editors";

/*
 * A dish's card in the Meals → Dishes tab (the right-hand column), with ONE Save for the
 * whole dish (Connor, 2026-11-10: there used to be four, one per tab, and
 * edits got lost switching tabs). The tabs switch in place, so changes on
 * every tab are kept until Save, and Undo puts them all back. Opening
 * another dish or leaving the screen with changes asks first.
 */

export type DishTab = "recipe" | "basics" | "ingredients" | "steps" | "notes";
const TABS: { tab: DishTab; label: string }[] = [
  { tab: "recipe", label: "Read" },
  { tab: "basics", label: "Basics" },
  { tab: "ingredients", label: "Ingredients" },
  { tab: "steps", label: "Steps" },
  { tab: "notes", label: "Notes" },
];

export type EditableDish = {
  id: string;
  name: string;
  icon: string | null;
  serves: number;
  hands_on_minutes: number | null;
  total_minutes: number | null;
  kind_ids: string[];
  tag_ids: string[];
  /** Kinds of meal it goes with: offered first in their side spots. */
  category_ids: string[];
  notes: string | null;
  source_url: string | null;
};
type Option = { id: string; name: string; icon: string | null };

const startSteps = (steps: StepDraft[]): EditingStep[] => (steps.length ? steps : [{ text: "", helpers: [] }]).map((s) => ({ ...s, dismissed: [] }));
const startIngredients = (rows: IngredientDraft[]): IngredientDraft[] => (rows.length ? rows : [BLANK_INGREDIENT]);
/** Only what gets saved, for spotting changes. */
const stepsKey = (steps: EditingStep[]) => JSON.stringify(steps.map(({ text, helpers }) => ({ text, helpers })));

export function DishEditor({
  dish,
  kinds,
  tags,
  categories,
  ingredients,
  steps,
  temperatureUnit,
  initialTab,
  dishHref,
  batches,
  view,
  removeTo,
}: {
  dish: EditableDish;
  kinds: Option[];
  tags: Option[];
  /** Kinds of meal (Pasta, Tacos…), for "Goes with". */
  categories: Option[];
  ingredients: IngredientDraft[];
  steps: StepDraft[];
  temperatureUnit: "celsius" | "fahrenheit";
  initialTab: DishTab;
  /** This dish's address, without a tab. */
  dishHref: string;
  /** The ×1/×2/×3 switch, beside the title on the Recipe tab. */
  batches: ReactNode;
  /** The saved recipe, for the Recipe tab. */
  view: ReactNode;
  /** Where to go once the dish is removed. */
  removeTo: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<DishTab>(initialTab);
  // A new key puts the form's own fields (Basics, Notes) back as they were saved.
  const [formKey, setFormKey] = useState(0);
  const [formChanged, setFormChanged] = useState(false);
  const [rows, setRows] = useState(() => startIngredients(ingredients));
  const [stepList, setStepList] = useState(() => startSteps(steps));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  const dirty =
    formChanged ||
    JSON.stringify(rows) !== JSON.stringify(startIngredients(ingredients)) ||
    stepsKey(stepList) !== stepsKey(startSteps(steps));

  // Leaving with changes asks first: closing the card, another dish, the menu.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const tabHref = (t: DishTab) => `${dishHref}${dishHref.includes("?") ? "&" : "?"}tab=${t}`;

  async function save(then: string | null) {
    if (!form.current) return;
    setSaving(true);
    setError(null);
    const data = new FormData(form.current);
    data.set("ingredients", JSON.stringify(rows));
    data.set("steps", stepsKey(stepList));
    const result = await saveDish(data);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      setLeaving(null);
      return;
    }
    dirtyRef.current = false;
    setLeaving(null);
    // Reload the card from what was saved, on the same tab (or go where you were going).
    router.replace(then ?? tabHref(tab), { scroll: false });
  }

  function undo() {
    setFormKey((k) => k + 1);
    setFormChanged(false);
    setRows(startIngredients(ingredients));
    setStepList(startSteps(steps));
    setError(null);
  }

  return (
    <section aria-label={dish.name} className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised">
        <div className="flex min-h-[3.5rem] shrink-0 items-center gap-[0.7rem]">
          <Emoji emoji={dish.icon} className="size-[2.15rem]" />
          <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">{dish.name}</h2>
          {tab === "recipe" && !dirty ? batches : <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save(null)} onUndo={undo} />}
        </div>
        <div className={`${segTrackClass} mt-[0.7rem] mb-2 self-start`} role="tablist" aria-label="Dish">
          {TABS.map((t) => (
            <button key={t.tab} type="button" role="tab" aria-selected={t.tab === tab} onClick={() => setTab(t.tab)} className={`${segItemClass(t.tab === tab)} min-w-[8rem]`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === "recipe" ? (
            <>
              {view}
            </>
          ) : null}

          {/* Basics and Notes live in one form, always there but hidden when another tab shows, so nothing typed is lost. */}
          <form
            key={formKey}
            ref={form}
            onInput={() => setFormChanged(true)}
            onChange={() => setFormChanged(true)}
            onSubmit={(e) => {
              e.preventDefault();
              save(null);
            }}
            className={tab === "basics" || tab === "notes" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
          >
            <input type="hidden" name="id" value={dish.id} />
            <div className={tab === "basics" ? "flex min-h-0 flex-1 flex-col gap-4" : "hidden"}>
              <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-10 gap-y-5">
                <div className="flex flex-col gap-5">
                  <div className="flex items-end gap-4">
                    <EmojiPicker initial={dish.icon ?? ""} nameField="name" onChange={() => setFormChanged(true)} />
                    <Field label="Name">
                      <Input name="name" defaultValue={dish.name} required maxLength={80} className="w-[24rem]" />
                    </Field>
                  </div>
                  <div className="flex gap-4">
                    <Field label="Serves">
                      <NumberStepper name="serves" min={1} max={50} defaultValue={dish.serves} onChange={() => setFormChanged(true)} aria-label="Serves" />
                    </Field>
                    <Field label="Hands-on time">
                      <NumberStepper name="handsOnMinutes" min={0} max={1440} step={5} defaultValue={dish.hands_on_minutes ?? null} allowEmpty unit="min" onChange={() => setFormChanged(true)} aria-label="Hands-on time" />
                    </Field>
                    <Field label="Total time">
                      <NumberStepper name="totalMinutes" min={0} max={2880} step={5} defaultValue={dish.total_minutes ?? null} allowEmpty unit="min" onChange={() => setFormChanged(true)} aria-label="Total time" />
                    </Field>
                  </div>
                </div>
                <div className="flex flex-col gap-5">
                  <Chips
                    name="kindIds"
                    label="Course"
                    multiple
                    defaultValue={dish.kind_ids}
                    options={kinds.slice(0, 14).map((k) => ({ value: k.id, label: k.name, leading: <Emoji emoji={k.icon} className="size-7" /> }))}
                  />
                  <Chips
                    name="goesWith"
                    label="Goes with"
                    multiple
                    defaultValue={dish.category_ids}
                    options={categories.slice(0, 12).map((c) => ({ value: c.id, label: c.name, leading: <Emoji emoji={c.icon} className="size-7" /> }))}
                  />
                  <Chips
                    name="tagIds"
                    label="Tags"
                    multiple
                    defaultValue={dish.tag_ids}
                    options={tags.map((t) => ({ value: t.id, label: t.name, leading: <Emoji emoji={t.icon} className="size-7" /> }))}
                  />
                </div>
              </div>
            </div>
            <div className={tab === "notes" ? "flex min-h-0 flex-1 flex-col gap-4" : "hidden"}>
              <label className="flex min-h-0 flex-1 flex-col gap-1.5">
                <span className="text-base font-bold text-ink">Notes</span>
                <textarea
                  name="notes"
                  defaultValue={dish.notes ?? ""}
                  maxLength={4000}
                  className="font-hand min-h-0 flex-1 resize-none rounded-[var(--radius)] border-2 border-frame p-4 text-2xl text-ink outline-none focus:border-accent"
                />
              </label>
              <Field label="Recipe link">
                <Input name="sourceUrl" type="url" defaultValue={dish.source_url ?? ""} placeholder="https://…" className="w-[36rem]" />
              </Field>
            </div>
          </form>
          {/* Remove sits under Basics, outside the form (it's its own action, and asks "sure?" first). */}
          {tab === "basics" ? (
            <div className="flex shrink-0 justify-end border-t border-frame pt-4">
              <RemoveDish id={dish.id} name={dish.name} returnTo={removeTo} />
            </div>
          ) : null}

          {tab === "ingredients" ? <IngredientsEditor rows={rows} setRows={setRows} /> : null}
          {tab === "steps" ? <StepsEditor steps={stepList} setSteps={setStepList} temperatureUnit={temperatureUnit} /> : null}
        </div>

      {leaving ? (
        <LeaveDialog
          what="parts of this dish"
          saving={saving}
          onSave={() => save(leaving)}
          onStay={() => setLeaving(null)}
          onLeave={() => {
            dirtyRef.current = false;
            const to = leaving;
            setLeaving(null);
            // Screens left behind stay alive, so throw the changes away too.
            undo();
            router.push(to, { scroll: false });
          }}
        />
      ) : null}
    </section>
  );
}

/** Remove dish, after a "sure?" (meals that were only this dish go too). */
function RemoveDish({ id, name, returnTo }: { id: string; name: string; returnTo: string }) {
  const [asking, setAsking] = useState(false);
  const danger = "inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] px-5 text-lg font-bold";
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`${danger} border-2 border-danger bg-board text-danger`}>
        <Trash size="1.375rem" aria-hidden />
        Remove dish
      </button>
    );
  }
  return (
    <form action={removeRecipe} className="flex items-center gap-3" role="alert">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={name} />
      <span className="text-lg font-bold text-ink">Remove {name}? Meals that are only this dish go too.</span>
      <button type="button" onClick={() => setAsking(false)} className={`${danger} bg-panel text-ink`}>
        Keep it
      </button>
      <button className={`${danger} bg-danger text-white`}>
        <Trash size="1.375rem" aria-hidden />
        Yes, remove
      </button>
    </form>
  );
}
