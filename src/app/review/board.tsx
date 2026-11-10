"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CaretDown, CaretLeft, CaretRight, ShoppingCart, Sparkle, Suitcase } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { eventEmoji } from "@/lib/emoji";
import { strong } from "@/lib/colours";
import { hasOpenDish, mainDish } from "@/lib/menu";
import {
  addChoreDay,
  applyFix,
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
import { ChecksBox, KindBox, PickerBox, type KindChoice, type Picker } from "./boxes";
import type { ReviewColumn, ReviewData } from "./data";
import { GrocerySheet } from "./grocery-sheet";
import { MealBox, type MealTarget } from "./meal-box";
import { Face, SectionTitle, type Person } from "./parts";

/**
 * The weekly review, where the coming week is planned (Connor's redesign,
 * 2026-11-09). It looks like the Week calendar without times: seven days
 * side by side, each with big meal tiles and a grey box summing up the
 * rest. Tapping the grey box opens it up over the day's meals to show and
 * change its kinds of day, chore days and plans; Close shrinks it back.
 * Tapping a meal tile opens the meal picker. One Save in the header keeps
 * it all; the grocery list beside it is live.
 */

/** How many of a day's plans its box names before "+ N more". */
const PLANS_SHOWN = 3;
export function ReviewBoard({
  data,
  range,
  weekHref,
  openMeal = null,
}: {
  data: ReviewData;
  range: string;
  weekHref: { prev: string; next: string; coming: string; isComing: boolean };
  /** A meal to open the picker on straight away. */
  openMeal?: { id: string; date: string; mealTimeId: string } | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ReviewDraft>(data.initial);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [mealAt, setMealAt] = useState<{ mealId: string | null; date: string; mealTimeId: string } | null>(
    openMeal && data.meals.some((m) => m.id === openMeal.id) ? { mealId: openMeal.id, date: openMeal.date, mealTimeId: openMeal.mealTimeId } : null,
  );
  const [kindAt, setKindAt] = useState<{ date: string; start: string | null } | null>(null);
  const [checks, setChecks] = useState(false);
  const [groceries, setGroceries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goTo, setGoTo] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.initial);
  const guard = useUnsavedChanges(dirty);

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

  const mealLook = (m: DraftMeal) => {
    const mm = m.menuMealId ? menuMeal.get(m.menuMealId) : undefined;
    const main = mainDish(m.dishes);
    const r = main ? dish.get(main) : undefined;
    const c = m.categoryId ? category.get(m.categoryId) : undefined;
    const options = c ? data.menuMeals.filter((x) => x.category_ids.includes(c.id)).length : 0;
    // A saved meal with sides keeps its own name; a custom one is called after its main dish.
    const title = mm?.name ?? r?.name ?? c?.name ?? "Meal";
    const sides = m.dishes.filter((d) => d.recipeId && d.recipeId !== main).length;
    return {
      title,
      icon: mm?.icon ?? r?.icon ?? c?.icon ?? "🍽️",
      kind: (mm || r) && c ? c.name : null,
      pick: (!mm && !r && options > 1) || hasOpenDish(m.dishes),
      sides,
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
          .map((c) => ({ key: c.date, label: `Move to ${c.name}`, icon: cd.icon, pick: () => change((d) => moveChoreDay(d, id, col.date, c.date)) })),
        { key: "off", label: `Take off ${col.name}`, danger: true, pick: () => change((d) => takeOffChoreDay(d, col.date, id)) },
      ],
    });
  };

  const addChore = (col: ReviewColumn) =>
    setPicker({
      title: `Add a chore day on ${col.name}`,
      options: data.choreDays
        .filter((cd) => !cd.is_free && !choresOn(col.date).includes(cd.id))
        .map((cd) => ({ key: cd.id, label: cd.name, icon: cd.icon, pick: () => change((d) => addChoreDay(d, col.date, cd.id)) })),
    });

  // The meal picker follows the draft, so it shows each change as it's made.
  const mealTarget: MealTarget | null = (() => {
    if (!mealAt) return null;
    const col = data.columns.find((c) => c.date === mealAt.date);
    const time = data.mealTimes.find((t) => t.id === mealAt.mealTimeId);
    const meal = mealAt.mealId ? (mealsIn(data.meals, draft, mealAt.date, mealAt.mealTimeId).find((m) => m.id === mealAt.mealId) ?? null) : null;
    return { meal, date: mealAt.date, mealTimeId: mealAt.mealTimeId, where: `${time?.name ?? "Meal"} · ${col?.label ?? ""}` };
  })();

  // --- The screen ------------------------------------------------------------

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 lg:h-18 lg:flex-nowrap">
        <h1 className="text-3xl font-extrabold tracking-[-0.03rem] text-ink lg:text-5xl">Weekly review</h1>
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
        <button
          type="button"
          onClick={() => setChecks(true)}
          className={`flex min-h-13 items-center gap-2 rounded-2xl px-4 text-lg font-bold whitespace-nowrap ${
            problems.length > 0 ? "bg-[color-mix(in_srgb,var(--color-accent)_11%,white)] text-accent" : "text-ink-muted hover:bg-rail"
          }`}
        >
          <Sparkle size="1.375rem" weight="fill" aria-hidden />
          {problems.length > 0 ? `${problems.length} to check` : "Nothing to check"}
        </button>
        <div className="flex-1" />
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
          const isOpen = openDay === col.date && !col.past;
          const groups = groupsOn(col.date);
          const chores = choresOn(col.date);
          const slots = data.mealTimes.map((t) => ({ time: t, meals: mealsIn(data.meals, draft, col.date, t.id) }));
          const roomy = slots.length <= 2;
          return (
            <section
              key={col.date}
              aria-label={col.name}
              className={`relative flex min-h-0 min-w-0 flex-col gap-2.5 px-3 pt-3 pb-3 ${i > 0 ? "border-l border-grid" : ""} ${col.past ? "bg-rail" : ""}`}
            >
              <div className={`flex h-12 shrink-0 items-center gap-2.5 px-1 ${col.past ? "opacity-50" : ""}`}>
                <h2 className="truncate text-[1.75rem] text-ink">
                  <span className="font-extrabold">{col.label.split(" ")[0]}</span> <span className="font-medium text-ink-soft">{col.label.split(" ").slice(1).join(" ")}</span>
                </h2>
                {col.away ? <Badge /> : null}
              </div>

              {/* Meal tiles, one row per meal time. */}
              <div className={`flex min-h-0 flex-1 flex-col gap-2 ${col.past ? "opacity-50" : ""}`}>
                {slots.map(({ time, meals }) =>
                  meals.length === 0 ? (
                    <button
                      key={time.id}
                      type="button"
                      disabled={col.past}
                      onClick={() => setMealAt({ mealId: null, date: col.date, mealTimeId: time.id })}
                      className="flex min-h-14 flex-1 basis-[6.875rem] items-center justify-center rounded-[1.375rem] border-2 border-dashed border-[color-mix(in_srgb,var(--color-meal-ink)_28%,var(--color-meal))] text-lg font-bold text-[color-mix(in_srgb,var(--color-meal-ink)_70%,white)] disabled:opacity-60"
                    >
                      + {time.name}
                    </button>
                  ) : (
                    <div key={time.id} className="flex min-h-0 shrink flex-col gap-1.5" style={{ flex: `${meals.length} 1 0` }}>
                      {meals.map((m) => {
                        const look = mealLook(m);
                        const big = roomy && meals.length === 1;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={col.past}
                            onClick={() => setMealAt({ mealId: m.id, date: col.date, mealTimeId: time.id })}
                            title={`${time.name}: ${look.title}`}
                            className={`relative flex min-h-14 min-w-0 flex-1 rounded-[1.375rem] border-2 bg-meal px-2.5 text-meal-ink ${big ? "flex-col items-center justify-center gap-1.5 text-center" : "max-h-[6rem] items-center gap-2.5 text-left"} ${
                              mealChanged(m.id) ? "border-dashed border-accent" : "border-transparent"
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
                            <Emoji emoji={look.icon} className={big ? "size-[4.75rem]" : "size-10"} />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-bold tracking-wide uppercase opacity-70">{time.name}</span>
                              <span className={`line-clamp-2 leading-tight font-extrabold ${big ? "text-xl" : "text-lg"}`}>{look.title}</span>
                              {look.pick ? (
                                <span className="text-sm font-bold text-[color-mix(in_srgb,var(--color-meal-ink)_70%,var(--color-meal))]">Pick which one</span>
                              ) : look.sides > 0 ? (
                                <span className="text-sm font-bold text-[color-mix(in_srgb,var(--color-meal-ink)_70%,var(--color-meal))]">
                                  + {look.sides} {look.sides === 1 ? "side" : "sides"}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ),
                )}
              </div>

              {/* The grey box: a glance at the rest of the day. */}
              <button
                type="button"
                disabled={col.past}
                onClick={() => setOpenDay(col.date)}
                aria-label={`Open ${col.name}`}
                className={`flex shrink-0 flex-col gap-2.5 rounded-[1.25rem] bg-rail p-3 text-left ${col.past ? "opacity-50" : "hover:bg-panel"}`}
              >
                <span className="flex flex-wrap gap-1.5">
                  {groups.map((g) => (
                    <span key={g.key} className={`flex items-center gap-0.5 rounded-xl border-2 bg-board py-0.5 pr-1.5 pl-1 ${kindChanged(col.date, g) ? "border-dashed border-accent" : "border-transparent"}`} title={g.name}>
                      <Emoji emoji={g.icon ?? "📅"} className="mr-0.5 size-7" />
                      {g.memberIds.map((id) => (
                        <Face key={id} person={person.get(id)} size="size-6 text-[0.6875rem]" />
                      ))}
                    </span>
                  ))}
                </span>
                <span className="flex min-h-10 flex-wrap items-center gap-1.5">
                  {chores.length === 0 ? (
                    <span className="text-base text-ink-muted">{col.away ? "Away" : (freeDay?.name ?? "Free day")}</span>
                  ) : (
                    chores.map((id) => (
                      <span
                        key={id}
                        title={choreDay.get(id)?.name}
                        className={`flex size-11 items-center justify-center rounded-[0.875rem] border-2 bg-board ${choreChanged(col.date, id) ? "border-dashed border-accent" : "border-transparent"}`}
                      >
                        <Emoji emoji={choreDay.get(id)?.icon ?? "🧹"} className="size-7" />
                      </span>
                    ))
                  )}
                </span>
                {/* The day's plans by name, so the box says what's on (2026-11-10). */}
                {col.events.length > 0 ? (
                  <span className="flex min-h-[4.25rem] flex-col gap-1">
                    {col.events.slice(0, PLANS_SHOWN).map((e) => (
                      <span key={e.id} className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
                        <Dot colour={person.get(e.memberId ?? "")?.colour} />
                        <span className="truncate">{e.title}</span>
                      </span>
                    ))}
                    {col.events.length > PLANS_SHOWN ? (
                      <span className="text-sm font-bold text-ink-muted">+ {col.events.length - PLANS_SHOWN} more</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="min-h-[4.25rem]" />
                )}
              </button>

              {isOpen ? (
                <OpenDay
                  onClose={() => setOpenDay(null)}
                  meals={slots.map(({ time, meals }) => ({
                    time,
                    meals: meals.map((m) => ({ ...mealLook(m), id: m.id, changed: mealChanged(m.id) })),
                  }))}
                  onMeal={(mealId, mealTimeId) => setMealAt({ mealId, date: col.date, mealTimeId })}
                  kinds={
                    <>
                      <SectionTitle title="Kind of day" onAdd={() => setKindAt({ date: col.date, start: null })} addLabel={`Add a kind of day on ${col.name}`} />
                      {groups.map((g) => (
                        <Row key={g.key} changed={kindChanged(col.date, g)} onClick={() => setKindAt({ date: col.date, start: g.key })}>
                          <Emoji emoji={g.icon ?? "📅"} className="size-7" />
                          <span className="min-w-0 flex-1 truncate">{g.name}</span>
                          <span className="flex gap-0.5">
                            {g.memberIds.map((id) => (
                              <Face key={id} person={person.get(id)} size="size-6 text-[0.6875rem]" />
                            ))}
                          </span>
                        </Row>
                      ))}
                    </>
                  }
                  chores={
                    <>
                      <SectionTitle title="Chores" onAdd={() => addChore(col)} addLabel={`Add a chore day on ${col.name}`} />
                      {chores.length === 0 ? (
                        <Row muted>
                          <Emoji emoji={col.away ? "🧳" : (freeDay?.icon ?? "🌿")} className="size-7" />
                          <span className="truncate">{col.away ? "None: away" : (freeDay?.name ?? "Free day")}</span>
                        </Row>
                      ) : (
                        chores.map((id) => (
                          <Row key={id} changed={choreChanged(col.date, id)} onClick={() => pickChoreDay(col, id)}>
                            <Emoji emoji={choreDay.get(id)?.icon ?? "🧹"} className="size-7" />
                            <span className="min-w-0 truncate">{choreDay.get(id)?.name}</span>
                          </Row>
                        ))
                      )}
                    </>
                  }
                  plans={col.events}
                  roomFor={Math.max(1, 9 - groups.length - Math.max(1, chores.length) - slots.reduce((n, s) => n + Math.max(1, s.meals.length), 0))}
                  person={person}
                />
              ) : null}
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
      {checks ? (
        <ChecksBox
          problems={problems}
          onFix={(p) => p.fix && change((d) => applyFix(d, p.fix!.apply))}
          onLeave={(p) => change((d) => dismiss(d, p.id))}
          onClose={() => setChecks(false)}
        />
      ) : null}
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

/** A day opened up: its grey box grows over the meals to show and change everything. */
function OpenDay({
  meals,
  onMeal,
  kinds,
  chores,
  plans,
  roomFor,
  person,
  onClose,
}: {
  meals: { time: { id: string; name: string }; meals: { id: string; title: string; icon: string; changed: boolean }[] }[];
  onMeal: (mealId: string | null, mealTimeId: string) => void;
  kinds: ReactNode;
  chores: ReactNode;
  plans: ReviewColumn["events"];
  /** How many plans fit below everything else. */
  roomFor: number;
  person: Map<string, Person>;
  onClose: () => void;
}) {
  const shown = plans.slice(0, roomFor);
  return (
    <div className="absolute inset-x-2 top-[4.25rem] bottom-3 z-10 flex flex-col gap-1.5 overflow-hidden rounded-[1.375rem] bg-rail p-3 shadow-[0_0_0_2px_var(--color-frame),0_18px_40px_rgba(20,30,50,0.14)]">
      <button type="button" onClick={onClose} className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[0.875rem] bg-board text-base font-bold text-ink-soft hover:bg-panel">
        <CaretDown size="1.125rem" weight="bold" aria-hidden />
        Close
      </button>
      <div className="flex shrink-0 flex-col gap-1.5 pt-1">
        {meals.map(({ time, meals: list }) =>
          list.length === 0 ? (
            <button
              key={time.id}
              type="button"
              onClick={() => onMeal(null, time.id)}
              className="flex min-h-11 items-center justify-center rounded-xl border-2 border-dashed border-[color-mix(in_srgb,var(--color-meal-ink)_28%,var(--color-meal))] text-base font-bold text-[color-mix(in_srgb,var(--color-meal-ink)_70%,white)]"
            >
              + {time.name}
            </button>
          ) : (
            list.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMeal(m.id, time.id)}
                className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl border-2 bg-meal px-2 text-left text-sm font-extrabold text-meal-ink ${m.changed ? "border-dashed border-accent" : "border-transparent"}`}
              >
                <Emoji emoji={m.icon} className="size-7" />
                <span className="min-w-0 truncate">{m.title}</span>
              </button>
            ))
          ),
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">{kinds}</div>
      <div className="flex shrink-0 flex-col gap-1.5">{chores}</div>
      <div className="flex min-h-0 flex-col gap-1">
        <SectionTitle title="Plans" />
        {plans.length === 0 ? <span className="px-0.5 text-base text-ink-muted">Nothing on</span> : null}
        {shown.map((e) => (
          <span key={e.id} className="flex min-h-8 min-w-0 items-center gap-2 px-0.5 text-base font-bold text-ink">
            <Dot colour={person.get(e.memberId ?? "")?.colour} />
            <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-5" />
            <span className="min-w-0 truncate">{e.title}</span>
          </span>
        ))}
        {plans.length > shown.length ? <span className="px-0.5 text-sm font-bold text-ink-muted">+ {plans.length - shown.length} more on the calendar</span> : null}
      </div>
    </div>
  );
}

function Row({ children, onClick, changed = false, muted = false }: { children: ReactNode; onClick?: () => void; changed?: boolean; muted?: boolean }) {
  const className = `flex min-h-12 w-full min-w-0 items-center gap-2 rounded-[0.875rem] border-2 bg-board px-2 text-left text-base font-extrabold ${
    changed ? "border-dashed border-accent" : "border-transparent"
  } ${muted ? "font-bold text-ink-muted" : "text-ink"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:bg-panel`}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

function Dot({ colour }: { colour: string | null | undefined }) {
  return <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: colour ? strong(colour) : "var(--color-check-border)" }} />;
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
