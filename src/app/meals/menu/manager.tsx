"use client";

import { Pager as PageArrows } from "@/components/pager";
import { useState } from "react";
import { Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { EmptyState, Emoji, primaryActionClass, secondaryActionClass } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { menuMealIcon, menuMealName, type DishLike, type MenuMealLike } from "@/lib/menu";
import { saveMenu, type DraftKind, type DraftMenuMeal, type KindChanges, type MenuChanges } from "../menu-actions";
import { BatchSwitch, MealsHeader, roundIconClass } from "../parts";

/*
 * The Menu Manager's Meals tab, in the browser: every change waits for
 * the one Save in the header.
 */

export type ManagerMeal = DraftMenuMeal;
type Kind = { id: string; name: string; icon: string | null };
type Category = DraftKind;

/** The left column's "every meal" and "under no kind" rows. */
const ALL = "all";
const NONE = "none";
const KINDS_PER_PAGE = 7;
/** 5 × 3 tiles; the last page keeps a tile for Add. */
const MEALS_PER_PAGE = 14;
const SPOTS_PER_PAGE = 7;
const DISHES_PER_PAGE = 11;

/** The three white cards (g-final-meals-menu: 1.25rem × 1.4rem padding, raised). */
const card = "flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised";

let counter = 0;
const newId = () => `new-${Date.now().toString(36)}-${counter++}`;

function asLike(m: ManagerMeal): MenuMealLike {
  return { id: m.id, name: m.name, icon: m.icon, category_ids: m.categoryIds, spots: m.spots.map((s, position) => ({ position, kind_id: s.kindId, recipe_id: s.recipeId, batches: s.batches })) };
}

function Arrows({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  return <PageArrows page={page} pages={pages} onPage={setPage} />;
}

function paged<T>(items: T[], page: number, per: number) {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * per, (p + 1) * per), page: p, pages };
}

