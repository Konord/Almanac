"use client";

import { blocksOn, storedEaters } from "@/lib/meal-blocks";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Broom, CalendarDots, CaretLeft, CaretRight, ShoppingCart, Suitcase } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { eventEmoji } from "@/lib/emoji";
import { mainDish } from "@/lib/menu";
import { addDays } from "@/lib/time";
import { newId } from "@/lib/ids";
import { useFitRows } from "@/components/use-fit-rows";
import {
  addChoreDay,
  applyFix,
  delayChore,
  dismiss,
  kindGroups,
  mealsIn,
  moveChoreDay,
  reviewProblems,
  setDayType,
  setMeal,
  takeOffChoreDay,
  type DraftMeal,
  type KindGroup,
  type ReviewDraft,
} from "@/lib/weekly-review";
import { saveReview } from "./actions";
import { ChecksMenu, KindBox, PickerBox, type KindChoice, type Picker } from "./boxes";
import type { ReviewColumn, ReviewData } from "./data";
import { ChoreColumn, choresOnDay, useChorePlan, type PlannedChore } from "./chores-view";
import { GrocerySheet } from "./grocery-sheet";
import { MealBox, type MealTarget } from "./meal-box";
import { Face, SectionTitle, type Person } from "./parts";

/**
 * The Planner, where the coming week is planned. It looks like the Week
 * calendar without times: seven days side by side, each one a column of
 * Day (kinds of day), Meals, Chores and Plans, each with its own + (Connor's
 * sketch, 2026-11-12). Tapping a meal tile opens the meal picker; + beside
 * Plans opens the calendar's "Add an event" card on that day. One Save in
 * the header keeps it all; the grocery list beside it is live.
 */
