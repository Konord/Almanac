import type { ReactNode } from "react";
import Link from "next/link";
import {
  CaretLeft,
  CaretRight,
  Check,
  CloudSun,
} from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { strong } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { dailyListPart } from "@/lib/routines";
import { dailyOrder, onDailyList, onItsList, timedToday } from "@/lib/todos";
import { toggleTodo } from "../chores/actions";
import { loadTodos, type Todo } from "../chores/data";
import { loadMealBasics, loadMeals, mealIcon, mealName } from "../meals/data";
import { mealsForRoutines, placeTodayMeals, startCooking } from "../meals/today";
import { tickSteps, toggleStep } from "../routines/actions";
import { loadRoutines } from "../routines/data";
import { floatingRoutines } from "../routines/floating";
import { pickPanelTab, setPanelOpen } from "./actions";

/**
 * The Today panel: a column on the left of the calendar with three parts.
 *
 * 1. The top never changes: the day, the big date, the weather and the clock.
 * 2. The working part shows the daily list, "Up next" or one of the lists.
 *    Chips switch between them, and the screen remembers the last one picked.
 *    The daily list is today's tasks from every list: chores, heads-ups and
 *    list tasks for today (tasks rework, 2026-11-09). Timed ones come first,
 *    with the time beside them; a task for one person is in their colour.
 *    Routines switched to "Show on daily list" join it (tasks rework,
 *    step 3), and so does the cook's "Start dinner".
 *    A routine's checklist can take this part over for a while.
 * 3. The bottom box shows the next meal. (Spotify comes later.)
 *
 * The panel can be closed, leaving the calendar the whole width. Each screen
 * remembers whether it's open.
 */

/** One thing coming up today, ready to show. */
export type UpNextItem = {
  id: string;
  title: string;
  emoji: string;
  time: string;
  colour: string;
};

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
/** How many list chips fit beside "Today" (and "Up next", which needs one of their places). */
const LIST_CHIPS = 3;