export function MenuManager({
  initial,
  categories,
  kinds,
  dishes,
  category,
  meal: startMeal,
  message,
  problem,
}: {
  initial: ManagerMeal[];
  categories: Category[];
  kinds: Kind[];
  dishes: DishLike[];
  /** The kind of meal picked on the left (from the link). */
  category: string | null;
  /** The meal open on the right (from the link, e.g. after a save). */
  meal: string | null;
  message: string | null;
  problem: string | null;
}) {
  const [draft, setDraft] = useState<ManagerMeal[]>(initial);
  const [kindDraft, setKindDraft] = useState<Category[]>(categories);
  /** The kind of meal being renamed in its row (a new one opens this way). */
  const [editingKind, setEditingKind] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>(category ?? (categories[0]?.id ?? ALL));
  const [selected, setSelected] = useState<string | null>(startMeal);
  // Start on the page that shows the picked kind ("Every meal" is first).
  const [kindPage, setKindPage] = useState(() => Math.floor((categories.findIndex((c) => c.id === category) + 1) / KINDS_PER_PAGE));
  const [mealPage, setMealPage] = useState(0);
  const kindsPerPage = KINDS_PER_PAGE;
  const mealsPerPage = MEALS_PER_PAGE;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || JSON.stringify(kindDraft) !== JSON.stringify(categories);
  const guard = useUnsavedChanges(dirty, () => {
    setDraft(initial);
    setKindDraft(categories);
    setEditingKind(null);
  });

  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const kindById = new Map(kinds.map((k) => [k.id, k]));
  const nameOf = (m: ManagerMeal) => menuMealName(asLike(m), dishById);

  const save = async (then?: string | null) => {
    const changes: MenuChanges = {};
    const before = new Map(initial.map((m) => [m.id, JSON.stringify(m)]));
    for (const m of draft) if (before.get(m.id) !== JSON.stringify(m)) changes[m.id] = m;
    for (const m of initial) if (!draft.some((d) => d.id === m.id)) changes[m.id] = null;
    const kindChanges: KindChanges = {};
    const kindsBefore = new Map(categories.map((c) => [c.id, c]));
    for (const k of kindDraft) {
      const was = kindsBefore.get(k.id);
      if (!was || was.name !== k.name || was.icon !== k.icon) kindChanges[k.id] = { name: k.name, icon: k.icon };
    }
    for (const c of categories) if (!kindDraft.some((k) => k.id === c.id)) kindChanges[c.id] = null;
    setSaving(true);
    const result = await saveMenu(changes, kindChanges);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      return;
    }
    // Come back to the same kind and meal (a new meal has its real id now).
    const meal = selected ? (result.ids[selected] ?? selected) : null;
    const kind = result.ids[picked] ?? picked;
    guard.saved(then ?? `/meals/menu?category=${kind}${meal && !meal.startsWith("new-") ? `&meal=${meal}` : ""}`);
  };
  const undo = () => {
    setDraft(initial);
    setKindDraft(categories);
    setEditingKind(null);
    setError(null);
    setSelected(null);
  };
  const change = (id: string, f: (m: ManagerMeal) => ManagerMeal) => {
    setError(null);
    setDraft((d) => d.map((m) => (m.id === id ? f(m) : m)));
  };

  // Left: kinds of meal. Leftovers comes last: it's the blank, with no meals.
  const loose = draft.filter((m) => m.categoryIds.length === 0);
  const rows: (Category & { count: number | null })[] = [
    { id: ALL, name: "Every meal", icon: "📖", count: draft.length, active: true, isLeftovers: false },
    ...kindDraft.filter((c) => !c.isLeftovers).map((c) => ({ ...c, count: draft.filter((m) => m.categoryIds.includes(c.id)).length })),
    ...(loose.length ? [{ id: NONE, name: "Under no kind", icon: "📒", count: loose.length, active: true, isLeftovers: false }] : []),
    ...kindDraft.filter((c) => c.isLeftovers).map((c) => ({ ...c, count: null })),
  ];
  const changeKind = (id: string, patch: Partial<Category>) => {
    setError(null);
    setKindDraft((d) => d.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  };
  const addKind = () => {
    const id = newId();
    setError(null);
    setKindDraft((d) => [...d, { id, name: "", icon: null, active: true, isLeftovers: false }]);
    setPicked(id);
    setEditingKind(id);
    setMealPage(0);
    // The new line sits just above Leftovers, at the bottom.
    setKindPage(Math.floor((kindDraft.filter((k) => !k.isLeftovers).length + 1) / kindsPerPage));
  };
  const removeKind = (id: string) => {
    setError(null);
    setKindDraft((d) => d.filter((k) => k.id !== id));
    setDraft((d) => d.map((m) => (m.categoryIds.includes(id) ? { ...m, categoryIds: m.categoryIds.filter((c) => c !== id) } : m)));
    setEditingKind(null);
    setPicked(ALL);
  };
  const kindList = paged(rows, kindPage, kindsPerPage);
  const pickedRow = rows.find((r) => r.id === picked) ?? rows[0];
  const blank = pickedRow.isLeftovers;

  // Middle: that kind's meals.
  const shown = blank ? [] : pickedRow.id === ALL ? draft : pickedRow.id === NONE ? loose : draft.filter((m) => m.categoryIds.includes(pickedRow.id));
  const mealList = paged(shown, mealPage, mealsPerPage);
  // Nothing picked yet: the kind's first meal is open, like the mock.
  const meal = draft.find((m) => m.id === selected) ?? (selected === null ? (shown[0] ?? null) : null);

  const addMeal = () => {
    const id = newId();
    const main = kinds.find((k) => k.name === "Main") ?? kinds[0];
    const fresh: ManagerMeal = {
      id,
      name: "",
      icon: null,
      categoryIds: pickedRow.id === ALL || pickedRow.id === NONE || blank ? [] : [pickedRow.id],
      spots: [{ kindId: main?.id ?? null, recipeId: null, batches: 1 }],
    };
    setDraft((d) => [...d, fresh]);
    setSelected(id);
    setMealPage(Math.floor(shown.length / mealsPerPage));
  };

  const editingRow = editingKind ? rows.find((r) => r.id === editingKind) : undefined;

  return (
    <>
      <MealsHeader tab="menu" error={problem} message={problem ? null : message}>
        <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
        {blank ? null : (
          <button type="button" onClick={addMeal} className={primaryActionClass}>
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Add a meal
          </button>
        )}
      </MealsHeader>

      {/*
        A wall of meal tiles (Connor, 2026-11-26, look A): the kinds of meal
        are filter chips across the top, the meals big picture tiles, and
        the picked meal's dishes and batches in the card on the right.
      */}
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_44rem]">
        <section className={card}>
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Kinds of meal">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {kindList.items.map((r) => {
                const on = r.id === pickedRow.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setPicked(r.id);
                      setMealPage(0);
                      setEditingKind(null);
                    }}
                    aria-pressed={on}
                    className={`flex min-h-12 items-center gap-2 rounded-full px-4 text-[1.25rem] font-bold ${on ? "bg-ink text-board" : "bg-rail text-ink-soft"} ${r.active ? "" : "opacity-55"}`}
                  >
                    {r.id === ALL ? null : <Emoji emoji={r.icon} className="size-7" />}
                    <span className="max-w-[12rem] truncate">{r.id === ALL ? "All" : r.name || "No name"}</span>
                    {r.count !== null ? <span className={`tabular ${on ? "text-board/70" : "text-ink-muted"}`}>{r.count}</span> : null}
                  </button>
                );
              })}
            </div>
            <Arrows page={kindList.page} pages={kindList.pages} setPage={setKindPage} />
            {pickedRow.id !== ALL && pickedRow.id !== NONE ? (
              <button type="button" onClick={() => setEditingKind(pickedRow.id)} aria-label={`Rename ${pickedRow.name}`} className={roundIconClass}>
                <PencilSimple size="1.5rem" aria-hidden />
              </button>
            ) : null}
            <button type="button" onClick={addKind} className={secondaryActionClass}>
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Kind
            </button>
          </div>
          {editingRow ? (
            <div className="mt-3 max-w-[36rem] shrink-0">
              <KindEditor
                kind={editingRow}
                onChange={(patch) => changeKind(editingRow.id, patch)}
                onRemove={editingRow.isLeftovers ? null : () => removeKind(editingRow.id)}
                onDone={() => setEditingKind(null)}
              />
            </div>
          ) : null}

          {blank ? (
            // The Leftovers kind is a blank: a night for what's already cooked, so it has no meals of its own.
            <div className="m-auto flex max-w-[30rem] flex-col items-center gap-2 text-center">
              <Emoji emoji={pickedRow.icon ?? "🥡"} className="size-20" />
              <span className="text-2xl font-bold text-ink">A leftovers night</span>
              <span className="text-lg text-ink-muted">No meals to set up: it’s for eating what’s already cooked. Plan it in the Planner like any kind.</span>
            </div>
          ) : (
            <div className="mt-4 grid min-h-0 flex-1 grid-cols-5 grid-rows-3 gap-3">
              {mealList.items.map((m) => {
                const on = m.id === meal?.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelected(m.id)}
                    aria-pressed={on}
                    className={`flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 px-3 text-center ${on ? "border-ink bg-meal" : "border-frame bg-board hover:bg-rail"}`}
                  >
                    <Emoji emoji={menuMealIcon(asLike(m), dishById) ?? "🍽️"} className="size-[4.5rem]" />
                    <span className="line-clamp-2 text-[1.35rem] leading-[1.15] font-extrabold text-ink">{nameOf(m)}</span>
                  </button>
                );
              })}
              {mealList.page === mealList.pages - 1 ? (
                <button type="button" onClick={addMeal} className="flex min-h-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-frame text-[1.35rem] font-bold text-ink-soft hover:bg-rail">
                  <Plus size="2rem" weight="bold" aria-hidden />
                  Add
                </button>
              ) : null}
            </div>
          )}
          {blank ? null : (
            <div className="mt-3 flex shrink-0 justify-end">
              <Arrows page={mealList.page} pages={mealList.pages} setPage={setMealPage} />
            </div>
          )}
        </section>

        {/* The picked meal: its dishes and batches */}
        <section className={`${card} relative`}>
          {meal ? (
            <MealEditor
              key={meal.id}
              meal={meal}
              name={nameOf(meal)}
              categories={kindDraft.filter((c) => !c.isLeftovers && c.name.trim())}
              kinds={kinds}
              dishes={dishes}
              dishById={dishById}
              kindById={kindById}
              onChange={(f) => change(meal.id, f)}
              onRemove={() => {
                setDraft((d) => d.filter((m) => m.id !== meal.id));
                setSelected(null);
              }}
            />
          ) : (
            <EmptyState emoji="🍽️" title={blank ? undefined : "Pick a meal"} hint={blank ? undefined : "Its dishes show here: a set dish, or one you pick on the day."} />
          )}
        </section>
      </div>

      {guard.leaving ? <LeaveDialog what="some meals" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} /> : null}
    </>
  );
}

