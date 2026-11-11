"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { Chips, Emoji, Field, Input } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { LeaveDialog, SaveButton } from "@/components/unsaved-changes";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import { saveDish } from "./actions";
import { BLANK_INGREDIENT, IngredientsEditor, StepsEditor, type EditingStep, type IngredientDraft, type StepDraft } from "./recipe-editors";

/*
 * A dish's card in the Menu Manager's Dishes tab, with ONE Save for the
 * whole dish (Connor, 2026-11-10: there used to be four, one per tab, and
 * edits got lost switching tabs). The tabs switch in place, so changes on
 * every tab are kept until Save, and Undo puts them all back. Closing the
 * card or leaving the screen with changes asks first.
 */

export type DishTab = "recipe" | "basics" | "ingredients" | "steps" | "notes";
const TABS: { tab: DishTab; label: string }[] = [
  { tab: "recipe", label: "Recipe" },
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
  visibility: string;
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
  closeHref,
  view,
  remove,
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
  closeHref: string;
  /** The saved recipe, for the Recipe tab. */
  view: ReactNode;
  /** The Remove dish button. */
  remove: ReactNode;
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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 lg:p-8">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.32)]" />
      <section
        role="dialog"
        aria-label={dish.name}
        className="relative flex max-h-full w-full max-w-[96rem] flex-col overflow-hidden rounded-[var(--radius-card)] bg-board shadow-[0_0_2.5rem_rgba(30,35,45,0.25)] lg:h-[52rem]"
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-frame px-7 py-4">
          <Emoji emoji={dish.icon} className="size-12" />
          <h2 className="min-w-0 flex-1 truncate text-3xl font-extrabold text-ink">{dish.name}</h2>
          <div className="flex gap-1 rounded-2xl bg-panel p-1" role="tablist" aria-label="Dish">
            {TABS.map((t) => (
              <button
                key={t.tab}
                type="button"
                role="tab"
                aria-selected={t.tab === tab}
                onClick={() => setTab(t.tab)}
                className={`flex min-h-12 items-center rounded-xl px-5 text-base font-bold ${t.tab === tab ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save(null)} onUndo={undo} />
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink hover:bg-panel"
          >
            <X size="1.75rem" weight="bold" aria-hidden />
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-7 py-5">
          {tab === "recipe" ? (
            <>
              {dirty ? <p className="mb-2 shrink-0 text-base font-bold text-ink-muted">This shows the recipe as last saved. Save to see your changes here.</p> : null}
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
                      <Input name="name" defaultValue={dish.name} required maxLength={80} className="w-[30rem]" />
                    </Field>
                  </div>
                  <div className="flex gap-4">
                    <Field label="Serves">
                      <Input name="serves" type="number" min={1} max={50} defaultValue={dish.serves} className="w-28" />
                    </Field>
                    <Field label="Hands-on minutes">
                      <Input name="handsOnMinutes" type="number" min={0} max={1440} defaultValue={dish.hands_on_minutes ?? ""} className="w-36" />
                    </Field>
                    <Field label="Total minutes">
                      <Input name="totalMinutes" type="number" min={0} max={2880} defaultValue={dish.total_minutes ?? ""} className="w-36" />
                    </Field>
                  </div>
                  <p className="-mt-3 text-base text-ink-muted">Hands-on time is how early the meal shows on Today, so you start in time.</p>
                  <Chips name="visibility" label="Who can see it" defaultValue={dish.visibility} options={VISIBILITY_OPTIONS} />
                </div>
                <div className="flex flex-col gap-5">
                  <Chips
                    name="kindIds"
                    label="What it can be in a meal"
                    multiple
                    defaultValue={dish.kind_ids}
                    options={kinds.slice(0, 14).map((k) => ({ value: k.id, label: k.name, leading: <Emoji emoji={k.icon} className="size-7" /> }))}
                  />
                  <Chips
                    name="goesWith"
                    label="Goes with (offered first in these meals)"
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
                <span className="text-base font-bold text-ink">Notes (swaps, what the kids think, where it came from)</span>
                <textarea
                  name="notes"
                  defaultValue={dish.notes ?? ""}
                  maxLength={4000}
                  className="font-hand min-h-0 flex-1 resize-none rounded-[var(--radius)] border-2 border-frame p-4 text-2xl text-ink outline-none focus:border-accent"
                />
              </label>
              <Field label="Recipe link">
                <Input name="sourceUrl" type="url" defaultValue={dish.source_url ?? ""} placeholder="https://…" className="w-[40rem]" />
              </Field>
            </div>
          </form>
          {/* Remove sits under Basics, outside the form (it's its own action, and asks nothing). */}
          {tab === "basics" ? <div className="flex shrink-0 justify-end border-t border-frame pt-4">{remove}</div> : null}

          {tab === "ingredients" ? <IngredientsEditor rows={rows} setRows={setRows} /> : null}
          {tab === "steps" ? <StepsEditor steps={stepList} setSteps={setStepList} temperatureUnit={temperatureUnit} /> : null}
        </div>
      </section>

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
    </div>
  );
}
