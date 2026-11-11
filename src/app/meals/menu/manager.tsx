"use client";

import { useState } from "react";
import { ArrowsLeftRight, CaretLeft, CaretRight, Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { EmptyState, Emoji, Notice, ScreenHeader, Segmented } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { BATCHES } from "@/lib/meals";
import { menuMealIcon, menuMealName, spotSummary, type DishLike, type MenuMealLike } from "@/lib/menu";
import { saveMenu, type DraftKind, type DraftMenuMeal, type KindChanges, type MenuChanges } from "../menu-actions";
import { MENU_TABS } from "../menu-tabs";

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
const KINDS_PER_PAGE = 9;
const MEALS_PER_PAGE = 7;
const SPOTS_PER_PAGE = 7;
const DISHES_PER_PAGE = 11;

const card = "flex min-h-0 flex-col gap-3 rounded-[var(--radius-card)] border border-frame bg-board px-5 py-4";
const soft = "flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl bg-rail px-4 text-base font-bold text-ink hover:bg-panel";

let counter = 0;
const newId = () => `new-${Date.now().toString(36)}-${counter++}`;

function asLike(m: ManagerMeal): MenuMealLike {
  return { id: m.id, name: m.name, icon: m.icon, category_ids: m.categoryIds, spots: m.spots.map((s, position) => ({ position, kind_id: s.kindId, recipe_id: s.recipeId, batches: s.batches })) };
}

function Arrows({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  if (pages <= 1) return null;
  const arrow = "flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center justify-center gap-3">
      <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className={arrow}>
        <CaretLeft size="1.25rem" weight="bold" aria-hidden />
      </button>
      <span className="min-w-16 text-center text-base font-bold text-ink-muted">
        {page + 1} of {pages}
      </span>
      <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className={arrow}>
        <CaretRight size="1.25rem" weight="bold" aria-hidden />
      </button>
    </div>
  );
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
  const [kindsRef, kindsPerPage] = useFitRows<HTMLUListElement>(KINDS_PER_PAGE);
  const [mealsRef, mealsPerPage] = useFitRows<HTMLUListElement>(MEALS_PER_PAGE);
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
  const meal = draft.find((m) => m.id === selected) ?? null;

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

  return (
    <>
      <ScreenHeader title="Menu Manager">
        <Segmented label="Menu Manager" options={MENU_TABS.map((t) => ({ href: t.href, label: t.label, active: t.tab === "menu" }))} />
        <div className="flex items-center gap-4 lg:ml-auto">
          <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
        </div>
      </ScreenHeader>
      {problem ? <Notice tone="error">{problem}</Notice> : message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,22fr)_minmax(0,30fr)_minmax(0,50fr)]">
        {/* Kinds of meal */}
        <section className={card}>
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">Kinds of meal</h2>
            <button type="button" onClick={addKind} aria-label="Add a kind of meal" className={soft}>
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Kind
            </button>
          </div>
          <ul ref={kindsRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {kindList.items.map((r) =>
              r.id === editingKind ? (
                <li key={r.id} className="flex items-center gap-1">
                  {/* Renaming in place: picture, name and a tick to close it (Save still keeps it). */}
                  <div className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 border-meal-ink bg-meal px-2">
                    <EmojiPicker
                      initial={r.icon ?? ""}
                      fieldName=""
                      nameText={r.name}
                      onChange={(icon) => changeKind(r.id, { icon: icon || null })}
                      label={`Picture for ${r.name || "this kind of meal"}`}
                      className="size-11! self-center!"
                      fullScreen
                    />
                    <input
                      value={r.name}
                      onChange={(e) => changeKind(r.id, { name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingKind(null);
                      }}
                      maxLength={40}
                      placeholder="Like Tacos"
                      aria-label="Name"
                      autoFocus
                      className="h-11 min-w-0 flex-1 border-b-2 border-meal-ink/50 bg-transparent px-1 text-xl font-bold text-ink outline-none focus:border-meal-ink"
                    />
                    {r.count !== null ? <span className="text-base text-ink-muted">{r.count}</span> : null}
                  </div>
                  {r.isLeftovers ? null : (
                    <button type="button" onClick={() => removeKind(r.id)} aria-label={`Remove ${r.name || "this kind"} (keeps its meals)`} className="flex size-12 shrink-0 items-center justify-center rounded-full text-danger hover:bg-rail">
                      <Trash size="1.25rem" aria-hidden />
                    </button>
                  )}
                  <button type="button" onClick={() => setEditingKind(null)} aria-label="Done" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rail text-ink">
                    <Check size="1.375rem" weight="bold" aria-hidden />
                  </button>
                </li>
              ) : (
                <li key={r.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(r.id);
                      setMealPage(0);
                      setEditingKind(null);
                    }}
                    aria-pressed={r.id === pickedRow.id}
                    className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 px-3 text-left ${r.id === pickedRow.id ? "border-meal-ink bg-meal" : "border-transparent hover:bg-rail"} ${r.active ? "" : "opacity-55"}`}
                  >
                    <Emoji emoji={r.icon} className="size-9" />
                    <span className={`min-w-0 flex-1 truncate text-xl font-bold ${r.name ? "text-ink" : "text-ink-muted"}`}>{r.name || "No name yet"}</span>
                    <span className="text-base text-ink-muted">{r.count ?? "Blank"}</span>
                  </button>
                  {r.id === pickedRow.id && r.id !== ALL && r.id !== NONE ? (
                    <button type="button" onClick={() => setEditingKind(r.id)} aria-label={`Rename ${r.name}`} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rail text-ink">
                      <PencilSimple size="1.25rem" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
          <Arrows page={kindList.page} pages={kindList.pages} setPage={setKindPage} />
          <p className="shrink-0 text-base text-ink-muted">Tap a kind to see its meals.</p>
        </section>

        {/* That kind's meals */}
        <section className={card}>
          <div className="flex shrink-0 items-center gap-2">
            <Emoji emoji={pickedRow.icon} className="size-9" />
            <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">{pickedRow.name}</h2>
            {blank ? null : (
              <button type="button" onClick={addMeal} className={soft}>
                <Plus size="1.25rem" weight="bold" aria-hidden />
                New meal
              </button>
            )}
          </div>
          {blank ? (
            <p className="text-lg text-ink-muted">
              {pickedRow.name || "Leftovers"} is a blank, not a kind of meal. Put it in the weekly review on a night with no cooking: it has no dishes, no cooking mode, no heads-ups, and adds nothing to the grocery list.
            </p>
          ) : null}
          <ul ref={mealsRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {mealList.items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelected(m.id)}
                  aria-pressed={m.id === selected}
                  className={`flex min-h-[4.25rem] w-full items-center gap-3 rounded-2xl border-2 px-3 text-left ${m.id === selected ? "border-meal-ink bg-meal" : "border-transparent bg-rail hover:bg-panel"}`}
                >
                  <Emoji emoji={menuMealIcon(asLike(m), dishById) ?? "🍽️"} className="size-11" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xl font-bold text-ink">{nameOf(m)}</span>
                    <span className="truncate text-base text-ink-muted">{spotSummary(asLike(m))}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && !blank ? <li className="text-lg text-ink-muted">No meals here yet. Tap New meal to make one.</li> : null}
          </ul>
          <Arrows page={mealList.page} pages={mealList.pages} setPage={setMealPage} />
        </section>

        {/* The chosen meal */}
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
            <EmptyState emoji="🍽️" title="Pick a meal to change its dishes" />
          )}
        </section>
      </div>

      {guard.leaving ? <LeaveDialog what="some meals" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} /> : null}
    </>
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
  const [spotsRef, spotsPerPage] = useFitRows<HTMLUListElement>(SPOTS_PER_PAGE);
  const spots = paged(meal.spots.map((s, i) => ({ s, i })), spotPage, spotsPerPage);
  const setSpot = (i: number, changes: Partial<ManagerMeal["spots"][number]>) => onChange((m) => ({ ...m, spots: m.spots.map((s, j) => (j === i ? { ...s, ...changes } : s)) }));

  return (
    <>
      <div className="flex shrink-0 items-end gap-4">
        <EmojiPicker
          initial={meal.icon ?? ""}
          fallback={menuMealIcon(asLike({ ...meal, icon: null }), dishById) ?? "🍽️"}
          fieldName=""
          nameText={name}
          onChange={(e) => onChange((m) => ({ ...m, icon: e || null }))}
          label={`Picture for ${name}`}
          className="size-16! self-center!"
          fullScreen
        />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Name</span>
          <input
            value={meal.name}
            maxLength={80}
            placeholder={`Blank: called ${name}`}
            onChange={(e) => onChange((m) => ({ ...m, name: e.target.value }))}
            className="h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-xl text-ink outline-none focus:border-accent"
          />
        </label>
        <button type="button" onClick={onRemove} className="flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl px-3 text-base font-bold text-danger hover:bg-rail">
          <Trash size="1.25rem" aria-hidden />
          Delete meal
        </button>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Shows under</span>
        <div className="flex flex-wrap gap-2">
          {categories.slice(0, 12).map((c) => {
            const on = meal.categoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange((m) => ({ ...m, categoryIds: on ? m.categoryIds.filter((x) => x !== c.id) : [...m.categoryIds, c.id] }))}
                className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-base ${on ? "border-ink bg-rail font-bold text-ink" : "border-frame text-ink-soft"}`}
              >
                <Emoji emoji={c.icon} className="size-6" />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-frame pt-3">
        <h3 className="flex-1 text-xl font-bold text-ink">Dishes</h3>
        <button
          type="button"
          disabled={meal.spots.length >= 20}
          onClick={() => {
            const side = kinds.find((k) => k.name === "Veggie") ?? kinds[0];
            onChange((m) => ({ ...m, spots: [...m.spots, { kindId: side?.id ?? null, recipeId: null, batches: 1 }] }));
            setSpotPage(Math.floor(meal.spots.length / spotsPerPage));
            setChoosing(meal.spots.length);
          }}
          className={soft}
        >
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Dish
        </button>
      </div>
      <ul ref={spotsRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {spots.items.map(({ s, i }) => {
          const dish = s.recipeId ? dishById.get(s.recipeId) : undefined;
          const kind = s.kindId ? kindById.get(s.kindId) : undefined;
          return (
            <li key={i} className="flex min-h-16 items-center gap-3 rounded-2xl bg-rail px-3">
              <Emoji emoji={dish?.icon ?? kind?.icon ?? "🍽️"} className="size-10" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xl font-bold text-ink">{dish ? dish.name : `Any ${kind?.name.toLowerCase() ?? "dish"}`}</span>
                <span className="truncate text-sm font-bold tracking-wide text-ink-muted uppercase">{dish ? (kind?.name ?? "Dish") : "Picked on the day"}</span>
              </span>
              <span className="flex shrink-0 gap-1 rounded-xl bg-board p-1" role="group" aria-label="Batches">
                {BATCHES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={s.batches === b}
                    onClick={() => setSpot(i, { batches: b })}
                    className={`flex size-11 items-center justify-center rounded-lg text-base font-bold ${s.batches === b ? "bg-ink text-board" : "text-ink-soft"}`}
                  >
                    ×{b}
                  </button>
                ))}
              </span>
              <button type="button" onClick={() => setChoosing(i)} className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-board px-3 text-base font-bold text-ink">
                <ArrowsLeftRight size="1.125rem" aria-hidden />
                Change
              </button>
              <button
                type="button"
                aria-label="Take this dish off"
                disabled={meal.spots.length <= 1}
                onClick={() => onChange((m) => ({ ...m, spots: m.spots.filter((_, j) => j !== i) }))}
                className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-board disabled:opacity-30"
              >
                <X size="1.125rem" weight="bold" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <Arrows page={spots.page} pages={spots.pages} setPage={setSpotPage} />

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
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-base font-bold ${tab === k.id ? "bg-ink text-board" : "bg-rail text-ink-soft"}`}
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
            <span className="text-sm text-ink-muted">Any {kind.name.toLowerCase()}, on the day</span>
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
        {list.length === 0 ? <p className="col-span-full text-lg text-ink-muted">No dishes of this kind yet. Add them in the Dishes tab.</p> : null}
      </div>
      <Arrows page={shown.page} pages={shown.pages} setPage={setPage} />
    </div>
  );
}