/** Renaming a kind of meal (a new one opens this way): picture, name, remove, done. Save still keeps it. */
function KindEditor({
  kind,
  onChange,
  onRemove,
  onDone,
}: {
  kind: Category;
  onChange: (patch: Partial<Category>) => void;
  onRemove: (() => void) | null;
  onDone: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-[var(--radius)] bg-rail p-2 shadow-[inset_0_0_0_2px_var(--color-ink)]">
      <div className="flex items-center gap-2">
        <EmojiPicker
          initial={kind.icon ?? ""}
          fieldName=""
          nameText={kind.name}
          onChange={(icon) => onChange({ icon: icon || null })}
          label={`Picture for ${kind.name || "this one"}`}
          className="size-12! self-center!"
          fullScreen
        />
        <input
          value={kind.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDone();
          }}
          maxLength={40}
          aria-label="Name of this kind of meal"
          placeholder="Name"
          autoFocus
          className="h-12 min-w-0 flex-1 rounded-[var(--radius-small)] border-2 border-frame bg-board px-3 text-[1.5rem] font-extrabold text-ink outline-none focus:border-ink"
        />
      </div>
      <div className="flex items-center gap-2">
        {onRemove ? (
          // Its meals stay, under the other kinds they're in (or under no kind).
          <button type="button" onClick={onRemove} aria-label={`Remove ${kind.name || "this one"} (keeps its meals)`} className="flex min-h-12 items-center gap-1.5 rounded-[var(--radius-small)] px-3 text-lg font-bold text-danger hover:bg-board">
            <Trash size="1.25rem" aria-hidden />
            Remove
          </button>
        ) : (
          <span className="px-1 text-base font-bold text-ink-muted">Leftovers stays</span>
        )}
        <button type="button" onClick={onDone} className="ml-auto flex min-h-12 items-center gap-1.5 rounded-[var(--radius-small)] bg-ink px-4 text-lg font-bold text-board">
          <Check size="1.25rem" weight="bold" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}