export async function TodayPanel({
  household,
  today,
  upNext,
  tab,
  returnTo,
  day = false,
  routine,
}: {
  household: Household;
  today: LocalDate;
  /** Today's timed events still to come, soonest first. */
  upNext: UpNextItem[];
  /** "upnext" or a list's id: what this screen showed last. */
  tab: string;
  /** This page's address, to come back to after a tap. */
  returnTo: string;
  /** On the Agenda view the timeline already shows today, so the panel has no "Up next". */
  day?: boolean;
  /** A routine's checklist (from tapping its block), shown instead of the list. */
  routine?: ReactNode;
}) {
  const { locale, timeZone } = household.settings;
  const supabase = await createClient();
  const [{ lists, todos }, basics, meals, { data: memberRows }, routineData] = await Promise.all([
    loadTodos(),
    loadMealBasics(),
    loadMeals(today, addDays(today, 1)),
    supabase.from("members").select("id, colour"),
    loadRoutines(today),
  ]);
  const colourOf = new Map((memberRows ?? []).map((m) => [m.id, m.colour]));

  // The tab, if its list still exists; Up next where it's offered; otherwise the daily list.
  const list = lists.find((l) => l.id === tab);
  const showing = list ? list.id : tab === "upnext" && !day ? "upnext" : "today";
  // The first few lists get chips, always including the one showing.
  const chipCount = day ? LIST_CHIPS : LIST_CHIPS - 1;
  const chipLists = lists.slice(0, chipCount);
  if (list && !chipLists.includes(list)) chipLists[chipCount - 1] = list;

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
  const nextMeal = meals
    .filter((m) => m.status === "planned")
    .map((m) => ({
      meal: m,
      at: times.get(m.meal_time_id)?.usual_time ?? "18:00",
      timeName: times.get(m.meal_time_id)?.name ?? "Meal",
    }))
    .filter((m) => m.meal.date > today || m.at >= hourAgo)
    .sort((a, b) =>
      a.meal.date === b.meal.date
        ? a.at < b.at
          ? -1
          : 1
        : a.meal.date < b.meal.date
          ? -1
          : 1,
    )[0];

  const now = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...o }).format(now);
  const mealTime = nextMeal
    ? new Intl.DateTimeFormat(locale, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      })
        .format(zonedToUtc(nextMeal.meal.date, nextMeal.at, timeZone))
        .replace(":00", "")
    : "";

  const taskTime = (time: string) =>
    new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" })
      .format(zonedToUtc(today, time.slice(0, 5), timeZone))
      .replace(":00", "");

  const tabButton = (value: string, label: string) => (
    <form key={value} action={pickPanelTab}>
      <input type="hidden" name="tab" value={value} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        aria-pressed={showing === value}
        className={`min-h-[var(--touch-target)] max-w-44 truncate rounded-full px-4.5 text-base font-bold ${
          showing === value ? "bg-ink text-board" : "bg-board text-ink-soft"
        }`}
      >
        {label}
      </button>
    </form>
  );

  return (
    <aside
      aria-label="Today"
      className="relative flex w-[30rem] shrink-0 flex-col rounded-[1.75rem] bg-rail px-7 pt-6 pb-6 max-lg:w-full"
    >
      {/* 1. The top: never changes. */}
      <div className="flex items-end gap-4">
        <span className="text-[8.5rem] leading-[0.85] font-extrabold tracking-[-0.3rem] text-ink">
          {fmt({ day: "numeric" })}
        </span>
        <span className="flex flex-col pb-1.5">
          <span className="text-2xl font-bold text-ink-muted">
            {fmt({ weekday: "long" })}
          </span>
          <span className="text-3xl font-extrabold text-ink">
            {fmt({ month: "long" })}
          </span>
        </span>
      </div>
      <div className="mt-5 flex items-center gap-3 text-xl font-semibold text-ink-muted">
        <CloudSun size="2.5rem" aria-hidden />
        <span>Weather soon</span>
        <span className="ml-auto text-3xl font-bold">
          <HeaderClock locale={locale} timeZone={timeZone} />
        </span>
      </div>

      {/* 2. The working part: the daily list, Up next or a list. */}
      {routine ? (
        <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.375rem] bg-board px-5 py-3">{routine}</div>
      ) : (
      <>
      <nav
        aria-label="What the panel shows"
        className="mt-6 flex flex-wrap gap-2"
      >
        {tabButton("today", "Today")}
        {day ? null : tabButton("upnext", "Up next")}
        {chipLists.map((l) => tabButton(l.id, l.name))}
      </nav>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.375rem] bg-board px-5 py-3">
        {showing === "upnext" ? (
          upNext.length === 0 ? (
            <p className="py-3 text-lg text-ink-muted">
              Nothing else on today.
            </p>
          ) : (
            <ul className="flex flex-col">
              {upNext.slice(0, ROWS).map((item, i) => (
                <li
                  key={item.id}
                  className="flex min-h-16 items-center gap-3.5 border-b border-panel last:border-0"
                >
                  <Emoji
                    emoji={item.emoji}
                    className={i === 0 ? "size-12" : "size-9"}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate font-bold text-ink ${i === 0 ? "text-2xl" : "text-xl"}`}
                  >
                    {item.title}
                  </span>
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: strong(item.colour) }}
                    aria-hidden
                  />
                  <span className="shrink-0 text-lg font-bold text-ink-muted tabular-nums">
                    {item.time}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : open.length === 0 ? (
          <p className="py-3 text-lg text-ink-muted">
            {showing === "today" ? "Nothing on today's list." : "Nothing on this list."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {open.slice(0, ROWS).map((row) => {
              const colour =
                row.kind === "todo"
                  ? row.todo.assignee_id
                    ? colourOf.get(row.todo.assignee_id)
                    : undefined
                  : (row.colour ?? undefined);
              const title = row.kind === "todo" ? row.todo.title : row.title;
              const icon = row.kind === "todo" ? row.todo.icon : row.kind === "start" ? "🔪" : row.icon;
              const box = (
                <span className="flex size-8 items-center justify-center rounded-[0.625rem] border-[2.5px] border-check-border text-transparent hover:text-check-border">
                  <Check size="1.125rem" weight="bold" aria-hidden />
                </span>
              );
              return (
                <li
                  key={row.key}
                  className="flex min-h-16 items-center gap-2 border-b border-panel last:border-0"
                >
                  {row.kind === "todo" ? (
                    <form action={toggleTodo}>
                      <input type="hidden" name="id" value={row.todo.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button aria-label={`Tick off ${title}`} className="flex size-[var(--touch-target)] items-center justify-center">
                        {box}
                      </button>
                    </form>
                  ) : row.kind === "routine" ? (
                    <form action={row.stepIds.length === 1 ? toggleStep : tickSteps}>
                      <input type="hidden" name="memberId" value={row.memberId} />
                      {row.stepIds.map((id) => (
                        <input key={id} type="hidden" name="stepId" value={id} />
                      ))}
                      <input type="hidden" name="templateId" value={row.templateId} />
                      <input type="hidden" name="date" value={today} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button aria-label={`Tick off ${title}`} className="flex size-[var(--touch-target)] items-center justify-center">
                        {box}
                      </button>
                    </form>
                  ) : (
                    // Start dinner opens the cook's view.
                    <Link
                      href={row.href}
                      aria-label={`Open ${title}`}
                      className="flex size-[var(--touch-target)] items-center justify-center text-ink-muted"
                    >
                      <CaretRight size="1.5rem" weight="bold" aria-hidden />
                    </Link>
                  )}
                  {icon ? <Emoji emoji={icon} className="size-8" /> : null}
                  <span
                    className="line-clamp-2 min-w-0 flex-1 font-hand text-2xl leading-[1.1] break-words text-ink"
                    style={colour ? { color: strong(colour) } : undefined}
                  >
                    {title}
                  </span>
                  {row.kind === "routine" && row.count ? (
                    <span className="shrink-0 text-base font-bold text-ink-muted tabular-nums">{row.count}</span>
                  ) : null}
                  {row.time ? (
                    <span className="shrink-0 text-lg font-bold text-ink-muted tabular-nums">
                      {row.kind === "todo" && row.todo.date_kind === "due" ? "by " : ""}
                      {taskTime(row.time)}
                    </span>
                  ) : row.kind === "todo" && row.todo.must_do ? (
                    <span className="shrink-0 rounded-full bg-now px-2.5 py-1 text-sm font-extrabold text-white">Must do</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {(() => {
          const extra =
            showing === "upnext" ? upNext.length - ROWS : open.length - ROWS;
          const href = showing === "upnext" ? "/" : showing === "today" ? "/lists" : `/lists?list=${showing}`;
          return (
            <Link
              href={href}
              className="mt-auto flex min-h-11 items-center text-lg font-bold text-accent"
            >
              {extra > 0
                ? `+${extra} more`
                : showing === "upnext"
                  ? "Open the agenda"
                  : showing === "today"
                    ? "Open the lists"
                    : "Open the list"}
            </Link>
          );
        })()}
      </div>
      </>
      )}

      {/* 3. The bottom box: the next meal. */}
      <Link
        href={nextMeal ? `/review?meal=${nextMeal.meal.id}` : `/review?week=${today}`}
        className="mt-4 flex min-h-22 items-center gap-4 rounded-[1.375rem] bg-meal px-5 py-3 text-meal-ink"
      >
        {nextMeal ? (
          <>
            <Emoji
              emoji={mealIcon(nextMeal.meal, recipes, categories)}
              className="size-14"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-extrabold tracking-[0.08rem] uppercase opacity-75">
                {nextMeal.timeName}
                {nextMeal.meal.date > today ? " tomorrow" : ""} · {mealTime}
              </span>
              <span className="truncate text-2xl font-extrabold">
                {mealName(nextMeal.meal, recipes, categories)}
              </span>
            </span>
          </>
        ) : (
          <span className="text-xl font-bold">
            No meal planned yet. Plan meals
          </span>
        )}
      </Link>

      {/* Close: the calendar takes the whole width. */}
      <form
        action={setPanelOpen}
        className="absolute top-1/2 -right-5.5 z-10 -translate-y-1/2 max-lg:hidden"
      >
        <input type="hidden" name="open" value="0" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-label="Hide the Today panel"
          className="flex h-22 w-11 items-center justify-center rounded-full border border-frame bg-board text-ink-muted shadow-[0_1px_3px_rgba(30,35,45,0.12)]"
        >
          <CaretLeft size="1.5rem" weight="bold" aria-hidden />
        </button>
      </form>
    </aside>
  );
}

/** The tab on the left edge that opens the panel again. */
export function OpenPanelTab({ returnTo }: { returnTo: string }) {
  return (
    <form
      action={setPanelOpen}
      className="fixed top-1/2 left-0 z-30 -translate-y-1/2 max-lg:hidden"
    >
      <input type="hidden" name="open" value="1" />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        aria-label="Show the Today panel"
        className="flex h-22 w-9 items-center justify-center rounded-r-full border border-l-0 border-frame bg-rail text-ink-muted shadow-[0_1px_3px_rgba(30,35,45,0.12)]"
      >
        <CaretRight size="1.5rem" weight="bold" aria-hidden />
      </button>
    </form>
  );
}