export function ReviewBoard({
  data,
  range,
  weekHref,
  openMeal = null,
  eventError = null,
}: {
  data: ReviewData;
  range: string;
  weekHref: { prev: string; next: string; coming: string; isComing: boolean };
  /** A meal to open the picker on straight away. */
  openMeal?: { id: string; date: string; mealTimeId: string } | null;
  /** Why adding an event didn't work, if it didn't. */
  eventError?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ReviewDraft>(data.initial);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [mealAt, setMealAt] = useState<{ mealId: string | null; date: string; mealTimeId: string } | null>(
    openMeal && data.meals.some((m) => m.id === openMeal.id) ? { mealId: openMeal.id, date: openMeal.date, mealTimeId: openMeal.mealTimeId } : null,
  );
  const [kindAt, setKindAt] = useState<{ date: string; start: string | null } | null>(null);
  const [groceries, setGroceries] = useState(false);
  /** The week (Day, Meals, Chores, Plans) or the chore view (each chore day with its chores). */
  const [view, setView] = useState<"week" | "chores">("week");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(eventError);
  const [goTo, setGoTo] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.initial);
  const guard = useUnsavedChanges(dirty, () => setDraft(data.initial));

  const members: Person[] = data.members;
  const person = new Map(members.map((m) => [m.id, m]));
  const memberOrder = members.map((m) => m.id);
  const choreDay = new Map(data.choreDays.map((d) => [d.id, d]));
  const freeDay = data.choreDays.find((d) => d.is_free);
  const dayType = new Map(data.dayTypes.map((t) => [t.id, t]));
  const category = new Map(data.categories.map((c) => [c.id, c]));
  const dish = new Map(data.dishes.map((r) => [r.id, r]));
  const menuMeal = new Map(data.menuMeals.map((m) => [m.id, m]));
  const open = data.columns.filter((c) => !c.past);

  /** Every kind of day by name, with each person's own version of it. */
  const kinds: KindChoice[] = [];
  for (const t of data.dayTypes) {
    const key = t.name.trim().toLowerCase();
    let k = kinds.find((x) => x.key === key);
    if (!k) kinds.push((k = { key, name: t.name, icon: t.icon, typeOf: {} }));
    if (!(t.member_id in k.typeOf)) k.typeOf[t.member_id] = t.id;
  }

  const change = (f: (d: ReviewDraft) => ReviewDraft) => {
    setError(null);
    setDraft(f);
    setPicker(null);
  };

  const problems = reviewProblems({
    draft,
    days: data.columns,
    choreDays: data.choreDays,
    categoryNames: Object.fromEntries(data.categories.map((c) => [c.id, c.name])),
    hardChores: data.hardChores,
  });

  const save = async (then?: string | null) => {
    setSaving(true);
    const result = await saveReview(data.week, draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      setGoTo(null);
      return;
    }
    guard.saved(then ?? goTo);
    setGoTo(null);
  };
  /** Another week: ask first when there are changes (the menu's links ask by themselves). */
  const go = (href: string) => (dirty ? setGoTo(href) : router.push(href));

  // --- How things look ------------------------------------------------------

  /**
   * A meal tile shows one name (Connor, 2026-11-12): the main dish if one is
   * picked ("Beef tacos"), else the kind of meal ("Tacos"), else the meal
   * block ("Lunch"). No sides or notes.
   */
  const mealLook = (m: DraftMeal, blockName: string) => {
    const mm = m.menuMealId ? menuMeal.get(m.menuMealId) : undefined;
    const main = mainDish(m.dishes);
    const r = main ? dish.get(main) : undefined;
    const c = m.categoryId ? category.get(m.categoryId) : undefined;
    return {
      title: r?.name ?? c?.name ?? mm?.name ?? m.name ?? blockName,
      // Nothing picked yet: the tile stays dashed (Connor, 2026-11-12).
      picked: Boolean(r || c || mm),
      icon: r?.icon ?? c?.icon ?? mm?.icon ?? "🍽️",
    };
  };
  const mealChanged = (id: string) => id in draft.meals;
  const groupsOn = (date: string): KindGroup[] => kindGroups(draft.dayTypes[date] ?? {}, memberOrder, dayType);
  const kindChanged = (date: string, g: KindGroup) => g.memberIds.some((id) => (data.initial.dayTypes[date]?.[id] ?? "") !== (draft.dayTypes[date]?.[id] ?? ""));
  const choresOn = (date: string) => draft.choreDays[date] ?? [];
  const choreChanged = (date: string, id: string) => !(data.initial.choreDays[date] ?? []).includes(id);

  // --- What tapping things offers --------------------------------------------

  const pickChoreDay = (col: ReviewColumn, id: string) => {
    const cd = choreDay.get(id);
    if (!cd) return;
    setPicker({
      title: `${cd.name} on ${col.name}`,
      options: [
        ...open
          .filter((c) => c.date !== col.date && !choresOn(c.date).includes(id))
          .map((c) => ({ key: c.date, label: `Move to ${c.label}`, icon: cd.icon, pick: () => change((d) => moveChoreDay(d, id, col.date, c.date)) })),
        // Swap places with a chore day on another day (Laundry here, Kitchen there).
        ...open
          .filter((c) => c.date !== col.date && !choresOn(c.date).includes(id))
          .flatMap((c) =>
            choresOn(c.date)
              .filter((other) => !choresOn(col.date).includes(other))
              .map((other) => ({
                key: `swap-${c.date}-${other}`,
                label: `Swap: ${choreDay.get(other)?.name ?? "it"} ${c.label.split(" ")[0]}`,
                icon: choreDay.get(other)?.icon,
                pick: () => change((d) => moveChoreDay(moveChoreDay(d, id, col.date, c.date), other, c.date, col.date)),
              })),
          ),
        { key: "off", label: `Take off ${col.name}`, danger: true, pick: () => change((d) => takeOffChoreDay(d, col.date, id)) },
      ],
    });
  };

  // --- The chore view ---------------------------------------------------------

  const chorePlan = useChorePlan(data, draft);
  const planned = (col: ReviewColumn) => {
    const day = chorePlan.get(col.date);
    return day ? choresOnDay(day, data, draft) : null;
  };

  /** Tapping a chore: a regular one moves with its chore day; others can be put off a day or more. */
  const pickChore = (col: ReviewColumn, c: PlannedChore) => {
    if (c.kind === "preset") return pickChoreDay(col, c.choreDayId);
    const later = open.filter((x) => x.date > col.date);
    const delayed = draft.choreDelays?.[c.id];
    const kind = c.kind;
    setPicker({
      title: c.name,
      options: [
        ...later.map((x) => ({ key: x.date, label: `Put off to ${x.label}`, icon: c.icon, pick: () => change((d) => delayChore(d, c.id, { kind, date: x.date })) })),
        { key: "next", label: "Next week", icon: "⏭️", pick: () => change((d) => delayChore(d, c.id, { kind, date: addDays(data.week, 7) })) },
        ...(delayed ? [{ key: "back", label: "Put back", icon: "↩️", pick: () => change((d) => delayChore(d, c.id, null)) }] : []),
      ],
    });
  };

  /** Everything on a day, when its column can't show it all. */
  const pickFromDay = (col: ReviewColumn) => {
    const groups = planned(col) ?? [];
    setPicker({
      title: `Chores on ${col.name}`,
      options: groups.flatMap((g) =>
        g.chores.map((c) => ({ key: `${g.tile.id}-${c.id}`, label: c.name, icon: c.icon, pick: () => pickChore(col, c) })),
      ),
    });
  };

  /**
   * The + beside Meals adds a new meal tile on the day, named there and then
   * ("Snack"), Connor 2026-11-12. It sits in the day's last meal block for
   * its time (drag it on the calendar to move it); tap it to pick the meal.
   */
  const [naming, setNaming] = useState<string | null>(null);
  const addMeal = (col: ReviewColumn) => {
    const slots = slotsOn(col.date);
    const time = slots.at(-1)?.time ?? data.mealTimes.at(-1);
    if (!time) return;
    const eaters = blocksOn(data.mealTimeUses, draft.dayTypes[col.date] ?? {}).get(time.id) ?? [];
    const meal: DraftMeal = {
      id: `new-${newId()}`,
      date: col.date,
      mealTimeId: time.id,
      categoryId: null,
      menuMealId: null,
      dishes: [],
      memberIds: storedEaters(eaters, data.members.map((m) => m.id)),
      name: "",
    };
    change((d) => setMeal(d, meal.id, meal));
    setNaming(meal.id);
  };
  /** Done naming a new tile: keep the name, or take the tile off if it has none. */
  const nameMeal = (m: DraftMeal, name: string) => {
    setNaming(null);
    const clean = name.trim().slice(0, 60);
    change((d) => setMeal(d, m.id, clean ? { ...m, name: clean } : null));
  };

  const addChore = (col: ReviewColumn) =>
    setPicker({
      title: `Add a chore day on ${col.name}`,
      options: data.choreDays
        .filter((cd) => !cd.is_free && !choresOn(col.date).includes(cd.id))
        .map((cd) => ({ key: cd.id, label: cd.name, icon: cd.icon, pick: () => change((d) => addChoreDay(d, col.date, cd.id)) })),
    });

  /**
   * A day's meal tiles: each meal block someone has that day (from their
   * kind of day, as changed in this review), plus any block that already
   * has meals planned.
   */
  const slotsOn = (date: string) => {
    const on = blocksOn(data.mealTimeUses, draft.dayTypes[date] ?? {});
    return data.mealTimes
      .map((t) => ({ time: t, meals: mealsIn(data.meals, draft, date, t.id) }))
      .filter((slot) => on.has(slot.time.id) || slot.meals.length > 0);
  };

  // The meal picker follows the draft, so it shows each change as it's made.
  const mealTarget: MealTarget | null = (() => {
    if (!mealAt) return null;
    const col = data.columns.find((c) => c.date === mealAt.date);
    const time = data.mealTimes.find((t) => t.id === mealAt.mealTimeId);
    const meal = mealAt.mealId ? (mealsIn(data.meals, draft, mealAt.date, mealAt.mealTimeId).find((m) => m.id === mealAt.mealId) ?? null) : null;
    const eaters = blocksOn(data.mealTimeUses, draft.dayTypes[mealAt.date] ?? {}).get(mealAt.mealTimeId) ?? [];
    return {
      meal,
      date: mealAt.date,
      mealTimeId: mealAt.mealTimeId,
      where: `${meal?.name || time?.name || "Meal"} · ${col?.label ?? ""}`,
      eaters: storedEaters(eaters, data.members.map((m) => m.id)),
    };
  })();

  // --- The screen ------------------------------------------------------------

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 lg:h-18 lg:flex-nowrap">
        <h1 className="text-3xl font-extrabold tracking-[-0.03rem] text-ink lg:text-5xl">Planner</h1>
        <div className="flex items-center gap-1 rounded-2xl bg-panel p-1.25">
          <WeekButton label="Week before" onClick={() => go(weekHref.prev)} icon="prev" />
          <span className="px-2 text-lg font-bold whitespace-nowrap text-ink">{range}</span>
          <WeekButton label="Week after" onClick={() => go(weekHref.next)} icon="next" />
        </div>
        {weekHref.isComing ? null : (
          <button type="button" onClick={() => go(weekHref.coming)} className="flex min-h-[var(--touch-target)] items-center rounded-2xl px-3 text-base font-bold whitespace-nowrap text-accent">
            The coming week
          </button>
        )}
        <div className="flex min-w-0 flex-1">
          <ChecksMenu problems={problems} onFix={(p) => p.fix && change((d) => applyFix(d, p.fix!.apply))} onLeave={(p) => change((d) => dismiss(d, p.id))} />
        </div>
        <div className="flex items-center gap-1 rounded-2xl bg-panel p-1.25" role="group" aria-label="Show">
          <ViewButton on={view === "week"} onClick={() => setView("week")} icon={<CalendarDots size="1.5rem" weight="bold" aria-hidden />} label="Week" />
          <ViewButton on={view === "chores"} onClick={() => setView("chores")} icon={<Broom size="1.5rem" weight="bold" aria-hidden />} label="Chores" />
        </div>
        <button type="button" onClick={() => setGroceries(true)} className="flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-2xl bg-meal px-5 text-lg font-bold whitespace-nowrap text-meal-ink">
          <ShoppingCart size="1.625rem" weight="bold" aria-hidden />
          Grocery list
        </button>
        <SaveButton
          dirty={dirty}
          saving={saving}
          error={error}
          onSave={() => save()}
          onUndo={() => {
            setDraft(data.initial);
            setError(null);
          }}
        />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 border-t border-grid sm:grid-cols-4 lg:grid-cols-7">
        {data.columns.map((col, i) => {
          const groups = groupsOn(col.date);
          const chores = choresOn(col.date);
          const slots = slotsOn(col.date);
          // A block whose only meals are named extras ("Snack") still shows its own tile.
          const tiles = slots.reduce((n, s) => n + s.meals.length + (s.meals.some((m) => !m.name) ? 0 : 1), 0);
          // Three tiles or fewer get the big look (picture over the name); more sit in rows.
          const big = tiles <= 3;
          const can = !col.past;
          return (
            <section
              key={col.date}
              aria-label={col.name}
              className={`relative flex min-h-0 min-w-0 flex-col gap-1 px-2.5 pt-3 pb-2.5 ${i > 0 ? "border-l border-grid" : ""} ${col.past ? "bg-rail" : ""}`}
            >
              <div className={`flex h-11 shrink-0 items-center gap-2.5 px-1 ${col.past ? "opacity-50" : ""}`}>
                <h2 className="truncate text-[1.75rem] text-ink">
                  <span className="font-extrabold">{col.label.split(" ")[0]}</span> <span className="font-medium text-ink-soft">{col.label.split(" ").slice(1).join(" ")}</span>
                </h2>
                {col.away ? <Badge /> : null}
              </div>

              {view === "chores" ? (
                <div className={`flex min-h-0 flex-1 flex-col ${col.past ? "opacity-50" : ""}`}>
                  {(() => {
                    const groups = planned(col);
                    return (
                      <ChoreColumn
                        col={col}
                        groups={
                          groups ??
                          (chores.length > 0 ? chores : freeDay ? [freeDay.id] : [])
                            .map((id) => choreDay.get(id))
                            .filter((cd) => cd !== undefined)
                            .map((tile) => ({ tile, chores: [] }))
                        }
                        changedTile={(id) => id !== freeDay?.id && choreChanged(col.date, id)}
                        onTile={(id) => pickChoreDay(col, id)}
                        onChore={(c) => pickChore(col, c)}
                        onMore={() => pickFromDay(col)}
                        note={groups ? undefined : col.past ? undefined : "Too far ahead to plan yet"}
                      />
                    );
                  })()}
                </div>
              ) : (
              <div className={`flex min-h-0 flex-1 flex-col gap-1 ${col.past ? "opacity-50" : ""}`}>
                {/* Day: each kind of day once, with who has it. */}
                <SectionTitle title="Day" onAdd={can ? () => setKindAt({ date: col.date, start: null }) : undefined} addLabel={`Add a day on ${col.name}`} />
                <div className="flex shrink-0 flex-col gap-1.5">
                  {groups.map((g) => (
                    <Row key={g.key} changed={kindChanged(col.date, g)} onClick={can ? () => setKindAt({ date: col.date, start: g.key }) : undefined}>
                      <Emoji emoji={g.icon ?? "📅"} className="size-7" />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <span className="flex shrink-0">
                        {g.memberIds.map((id) => (
                          <span key={id} className="-ml-1.5 first:ml-0">
                            <Face person={person.get(id)} size="size-6 text-[0.6875rem]" />
                          </span>
                        ))}
                      </span>
                    </Row>
                  ))}
                </div>

                {/* Meals: one tile per meal block; dashed only while nothing is picked. */}
                <SectionTitle title="Meals" onAdd={can ? () => addMeal(col) : undefined} addLabel={`Add a meal on ${col.name}`} />
                <div className="flex min-h-0 shrink flex-col gap-1.5">
                  {slots.flatMap(({ time, meals }) => [
                    ...(meals.some((m) => !m.name)
                      ? []
                      : [
                          <button
                            key={time.id}
                            type="button"
                            disabled={!can}
                            onClick={() => setMealAt({ mealId: null, date: col.date, mealTimeId: time.id })}
                            className={`flex min-h-12 min-w-0 shrink rounded-[1.375rem] border-2 border-dashed border-[color-mix(in_srgb,var(--color-meal-ink)_32%,var(--color-meal))] px-2.5 font-extrabold text-[color-mix(in_srgb,var(--color-meal-ink)_72%,white)] ${
                              big ? "basis-[8.5rem] flex-col items-center justify-center gap-1 text-center text-xl" : "basis-[4rem] items-center gap-2.5 text-left text-lg"
                            }`}
                          >
                            <Emoji emoji={time.icon ?? "🍽️"} className={`${big ? "size-14" : "size-9"} opacity-60`} />
                            <span className="min-w-0 truncate">{time.name}</span>
                          </button>,
                        ]),
                    ...meals.map((m) => {
                          const look = mealLook(m, time.name);
                          if (naming === m.id)
                            return (
                              <NameTile key={m.id} big={big} onDone={(name) => nameMeal(m, name)} />
                            );
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={!can}
                              onClick={() => setMealAt({ mealId: m.id, date: col.date, mealTimeId: time.id })}
                              title={`${time.name}: ${look.title}`}
                              className={`relative flex min-h-12 min-w-0 shrink rounded-[1.375rem] border-2 px-2.5 font-extrabold ${look.picked ? "bg-meal text-meal-ink" : ""} ${
                                big ? "basis-[8.5rem] flex-col items-center justify-center gap-1 text-center text-xl" : "basis-[4rem] items-center gap-2.5 text-left text-lg"
                              } ${
                                !look.picked
                                  ? `border-dashed ${mealChanged(m.id) ? "border-accent" : "border-[color-mix(in_srgb,var(--color-meal-ink)_32%,var(--color-meal))]"} text-[color-mix(in_srgb,var(--color-meal-ink)_72%,white)]`
                                  : mealChanged(m.id)
                                    ? "border-accent"
                                    : "border-[color-mix(in_srgb,var(--color-meal-ink)_16%,var(--color-meal))]"
                              }`}
                            >
                              {m.memberIds.length > 0 ? (
                                <span className={`flex ${big ? "absolute top-2 right-2" : "order-last ml-auto"}`}>
                                  {m.memberIds.map((id) => (
                                    <span key={id} className="-ml-1.5 first:ml-0">
                                      <Face person={person.get(id)} size="size-6 text-[0.6875rem]" />
                                    </span>
                                  ))}
                                </span>
                              ) : null}
                              <Emoji emoji={look.icon} className={big ? "size-14" : "size-9"} />
                              <span className={`min-w-0 leading-tight ${big ? "line-clamp-2" : "truncate"}`}>{look.title}</span>
                            </button>
                          );
                        }),
                  ])}
                </div>

                {/* Chores: the chore days on this day. */}
                <SectionTitle title="Chores" onAdd={can ? () => addChore(col) : undefined} addLabel={`Add a chore day on ${col.name}`} />
                <div className="flex shrink-0 flex-col gap-1.5">
                  {chores.length === 0 ? (
                    <Row muted>
                      <Emoji emoji={col.away ? "🧳" : (freeDay?.icon ?? "🌿")} className="size-7" />
                      <span className="min-w-0 truncate">{col.away ? "Away" : (freeDay?.name ?? "Free day")}</span>
                    </Row>
                  ) : (
                    chores.map((id) => (
                      <Row key={id} changed={choreChanged(col.date, id)} onClick={can ? () => pickChoreDay(col, id) : undefined}>
                        <Emoji emoji={choreDay.get(id)?.icon ?? "🧹"} className="size-7" />
                        <span className="min-w-0 truncate">{choreDay.get(id)?.name}</span>
                      </Row>
                    ))
                  )}
                </div>

                {/* Plans: the day's events by picture and name; + adds one on this day. */}
                <SectionTitle title="Plans" onAdd={can ? () => router.push(`/review?week=${data.week}&add=${col.date}&allday=1`) : undefined} addLabel={`Add an event on ${col.name}`} />
                <Plans plans={col.events} moreHref={`/calendar?view=week&date=${col.date}`} />
              </div>
              )}
            </section>
          );
        })}
      </div>

      {mealTarget ? (
        <MealBox
          target={mealTarget}
          data={data}
          members={members}
          onChange={(meal) => {
            change((d) => setMeal(d, meal.id, meal));
            setMealAt((at) => (at ? { ...at, mealId: meal.id } : at));
          }}
          onRemove={(id) => change((d) => setMeal(d, id, null))}
          onAddAnother={() => setMealAt((at) => (at ? { ...at, mealId: null } : at))}
          onClose={() => setMealAt(null)}
        />
      ) : null}
      {kindAt
        ? (() => {
            const col = data.columns.find((c) => c.date === kindAt.date)!;
            const current = Object.fromEntries(
              memberOrder.map((id) => [id, dayType.get(draft.dayTypes[col.date]?.[id] ?? "")?.name.trim().toLowerCase() ?? ""]),
            );
            return (
              <KindBox
                dayName={col.name}
                kinds={kinds}
                start={kindAt.start}
                members={members}
                current={current}
                onApply={(moves) => {
                  change((d) => moves.reduce((acc, m) => setDayType(acc, col.date, m.memberId, m.typeId), d));
                  setKindAt(null);
                }}
                onClose={() => setKindAt(null)}
              />
            );
          })()
        : null}
      {picker ? <PickerBox picker={picker} onClose={() => setPicker(null)} /> : null}
      {groceries ? <GrocerySheet dirty={dirty} onClose={() => setGroceries(false)} /> : null}
      {guard.leaving || goTo ? (
        <LeaveDialog
          what="this week"
          saving={saving}
          onSave={() => save(guard.leaving ?? goTo)}
          onStay={() => {
            guard.stay();
            setGoTo(null);
          }}
          onLeave={() => {
            if (goTo) {
              const to = goTo;
              setGoTo(null);
              setDraft(data.initial);
              router.push(to);
            } else guard.leaveWithoutSaving();
          }}
        />
      ) : null}
    </>
  );
}