function MealEditor({
  meal,
  name,
  categories,
  kinds,
  dishes,
  dishById,
  kindById,
  onChange,
  onRemove,
}: {
  meal: ManagerMeal;
  name: string;
  categories: Category[];
  kinds: Kind[];
  dishes: DishLike[];
  dishById: Map<string, DishLike>;
  kindById: Map<string, Kind>;
  onChange: (f: (m: ManagerMeal) => ManagerMeal) => void;
  onRemove: () => void;
}) {
  const [spotPage, setSpotPage] = useState(0);
  const [choosing, setChoosing] = useState<number | null>(meal.spots.length === 1 && !meal.spots[0].recipeId && meal.id.startsWith("new-") ? 0 : null);
  const [spotsRef, fit] = useFitRows<HTMLUListElement>(SPOTS_PER_PAGE);
  // The list's last row is "Add a spot", so it sits right under the spots.
  const spotsPerPage = Math.max(1, fit - 1);
  const spots = paged(meal.spots.map((s, i) => ({ s, i })), spotPage, spotsPerPage);
  const setSpot = (i: number, changes: Partial<ManagerMeal["spots"][number]>) => onChange((m) => ({ ...m, spots: m.spots.map((s, j) => (j === i ? { ...s, ...changes } : s)) }));

  return (
    <>
      <div className="flex shrink-0 items-center gap-3">
        <EmojiPicker
          initial={meal.icon ?? ""}
          fallback={menuMealIcon(asLike({ ...meal, icon: null }), dishById) ?? "🍽️"}
          fieldName=""
          nameText={name}
          onChange={(e) => onChange((m) => ({ ...m, icon: e || null }))}
          label={`Picture for ${name}`}
          className="size-12! self-center!"
          fullScreen
        />
        {/* The name reads like the card's title; tap it to type. Left blank, the meal goes by its main dish. */}
        <input
          value={meal.name}
          placeholder={name}
          maxLength={80}
          aria-label="Name of this meal"
          onChange={(e) => onChange((m) => ({ ...m, name: e.target.value }))}
          className="h-12 min-w-0 flex-1 rounded-[var(--radius-small)] border-2 border-transparent bg-transparent px-2 text-2xl font-bold text-ink outline-none placeholder:text-ink hover:border-frame focus:border-ink"
        />
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove this meal" className={roundIconClass}>
          <Trash size="1.5rem" aria-hidden />
        </button>
      </div>
      <p className="mt-1 shrink-0 text-[1.25rem] font-bold text-ink-muted">What goes in this meal: a set dish, or one you pick on the day.</p>

      {categories.length ? (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label="Kinds of meal it's in">
          <span className="text-[1.15rem] font-bold text-ink-muted">In</span>
          {categories.slice(0, 12).map((c) => {
            const on = meal.categoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange((m) => ({ ...m, categoryIds: on ? m.categoryIds.filter((x) => x !== c.id) : [...m.categoryIds, c.id] }))}
                className={`flex min-h-12 items-center gap-1.5 rounded-full border-2 px-3 text-base font-bold ${on ? "border-ink bg-rail text-ink" : "border-frame text-ink-soft"}`}
              >
                <Emoji emoji={c.icon} className="size-6" />
                {c.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <ul ref={spotsRef} className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        {spots.items.map(({ s, i }) => {
          const dish = s.recipeId ? dishById.get(s.recipeId) : undefined;
          const kind = s.kindId ? kindById.get(s.kindId) : undefined;
          const what = dish ? dish.name : `any ${kind?.name ?? "dish"}`;
          return (
            <li key={i} className="flex min-h-[4.25rem] shrink-0 items-center gap-[0.65rem] border-b border-frame">
              <span className="w-[6.5rem] shrink-0 truncate pl-3 text-[1.15rem] font-bold text-ink-muted">{kind?.name ?? "Dish"}</span>
              {/* Tap the dish to change it (or to make it one you pick on the day). */}
              <button
                type="button"
                onClick={() => setChoosing(i)}
                aria-label={`Change ${what}`}
                className="flex min-h-[var(--touch-target)] min-w-0 flex-1 items-center gap-[0.65rem] rounded-[var(--radius)] px-1 text-left hover:bg-rail"
              >
                <Emoji emoji={dish?.icon ?? kind?.icon ?? "🍽️"} className="size-[2.15rem]" />
                <span className="min-w-0 truncate text-[1.5rem] font-extrabold text-ink">{what}</span>
              </button>
              <BatchSwitch value={s.batches} onPick={(b) => setSpot(i, { batches: b })} />
              <button
                type="button"
                aria-label="Remove this spot"
                disabled={meal.spots.length <= 1}
                onClick={() => onChange((m) => ({ ...m, spots: m.spots.filter((_, j) => j !== i) }))}
                className={roundIconClass}
              >
                <Trash size="1.5rem" aria-hidden />
              </button>
            </li>
          );
        })}
        <li className="flex min-h-[4.25rem] shrink-0 items-center gap-4">
          <button
            type="button"
            disabled={meal.spots.length >= 20}
            onClick={() => {
              const side = kinds.find((k) => k.name === "Veggie") ?? kinds[0];
              onChange((m) => ({ ...m, spots: [...m.spots, { kindId: side?.id ?? null, recipeId: null, batches: 1 }] }));
              setSpotPage(Math.floor(meal.spots.length / spotsPerPage));
              setChoosing(meal.spots.length);
            }}
            className={secondaryActionClass}
          >
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Add a spot
          </button>
          <Arrows page={spots.page} pages={spots.pages} setPage={setSpotPage} />
        </li>
      </ul>

      {choosing !== null && meal.spots[choosing] ? (
        <DishChooser
          kinds={kinds}
          dishes={dishes}
          startKind={meal.spots[choosing].kindId}
          current={meal.spots[choosing].recipeId}
          onClose={() => setChoosing(null)}
          onPick={(kindId, recipeId) => {
            setSpot(choosing, { kindId, recipeId });
            setChoosing(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Choosing what fills a spot: a dish, or "you pick" from a kind. Covers the editor. */
function DishChooser({
  kinds,
  dishes,
  startKind,
  current,
  onClose,
  onPick,
}: {
  kinds: Kind[];
  dishes: DishLike[];
  startKind: string | null;
  current: string | null;
  onClose: () => void;
  onPick: (kindId: string | null, recipeId: string | null) => void;
}) {
  const [tab, setTab] = useState<string | null>(startKind && kinds.some((k) => k.id === startKind) ? startKind : null);
  const [page, setPage] = useState(0);
  const kind = tab ? kinds.find((k) => k.id === tab) : undefined;
  const list = dishes.filter((d) => tab === null || d.kind_ids.includes(tab));
  const shown = paged(list, page, kind ? DISHES_PER_PAGE : DISHES_PER_PAGE + 1);
  const tile = "flex min-h-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center";

  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-3 rounded-[var(--radius-card)] bg-board px-5 py-4 shadow-[0_0_2rem_rgba(30,35,45,0.18)]" role="dialog" aria-label="Choose a dish">
      <div className="flex shrink-0 items-center gap-2">
        <h3 className="flex-1 text-2xl font-bold text-ink">Choose a dish</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-12 items-center justify-center rounded-full bg-rail text-ink">
          <X size="1.25rem" weight="bold" aria-hidden />
        </button>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {[{ id: null as string | null, name: "Any dish", icon: null as string | null }, ...kinds].map((k) => (
          <button
            key={k.id ?? "any"}
            type="button"
            aria-pressed={tab === k.id}
            onClick={() => {
              setTab(k.id);
              setPage(0);
            }}
            className={`flex min-h-12 items-center gap-1.5 rounded-full px-3.5 text-base font-bold ${tab === k.id ? "bg-ink text-board" : "bg-rail text-ink-soft"}`}
          >
            {k.icon ? <Emoji emoji={k.icon} className="size-6" /> : null}
            {k.name}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-2.5">
        {kind ? (
          <button type="button" onClick={() => onPick(kind.id, null)} className={`${tile} border-dashed border-meal-ink bg-[color-mix(in_srgb,var(--color-meal)_40%,white)]`}>
            <Emoji emoji={kind.icon} className="size-12" />
            <span className="line-clamp-2 text-lg font-bold text-ink">You pick</span>
            <span className="text-sm text-ink-muted">On the day</span>
          </button>
        ) : null}
        {shown.items.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onPick(tab ?? d.kind_ids[0] ?? null, d.id)}
            className={`${tile} ${d.id === current ? "border-meal-ink bg-meal" : "border-frame hover:bg-rail"}`}
          >
            <Emoji emoji={d.icon ?? "🍽️"} className="size-12" />
            <span className="line-clamp-2 text-lg font-bold text-ink">{d.name}</span>
          </button>
        ))}
        {list.length === 0 ? <p className="col-span-full text-lg text-ink-muted">No {kind?.name.toLowerCase() ?? "dishes"} yet</p> : null}
      </div>
      <Arrows page={shown.page} pages={shown.pages} setPage={setPage} />
    </div>
  );
}
