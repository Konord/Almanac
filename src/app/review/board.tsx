"use client";

import { blocksOn, storedEaters } from "@/lib/meal-blocks";
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, Suitcase } from "@phosphor-icons/react";
import { Emoji, ScreenHeader, segItemClass, segTrackClass } from "@/components/ui";
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
import { previewGroceries, saveReview } from "./actions";
import { BuySheet } from "./buy-sheet";
import type { PreviewLine } from "../groceries/build";
import { soft, strong } from "@/lib/colours";
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

  /**
   * Save first shows "Review what to buy" when the week's meals would put
   * anything on the grocery list (Connor, Nov 15 2026); its "Put the rest
   * on the grocery list" saves. A week with nothing to buy saves straight away.
   */
  const [buy, setBuy] = useState<{ lines: PreviewLine[]; then: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const startSave = async (then?: string | null) => {
    setChecking(true);
    setError(null);
    const result = await previewGroceries(data.week, draft);
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      setGoTo(null);
      return;
    }
    if (result.lines.length === 0) return save(then);
    setBuy({ lines: result.lines, then: then ?? null });
  };
  const save = async (then?: string | null, skipped: string[] = []) => {
    setSaving(true);
    const result = await saveReview(data.week, draft, skipped);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      // On the review sheet the problem shows there; leaving waits.
      if (!buy) {
        guard.stay();
        setGoTo(null);
      }
      return;
    }
    setBuy(null);
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
      <ScreenHeader
        title="Planner"
        // No "Coming week" or date range: the days are right below (Connor, 2026-11-16).
        // The checks sit in the middle, in the same quiet type the title's second line used.
        middle={
          <>
            {weekHref.isComing ? null : (
              <button type="button" onClick={() => go(weekHref.coming)} className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-3 text-2xl font-bold whitespace-nowrap text-accent lg:text-[2rem]">
                The coming week
              </button>
            )}
            <div className="flex min-w-0">
              <ChecksMenu problems={problems} onFix={(p) => p.fix && change((d) => applyFix(d, p.fix!.apply))} onLeave={(p) => change((d) => dismiss(d, p.id))} />
            </div>
          </>
        }
        // The arrows sit right beside the switch, like the calendar pages.
        nav={
          <>
            <WeekButton label={`Week before (${range})`} onClick={() => go(weekHref.prev)} icon="prev" />
            <WeekButton label={`Week after (${range})`} onClick={() => go(weekHref.next)} icon="next" />
          </>
        }
        tabs={
          <div className={segTrackClass} role="group" aria-label="Show">
            <ViewButton on={view === "week" && !groceries} onClick={() => { setGroceries(false); setView("week"); }} label="Week" />
            <ViewButton on={view === "chores" && !groceries} onClick={() => { setGroceries(false); setView("chores"); }} label="Chores" />
            {/* Groceries opens the grocery list beside the week. */}
            <ViewButton on={groceries} onClick={() => setGroceries(true)} label="Groceries" />
          </div>
        }
        action={
          <SaveButton
            dirty={dirty}
            // A week not yet saved (so its menu isn't on the grocery list) can be saved as it is.
            ready={!data.reviewed}
            saving={saving || checking}
            error={buy ? null : error}
            onSave={() => startSave()}
            onUndo={() => {
              setDraft(data.initial);
              setError(null);
            }}
          />
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 border-t border-frame bg-board sm:grid-cols-4 lg:grid-cols-7">
        {data.columns.map((col, i) => {
          const groups = groupsOn(col.date);
          const chores = choresOn(col.date);
          const slots = slotsOn(col.date);
          const can = !col.past;
          const [weekday, ...rest] = col.label.split(" ");
          return (
            <section
              key={col.date}
              aria-label={col.name}
              className={`relative flex min-h-0 min-w-0 flex-col gap-[0.45rem] px-[0.5rem] pt-[0.55rem] pb-[0.6rem] ${i > 0 ? "border-l border-frame" : ""} ${col.past ? "bg-rail" : ""}`}
            >
              <div className={`flex shrink-0 items-start gap-2 ${col.past ? "opacity-50" : ""}`}>
                <h2 className="min-w-0 flex-1">
                  <span className="block text-[1.15rem] font-bold tracking-[0.08em] text-ink-muted uppercase">{weekday}</span>
                  <span className="tabular block text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">{rest.join(" ")}</span>
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
                <div className={`flex min-h-0 flex-1 flex-col gap-[0.45rem] ${col.past ? "opacity-50" : ""}`}>
                  {/* Kind of day: each kind once, with who has it (colour dots). */}
                  <SectionTitle title="Day" onAdd={can ? () => setKindAt({ date: col.date, start: null }) : undefined} addLabel={`Add a day on ${col.name}`} />
                  {groups.map((g) => (
                    <KindRow
                      key={g.key}
                      changed={kindChanged(col.date, g)}
                      onClick={can ? () => setKindAt({ date: col.date, start: g.key }) : undefined}
                      icon={g.icon ?? "📅"}
                      name={g.name}
                      who={g.memberIds.map((id) => person.get(id)).filter((m) => m !== undefined)}
                    />
                  ))}

                  {/* Meals: one tile per meal block; dashed while nothing is picked. */}
                  <SectionTitle title="Meals" onAdd={can ? () => addMeal(col) : undefined} addLabel={`Add a meal on ${col.name}`} />
                  {slots.flatMap(({ time, meals }) => [
                    ...(meals.some((m) => !m.name)
                      ? []
                      : [<Tile key={time.id} empty disabled={!can} onClick={() => setMealAt({ mealId: null, date: col.date, mealTimeId: time.id })} title={time.name} />]),
                    ...meals.map((m) => {
                      const look = mealLook(m, time.name);
                      if (naming === m.id) return <NameTile key={m.id} onDone={(name) => nameMeal(m, name)} />;
                      return (
                        <Tile
                          key={m.id}
                          meal={look.picked}
                          empty={!look.picked}
                          changed={mealChanged(m.id)}
                          disabled={!can}
                          onClick={() => setMealAt({ mealId: m.id, date: col.date, mealTimeId: time.id })}
                          label={`${time.name}: ${look.title}`}
                          icon={look.picked ? look.icon : undefined}
                          title={look.title}
                          who={m.memberIds.map((id) => person.get(id)).filter((p) => p !== undefined)}
                        />
                      );
                    }),
                  ])}

                  {/* Chores: the chore days on this day. */}
                  <SectionTitle title="Chores" onAdd={can ? () => addChore(col) : undefined} addLabel={`Add a chore day on ${col.name}`} />
                  {chores.length === 0 ? (
                    <KindRow icon={col.away ? "🧳" : (freeDay?.icon ?? "🌿")} name={col.away ? "Away" : (freeDay?.name ?? "Free day")} />
                  ) : (
                    chores.map((id) => (
                      <Tile
                        key={id}
                        changed={choreChanged(col.date, id)}
                        disabled={!can}
                        onClick={() => pickChoreDay(col, id)}
                        icon={choreDay.get(id)?.icon ?? "🧹"}
                        title={choreDay.get(id)?.name ?? "Chores"}
                      />
                    ))
                  )}

                  {/* Plans: the day's events in their person's colour; + adds one on this day. */}
                  <SectionTitle title="Plans" onAdd={can ? () => router.push(`/review?week=${data.week}&add=${col.date}&allday=1`) : undefined} addLabel={`Add an event on ${col.name}`} />
                  <Plans plans={col.events} colourOf={(id) => (id ? person.get(id)?.colour : undefined)} moreHref={`/calendar?view=week&date=${col.date}`} />
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
          onSave={() => startSave(guard.leaving ?? goTo)}
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
      {buy ? (
        <BuySheet
          lines={buy.lines}
          saving={saving}
          error={error}
          onConfirm={(skipped) => save(buy.then, skipped)}
          onClose={() => {
            setBuy(null);
            setError(null);
            // "Not now" while leaving: stay on the week.
            if (buy.then !== null || goTo) {
              guard.stay();
              setGoTo(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

/** A day's plans: as many as fit, then "+ N more" (to the calendar). */
function Plans({ plans, colourOf, moreHref }: { plans: ReviewColumn["events"]; colourOf: (memberId: string | null) => string | undefined; moreHref: string }) {
  const [ref, fit] = useFitRows<HTMLUListElement>(4);
  const shown = plans.length > fit ? plans.slice(0, Math.max(0, fit - 1)) : plans;
  return (
    <ul ref={ref} className="flex min-h-[3.15rem] flex-1 flex-col gap-[0.45rem] overflow-hidden">
      {shown.map((e) => (
        <li key={e.id} className="flex shrink-0 flex-col">
          <Tile icon={eventEmoji(e.icon, e.title)} title={e.title} colour={colourOf(e.memberId)} />
        </li>
      ))}
      {plans.length > shown.length ? (
        <li className="flex min-h-[3.15rem] shrink-0 items-center px-1">
          <Link href={moreHref} className="flex min-h-[var(--touch-target)] items-center text-[1.15rem] font-bold text-accent">
            + {plans.length - shown.length} more
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * A Planner tile (mock .tile): a soft fill with an accent bar on the left,
 * a picture and a printed name. Meals are the meal yellow; plans take
 * their person's colour; chore days are grey. `empty`: a dashed block
 * still to pick ("Dinner"). A tile changed on this review gets a blue ring.
 */
function Tile({
  title,
  icon,
  colour,
  meal = false,
  empty = false,
  changed = false,
  disabled = false,
  onClick,
  label,
  who = [],
}: {
  title: string;
  icon?: string;
  colour?: string | null;
  meal?: boolean;
  empty?: boolean;
  changed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
  who?: Person[];
}) {
  const tinted = !empty && !meal && colour;
  const style: CSSProperties | undefined = tinted ? ({ background: soft(colour), "--bar": strong(colour) } as CSSProperties) : undefined;
  const look = empty
    ? `justify-center border-2 border-dashed ${changed ? "border-accent" : "border-frame"} text-ink-muted`
    : `${meal ? "bg-meal text-meal-ink before:bg-meal-ink" : tinted ? "text-ink before:bg-[var(--bar)]" : "bg-panel text-ink before:bg-check-border"} before:absolute before:inset-y-0 before:left-0 before:w-[0.28rem] ${
        changed ? "ring-[0.15rem] ring-accent ring-inset" : ""
      }`;
  const className = `relative flex min-h-[3.15rem] w-full min-w-0 shrink-0 items-center gap-[0.45rem] overflow-hidden rounded-[var(--radius)] py-[0.25rem] pr-[0.55rem] pl-[0.7rem] text-left ${look}`;
  const body = (
    <>
      {icon && !empty ? <Emoji emoji={icon} className="size-[1.6rem]" /> : null}
      <span className={`min-w-0 truncate text-[1.25rem] leading-[1.15] font-bold ${empty ? "" : "flex-1"}`}>{title}</span>
      {who.length > 0 ? (
        <span className="flex shrink-0 gap-[0.2rem]">
          {who.map((p) => (
            <Face key={p.id} person={p} size="size-[0.8rem]" />
          ))}
        </span>
      ) : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label ?? title} className={className} style={style}>
      {body}
    </button>
  ) : (
    <span className={className} style={style}>
      {body}
    </span>
  );
}

/** A kind of day (mock .kind): picture, name, and who has it as colour dots. */
function KindRow({ icon, name, who = [], onClick, changed = false }: { icon: string; name: string; who?: Person[]; onClick?: () => void; changed?: boolean }) {
  const className = `flex min-h-[3rem] w-full min-w-0 shrink-0 items-center gap-[0.4rem] rounded-[var(--radius)] px-[0.3rem] text-left text-[1.15rem] font-bold text-ink-soft ${
    changed ? "ring-[0.15rem] ring-accent ring-inset" : ""
  }`;
  const body = (
    <>
      <Emoji emoji={icon} className="size-[1.6rem]" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="flex shrink-0 gap-[0.2rem]">
        {who.map((p) => (
          <Face key={p.id} person={p} size="size-[0.8rem]" />
        ))}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:bg-rail`}>
      {body}
    </button>
  ) : (
    <span className={className}>{body}</span>
  );
}

/** A new meal tile being named: type its name, then Done (or Enter). */
function NameTile({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name);
      }}
      className="flex shrink-0"
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => onDone(name)}
        placeholder="Name it"
        aria-label="Meal name"
        className="min-h-[3.15rem] w-full min-w-0 rounded-[var(--radius)] border-2 border-accent bg-board px-[0.7rem] text-[1.25rem] font-bold text-ink outline-none"
      />
    </form>
  );
}

function ViewButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={segItemClass(on)}>
      {label}
    </button>
  );
}

function WeekButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: "prev" | "next" }) {
  const Icon = icon === "prev" ? CaretLeft : CaretRight;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-panel text-ink">
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