/** A day's plans: as many as fit, then "+ N more" (to the calendar). */
function Plans({ plans, moreHref }: { plans: ReviewColumn["events"]; moreHref: string }) {
  const [ref, fit] = useFitRows<HTMLUListElement>(4);
  const shown = plans.length > fit ? plans.slice(0, Math.max(0, fit - 1)) : plans;
  return (
    <ul ref={ref} className="flex min-h-[7.5rem] flex-1 flex-col gap-0.5 overflow-hidden">
      {shown.map((e) => (
        <li key={e.id} className="flex min-h-9 min-w-0 shrink-0 items-center gap-2 px-1 text-base font-bold text-ink">
          <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-6" />
          <span className="min-w-0 truncate">{e.title}</span>
        </li>
      ))}
      {plans.length > shown.length ? (
        <li className="flex min-h-9 shrink-0 items-center px-1">
          <Link href={moreHref} className="text-sm font-bold text-accent">
            + {plans.length - shown.length} more
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

function Row({ children, onClick, changed = false, muted = false }: { children: ReactNode; onClick?: () => void; changed?: boolean; muted?: boolean }) {
  const className = `flex min-h-11 w-full min-w-0 shrink-0 items-center gap-2 rounded-[0.875rem] border-2 bg-rail px-2 text-left text-base font-extrabold ${
    changed ? "border-accent" : "border-transparent"
  } ${muted ? "font-bold text-ink-muted" : "text-ink"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:bg-panel`}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

/** A new meal tile being named: type its name, then Done (or Enter). */
function NameTile({ big, onDone }: { big: boolean; onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name);
      }}
      className={`flex min-h-12 min-w-0 shrink flex-col justify-center gap-1.5 rounded-[1.375rem] border-2 border-dashed border-accent p-2 ${big ? "basis-[8.5rem]" : "basis-[4rem]"}`}
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => onDone(name)}
        placeholder="Name it"
        aria-label="Meal name"
        className="min-h-11 w-full min-w-0 rounded-xl border-2 border-frame bg-board px-2.5 text-lg font-extrabold text-ink outline-none focus:border-accent"
      />
    </form>
  );
}

function ViewButton({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-xl px-3.5 text-lg font-bold whitespace-nowrap ${on ? "bg-board text-ink shadow-sm" : "text-ink-soft hover:bg-board"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function WeekButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: "prev" | "next" }) {
  const Icon = icon === "prev" ? CaretLeft : CaretRight;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-[var(--touch-target)] items-center justify-center rounded-xl text-ink hover:bg-board">
      <Icon size="1.5rem" weight="bold" aria-hidden />
    </button>
  );
}

/** "Away" on a day of a break marked away. */
function Badge() {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-panel px-1.5 py-0.5 text-xs font-bold text-ink-soft">
      <Suitcase size="0.875rem" aria-hidden />
      Away
    </span>
  );
}
