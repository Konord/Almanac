import type { ReactNode } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import { AppAlerts } from "@/components/app-alerts";
import { hand, strong } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { dailyListPart } from "@/lib/routines";
import { dailyOrder, onDailyList, onItsList, timedToday } from "@/lib/todos";
import { loadTodos, type Todo } from "../chores/data";
import { loadMealBasics, loadMeals, mealIcon, mealName } from "../meals/data";
import { cookHref, mealsForRoutines, placeTodayMeals, startCooking } from "../meals/today";
import { tickSteps, toggleStep } from "../routines/actions";
import { loadRoutines } from "../routines/data";
import { floatingRoutines } from "../routines/floating";
import { pickPanelTab } from "./actions";
import { loadGroceries } from "../groceries/data";
import { GroceryView } from "../groceries/view";
import { PanelPages } from "@/components/panel-pages";
import { boxedHref, panelBoxes } from "@/lib/panel-boxes";
import { addTodo, toggleTodo } from "../chores/actions";
import { choreSchedule } from "../chores/plan";
import { shortClockTime } from "@/lib/time-text";
import { HabitsBox } from "./habits-box";
import { HealthBox } from "./health-box";
import { SpotifyBox } from "./spotify-box";
import { loadHealthLogs, loadTrackers } from "../habits/health-data";
import { FitList } from "@/components/fit-list";
import { ListRow } from "@/components/list-row";

/**
 * The Today panel: the Glance right-hand column on the Agenda, and the
 * Daily List panel that Week and Month push open. Two cards:
 *
 * 1. The dinner card: tonight's dinner (or the next meal), or the song
 *    playing on Spotify while music plays (spotify-box.tsx).
 * 2. The box: the Daily List, or another box picked in Settings (a list,
 *    routines, habits, health, the chore bucket), flipped with the named
 *    arrows at the bottom; the screen remembers the last one. The Daily
 *    List is today's tasks from every list: chores, heads-ups and list
 *    tasks for today (tasks rework, 2026-11-09). Timed ones come first,
 *    with the time beside them; a task for one person is in their ink.
 *    Routines switched to "Show on daily list" join it, and so does the
 *    cook's "Start dinner". A routine's checklist can take this card over.
 *    The box's title opens its own screen; for the Daily List and the lists
 *    that's the Lists screen with that list picked. Its rows are the same
 *    ListRow the Lists screen uses.
 */

/** A row on the daily list: a task, a routine (or some of its steps) switched on to show there, or the cook's "Start dinner". */
type Row =
  | { kind: "todo"; key: string; todo: Todo; time: string | null }
  | {
      kind: "routine";
      key: string;
      title: string;
      icon: string | null;
      colour: string | null;
      time: string;
      memberId: string;
      templateId: string;
      /** The steps ticking this row ticks: one step, or all of a routine's open steps. */
      stepIds: string[];
      /** "2/5" on a whole-routine row; null on a single step. */
      count: string | null;
    }
  | { kind: "start"; key: string; title: string; colour: string | null; time: string; href: string };

/** How many rows fit in the working part without anything scrolling. */
const ROWS = 6;
/** The Chores box's rows, leaving room for its add box. */
const BUCKET_ROWS = 4;

export async function TodayPanel({
  household,
  today,
  tab,
  returnTo: pageHref,
  day = false,
  routine,
}: {
  household: Household;
  today: LocalDate;
  /** The box to show (the page's ?box=): "upnext", a list's id…; the Daily List if missing. */
  tab: string | undefined;
  /** This page's address, to come back to after a tap. */
  returnTo: string;
  /** On the Agenda view the timeline already shows today, so the panel has no "Up next". */
  day?: boolean;
  /** A routine's checklist (from tapping its block), shown instead of the list. */
  routine?: ReactNode;
}) {
  const { locale, timeZone } = household.settings;
  const supabase = await createClient();
  const [{ lists, todos }, basics, meals, { data: memberRows }, routineData, { data: spotify }, { count: habitCount }, { count: trackerCount }] = await Promise.all([
    loadTodos(),
    loadMealBasics(),
    loadMeals(today, addDays(today, 1)),
    supabase.from("members").select("id, colour"),
    loadRoutines(today),
    supabase.from("spotify_connections").select("household_id").maybeSingle(),
    supabase.from("habits").select("id", { count: "exact", head: true }),
    supabase.from("health_trackers").select("id", { count: "exact", head: true }),
  ]);
  const colourOf = new Map((memberRows ?? []).map((m) => [m.id, m.colour]));

  // The boxes this household flips between (Settings), and the one this screen showed last.
  // Habits and Health only show once there's something set up in them (Connor, 2026-11-26).
  const wanted = panelBoxes(household.settings.panelBoxes, lists, day).filter(
    (b) => !(b.id === "habits" && !habitCount) && !(b.id === "health" && !trackerCount),
  );
  const boxes = wanted.length ? wanted : [{ id: "today", name: "Daily List" }];
  const box = boxes.find((b) => b.id === tab) ?? boxes[0];
  const showing = box.id;
  // Ticks and adds come back to this page with the same box showing.
  const returnTo = boxedHref(pageHref, showing);
  const list = lists.find((l) => l.id === showing);
  // The grocery list shows its own lines (quick adds while you cook or plan).
  const groceries = list?.is_groceries ? await loadGroceries(household) : null;
  const nowMinutes = (() => {
    const [h, m] = localTimeOf(new Date(), timeZone).split(":").map(Number);
    return h * 60 + m;
  })();
  const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  // Besides tasks, the daily list has routines switched on to show there,
  // and the cook's "Start dinner" (until the meal is eaten).
  const todayMeals = placeTodayMeals(
    meals.filter((m) => m.date === today),
    basics,
    [],
  );
  const extras: Row[] =
    showing === "today"
      ? [
          ...routineData.members.flatMap((m) =>
            floatingRoutines(
              routineData,
              m.id,
              today,
              [],
              timeZone,
              household.settings.routineFlexMinutes,
              mealsForRoutines(todayMeals),
            )
              .filter((r) => !r.progress.complete && !routineData.ended.has(`${m.id}:${r.template.id}`))
              .flatMap((r): Row[] => {
                // Steps switched on for the list. All of them: the routine is
                // one row that ticks them all. Some: those steps, one row each.
                const part = dailyListPart(r.steps, r.doneIds);
                const base = {
                  kind: "routine" as const,
                  colour: m.colour,
                  time: hhmm(r.placement.startMin),
                  memberId: m.id,
                  templateId: r.template.id,
                };
                if (part.kind === "none") return [];
                if (part.kind === "routine")
                  return [
                    {
                      ...base,
                      key: `routine:${r.assignment.id}`,
                      title: r.template.name,
                      icon: r.progress.next?.icon ?? r.steps[0]?.icon ?? null,
                      stepIds: part.steps.map((s) => s.id),
                      count: `${r.progress.done}/${r.progress.total}`,
                    },
                  ];
                return part.steps.map((s) => ({
                  ...base,
                  key: `routine:${r.assignment.id}:${s.id}`,
                  title: s.text,
                  icon: s.icon,
                  stepIds: [s.id],
                  count: null,
                }));
              }),
          ),
          ...todayMeals.flatMap((m): Row[] => {
            const start = startCooking(m);
            if (!start || m.eatEnd <= nowMinutes) return [];
            return [
              {
                kind: "start",
                key: `start:${m.id}`,
                title: start.title,
                colour: m.cookId ? (colourOf.get(m.cookId) ?? null) : null,
                time: hhmm(start.minute),
                href: start.href,
              },
            ];
          }),
        ]
      : [];
  const tasks: Row[] = (
    showing === "today"
      ? dailyOrder(
          todos.filter((t) => t.status === "open" && onDailyList(t, today)),
          today,
        )
      : list
        ? todos.filter((t) => t.list_id === list.id && t.status === "open" && onItsList(t))
        : []
  ).map((todo) => ({
    kind: "todo",
    key: todo.id,
    todo,
    time: todo.at_time && timedToday(todo, today) ? todo.at_time.slice(0, 5) : null,
  }));
  // Timed things first, by time; then the rest in the daily list's order.
  const open: Row[] = [
    ...[...tasks, ...extras]
      .filter((r) => r.time !== null)
      .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
    ...tasks.filter((r) => r.time === null),
  ];

  // The next meal: today's still to come (or under way), else tomorrow's first.
  const recipes = new Map(basics.recipes.map((r) => [r.id, r]));
  const categories = new Map(basics.categories.map((c) => [c.id, c]));
  const times = new Map(basics.mealTimes.map((t) => [t.id, t]));
  const nowTime = localTimeOf(new Date(), timeZone);
  const hourAgo = `${String(Math.max(0, Number(nowTime.slice(0, 2)) - 1)).padStart(2, "0")}${nowTime.slice(2, 5)}`;
  const taskTime = (time: string) =>
    shortClockTime(zonedToUtc(today, time.slice(0, 5), timeZone), locale, timeZone);

  // Today's routines, for the Routines box: tapping one opens its checklist in the panel.
  const routineRows =
    showing === "routines"
      ? routineData.members
          .flatMap((m) =>
            floatingRoutines(routineData, m.id, today, [], timeZone, household.settings.routineFlexMinutes, mealsForRoutines(todayMeals)).map((r) => ({
              key: `${m.id}:${r.assignment.id}`,
              member: m,
              routine: r,
              startMin: r.placement.startMin,
            })),
          )
          .sort((a, b) => a.startMin - b.startMin)
      : [];
  const routineHref = (templateId: string, memberId: string) =>
    `${returnTo}${returnTo.includes("?") ? "&" : "?"}routine=${templateId}&member=${memberId}`;

  // The chore bucket: occasional and one-off chores the planner has put on the coming days.
  const bucket = showing === "bucket" ? await bucketRows(household, today, todos) : null;
  const choresList = lists.find((l) => l.is_chores);
  // Where the add box puts things: the list showing (not the grocery list,
  // which has its own). The Daily List has no add box (Connor, 2026-11-16):
  // things are added on To-do, Chores or another list.
  const addListId = list && !list.is_groceries ? list.id : null;
  // The heading opens the box's own screen. The Daily List and the lists
  // open the Lists screen with that list picked (the Daily List: the list
  // its add box adds to); the chore bucket, the Chores list.
  const boxHref =
    showing === "upnext"
      ? "/"
      : showing === "routines"
        ? "/routines"
        : showing === "habits"
          ? "/habits"
          : showing === "health"
            ? "/habits/health"
            : showing === "bucket"
              ? listHref(choresList?.id)
              : showing === "today"
                ? listHref(lists.find((l) => !l.is_chores && !l.is_groceries)?.id)
                : listHref(showing);

  // The dinner card: tonight's dinner (or the next meal once it's eaten),
  // with today's other meals still to come as a small line under it.
  const upcoming = meals
    .filter((m) => m.status === "planned")
    .map((m) => ({ meal: m, at: m.eat_at ?? times.get(m.meal_time_id)?.usual_time ?? "18:00", timeName: times.get(m.meal_time_id)?.name ?? "Meal" }))
    .filter((m) => m.meal.date > today || m.at >= hourAgo)
    .sort((a, b) => (a.meal.date === b.meal.date ? a.at.localeCompare(b.at) : a.meal.date.localeCompare(b.meal.date)));
  const main = upcoming.find((m) => m.meal.date === today && m.timeName.toLowerCase() === "dinner") ?? upcoming[0];
  const others = upcoming.filter((m) => m !== main && m.meal.date === today);
  const at = (m: (typeof upcoming)[number]) => shortClockTime(zonedToUtc(m.meal.date, m.at, timeZone), locale, timeZone);
  const label = (m: (typeof upcoming)[number]) =>
    m.meal.date > today ? `${m.timeName} tomorrow` : m.timeName.toLowerCase() === "dinner" ? "Dinner tonight" : m.timeName;
  const dinnerCard = (
    <Link
      href={main ? cookHref({ id: main.meal.id, canCook: Boolean(main.meal.recipe_id) || main.meal.dishes.some((d) => d.recipe_id) }) : `/review?week=${today}`}
      className="flex h-[8.75rem] shrink-0 items-center gap-5 overflow-hidden rounded-[var(--radius-card)] bg-meal px-[1.4rem] text-meal-ink shadow-raised"
    >
      <Emoji emoji={main ? mealIcon(main.meal, recipes, categories) : "🍽️"} className="size-18" />
      <span className="flex min-w-0 flex-col">
        {main ? (
          <>
            <span className="tabular text-[1.125rem] font-bold tracking-[0.06em] uppercase">
              {label(main)} · {at(main)}
            </span>
            <b className="line-clamp-2 font-hand text-[1.75rem] leading-[1.15]" style={{ color: hand(main.meal.cook_id ? colourOf.get(main.meal.cook_id) : null) }}>
              {mealName(main.meal, recipes, categories)}
            </b>
            {others.slice(0, 1).map((m) => (
              <span key={m.meal.id} className="tabular mt-1 truncate text-[1.125rem] font-semibold">
                {m.timeName} · {at(m)} · <span className="font-hand">{mealName(m.meal, recipes, categories)}</span>
              </span>
            ))}
          </>
        ) : (
          <b className="text-[1.75rem] leading-[1.15] text-ink">Plan dinner</b>
        )}
      </span>
    </Link>
  );

  // The Daily List's rows (and a list's, on a list box): tick to scratch off.
  const sideRows = open.map((row) => {
    const colour = row.kind === "todo" ? (row.todo.assignee_id ? colourOf.get(row.todo.assignee_id) : null) : row.colour;
    const title = row.kind === "todo" ? row.todo.title : row.title;
    const icon = row.kind === "todo" ? row.todo.icon : row.kind === "start" ? "🔪" : row.icon;
    const meta =
      row.time !== null ? (
        `${row.kind === "todo" && row.todo.date_kind === "due" ? "by " : ""}${taskTime(row.time)}`
      ) : row.kind === "todo" && row.todo.must_do ? (
        <span className="rounded-full bg-now px-2.5 py-1 text-base font-extrabold text-white">Essential</span>
      ) : null;
    if (row.kind === "start") {
      // Start dinner opens the cook's view: a › where the tick goes.
      return (
        <ListRow
          key={row.key}
          title={title}
          ink={hand(colour)}
          lead={
            <Link href={row.href} aria-label={`Open ${title}`} className="flex size-12 shrink-0 items-center justify-center text-ink-muted">
              <CaretRight size="1.5rem" weight="bold" aria-hidden />
            </Link>
          }
          editHref={row.href}
          meta={meta}
          icon={<Emoji emoji={icon} className="size-8" />}
          slot
        />
      );
    }
    const fields: [string, string][] =
      row.kind === "todo"
        ? [
            ["id", row.todo.id],
            ["returnTo", returnTo],
          ]
        : [
            ["memberId", row.memberId],
            ...row.stepIds.map((id): [string, string] => ["stepId", id]),
            ["templateId", row.templateId],
            ["date", today],
            ["returnTo", returnTo],
          ];
    return (
      <ListRow
        key={row.key}
        tick={{ action: row.kind === "todo" ? toggleTodo : row.stepIds.length === 1 ? toggleStep : tickSteps, fields }}
        title={title}
        ink={hand(colour)}
        icon={icon ? <Emoji emoji={icon} className="size-8" /> : null}
        meta={row.kind === "routine" && row.count ? `${row.count}${meta ? ` · ${meta}` : ""}` : meta}
        slot
      />
    );
  });

  const heading = (
    <Link href={boxHref} className="flex min-h-12 items-center truncate text-[1.75rem] font-bold text-ink">
      {box.name}
    </Link>
  );
  // Flipping boxes: the boxes either side, by name ("‹ Chores", "Groceries ›"),
  // so it's clear where a tap goes. No row of dots: there can be a dozen boxes.
  const boxAt = Math.max(0, boxes.findIndex((b) => b.id === showing));
  const neighbour = (by: 1 | -1) => {
    const b = boxes[(boxAt + by + boxes.length) % boxes.length];
    return (
      <form action={pickPanelTab} className="min-w-0">
        <input type="hidden" name="tab" value={b.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-label={`Show ${b.name}`}
          className="flex min-h-[var(--touch-target)] max-w-full min-w-[var(--touch-target)] items-center gap-1.5 rounded-full bg-panel px-4 text-[1.125rem] leading-none font-bold text-ink-soft"
        >
          {by === -1 ? <CaretLeft size="1.125rem" weight="bold" aria-hidden className="shrink-0" /> : null}
          <span className="truncate">{b.name}</span>
          {by === 1 ? <CaretRight size="1.125rem" weight="bold" aria-hidden className="shrink-0" /> : null}
        </button>
      </form>
    );
  };
  const switcher =
    boxes.length > 1 ? (
      <nav aria-label={`Boxes: ${box.name}, ${boxAt + 1} of ${boxes.length}`} className="mt-3 grid shrink-0 grid-cols-2 items-center gap-3 [&>form:last-child]:justify-self-end">
        {/* With two boxes, both ways lead to the same one: just "Next ›". */}
        {boxes.length > 2 ? neighbour(-1) : <span />}
        {neighbour(1)}
      </nav>
    ) : null;

  return (
    <aside aria-label="Today" className="flex min-h-0 min-w-0 flex-col gap-5">
      {/* A server app that stopped answering (kitchen screen only). */}
      <AppAlerts />
      {spotify ? <SpotifyBox meal={dinnerCard} /> : dinnerCard}
      <section className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised">
        {routine ? (
          routine
        ) : (
          <>
            {showing === "today" || (list && !groceries) ? (
              <FitList
                heading={heading}
                rows={sideRows}
                fallback={7}
                className="mt-1"
              />
            ) : (
              <>
                <div className="mb-1 flex min-h-12 shrink-0 items-center gap-3">
                  <h2 className="min-w-0 flex-1">{heading}</h2>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {showing === "upnext" ? null : showing === "routines" ? (
                    routineRows.length === 0 ? null : (
                      <PanelPages
                        pages={pagesOf(routineRows, ROWS).map((rows, p) => (
                          <ul key={p} className="flex flex-col">
                            {rows.map(({ key, member, routine: r, startMin }) => (
                              <li key={key} className="border-b border-frame last:border-0">
                                <Link href={routineHref(r.template.id, member.id)} scroll={false} className="flex min-h-16 items-center gap-3">
                                  <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: strong(member.colour) }} aria-hidden />
                                  <span className={`min-w-0 flex-1 truncate font-hand text-[1.375rem] ${r.progress.complete ? "text-ink-muted" : ""}`} style={r.progress.complete ? undefined : { color: hand(member.colour) }}>{r.template.name}</span>
                                  <span className="tabular shrink-0 text-lg font-semibold text-ink-soft">{taskTime(hhmm(startMin))}</span>
                                  <Emoji emoji={r.progress.next?.icon ?? r.steps[0]?.icon ?? "✨"} className="size-8" />
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ))}
                      />
                    )
                  ) : showing === "bucket" && bucket ? (
                    <PanelPages
                      pages={pagesOf(bucket, BUCKET_ROWS).map((rows, p) => (
                        <ul key={p} className="flex flex-col">
                          {rows.map((row) => (
                            <li key={row.key} className="flex min-h-16 items-center gap-3 border-b border-frame last:border-0">
                              <span className="min-w-0 flex-1 truncate font-hand text-[1.375rem] text-ink">{row.title}</span>
                              <span className={`tabular shrink-0 text-lg font-bold ${row.date ? "text-ink-soft" : "text-danger"}`}>
                                {row.date ? weekdayShort(row.date, household) : "No room"}
                              </span>
                              <Emoji emoji={row.icon} className="size-8" />
                            </li>
                          ))}
                        </ul>
                      ))}
                    />
                  ) : showing === "habits" ? (
                    <HabitsBox today={today} returnTo={returnTo} />
                  ) : showing === "health" ? (
                    <HealthPanelBox household={household} today={today} />
                  ) : groceries ? (
                    <GroceryView initial={groceries} compact rows={8} />
                  ) : null}
                </div>
              </>
            )}
            {/* To-do, Chores and the other lists add right here, like the grocery list (Connor, 2026-11-16). */}
            {showing === "bucket" && choresList ? <AddRow listId={choresList.id} returnTo={returnTo} label="Add a chore" /> : null}
            {showing !== "bucket" && addListId ? <AddRow listId={addListId} returnTo={returnTo} label={`Add to ${box.name}`} /> : null}
            {switcher}
          </>
        )}
      </section>
    </aside>
  );
}

/** Splits rows into pages of a set size (at least one page). */
/** The Lists screen with a list picked (or the first list). */
function listHref(listId: string | null | undefined): string {
  return listId ? `/lists?list=${listId}` : "/lists";
}

function pagesOf<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

/** One chore waiting in the bucket, and the day the planner has it on (null: no room in the next two weeks). */
type BucketRow = { key: string; title: string; icon: string; date: LocalDate | null };

/** The chore bucket: chores the planner has placed after today, soonest first, then the ones with no room. */
async function bucketRows(household: Household, today: LocalDate, todos: Todo[]): Promise<BucketRow[]> {
  const { chores, plan } = await choreSchedule(household, today, household.settings.timeZone, false);
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const nameOf = (id: string, kind: "generated" | "one-off") => {
    if (kind === "generated") {
      const c = choreById.get(id);
      return c ? { title: c.name, icon: c.icon ?? "🧹" } : null;
    }
    const t = todoById.get(id);
    return t && t.status === "open" ? { title: t.title, icon: t.icon ?? "🧹" } : null;
  };
  const rows: BucketRow[] = [];
  const seen = new Set<string>();
  for (const day of plan.days) {
    if (day.date <= today) continue;
    for (const item of day.items) {
      if (seen.has(item.id)) continue;
      const named = nameOf(item.id, item.kind);
      if (!named) continue;
      seen.add(item.id);
      rows.push({ key: `${item.kind}:${item.id}`, ...named, date: day.date });
    }
  }
  for (const id of plan.unplaced) {
    if (seen.has(id)) continue;
    const named = nameOf(id, "generated") ?? nameOf(id, "one-off");
    if (named) rows.push({ key: `unplaced:${id}`, ...named, date: null });
  }
  return rows;
}

function weekdayShort(date: LocalDate, household: Household): string {
  return new Intl.DateTimeFormat(household.settings.locale, { timeZone: household.settings.timeZone, weekday: "short" }).format(
    zonedToUtc(date, "12:00", household.settings.timeZone),
  );
}

/**
 * The add box at the bottom of a Today panel list: a bare field and Add
 * (Connor, 2026-11-11: no placeholder words). `tucked` (the Glance panel):
 * folded away until the round + in the title row puts the cursor in it.
 */
function AddRow({ id, listId, returnTo, dueDate, label, tucked = false }: { id?: string; listId: string; returnTo: string; dueDate?: LocalDate; label: string; tucked?: boolean }) {
  return (
    <form
      action={addTodo}
      className={`flex shrink-0 items-center gap-2 ${
        tucked
          ? "max-h-0 overflow-hidden focus-within:mt-2 focus-within:max-h-[calc(var(--touch-target)+1rem)] focus-within:border-t focus-within:border-frame focus-within:pt-2"
          : "mt-2 border-t border-frame pt-2"
      }`}
    >
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {dueDate ? (
        <>
          <input type="hidden" name="dueDate" value={dueDate} />
          <input type="hidden" name="dateKind" value="start" />
        </>
      ) : null}
      <input
        id={id}
        name="title"
        required
        maxLength={120}
        aria-label={label}
        className="min-h-[var(--touch-target)] min-w-0 flex-1 rounded-[var(--radius)] border-2 border-frame bg-board px-3 font-hand text-xl text-ink outline-none focus:border-accent"
      />
      <button className="min-h-[var(--touch-target)] shrink-0 rounded-[var(--radius)] bg-primary px-4 text-lg font-bold text-primary-ink">Add</button>
    </form>
  );
}

/** The Health box: trackers and the last two days of entries, for logging. */
async function HealthPanelBox({ household, today }: { household: Household; today: LocalDate }) {
  const { locale, timeZone } = household.settings;
  const now = new Date();
  const { trackers, members } = await loadTrackers();
  if (trackers.length === 0) return null;
  const logs = await loadHealthLogs(zonedToUtc(addDays(today, -2), "00:00", timeZone), new Date(now.getTime() + 60_000));
  return (
    <HealthBox
      trackers={trackers}
      members={members}
      logs={logs}
      now={now.toISOString()}
      dayStart={zonedToUtc(today, "00:00", timeZone).toISOString()}
      locale={locale}
      timeZone={timeZone}
    />
  );
}
