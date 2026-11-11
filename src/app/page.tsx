import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheck, Plus, SunHorizon, X } from "@phosphor-icons/react/dist/ssr";
import {
  AppFrame,
  Avatar,
  Emoji,
  Notice,
  ProgressBar,
  ScreenHeader,
  Segmented,
  firstParam,
  LoadingOutline,
} from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { RememberDisplay } from "@/components/remember-display";
import { WallRefresh } from "@/components/wall-refresh";
import { EVERYONE_COLOUR, soft } from "@/lib/colours";
import { eventEmoji } from "@/lib/emoji";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf, type LocalDate } from "@/lib/time";
import { devicePeople, itemsForPeople, loadCalendar, rangeOf } from "./calendar/data";
import { PeopleButton, PeopleChooser } from "./calendar/people-filter";
import { Sheet } from "@/components/sheet";
import type { CalendarItem, Member } from "./calendar/types";
import { loadTodos, type Todo } from "./chores/data";
import { onCalendar } from "@/lib/todos";
import { loadSpecialDays } from "./holidays/data";
import { loadRoutines, personDay, type RoutineData } from "./routines/data";
import { loadMealBasics, loadMeals, type Meal, type MealBasics } from "./meals/data";
import { MealBlock, mealsForRoutines, placeTodayMeals, startCooking } from "./meals/today";
import { OpenPanelTab, TodayPanel } from "./today-panel/panel";
import { readPanelPrefs } from "./today-panel/prefs";
import { chainPositions, ExpandedRoutine, floatingDay, RoutineChain } from "./routines/floating";
import { RoutineChecklist } from "./routines/routine-checklist";
import { dayProgress } from "./routines/people-row";
import { PlacingBar, QuickAddSheet, readAdding } from "./calendar/adding";
import { PlaceAcrossPeople } from "@/components/place-across-people";
import { PendingSpans } from "@/components/pending-block";
import { layoutSpans, memberRuns, spanBox } from "@/lib/calendar-layout";
import type { QuickDefaults } from "./calendar/forms";
import { syncEventAndChoreHeadsUps } from "./heads-ups/sync";
import { choreSchedule } from "./chores/plan";
import { reviewReminder } from "./review/data";
import {
  EventBlock,
  EventPoint,
  HourLines,
  isPointEvent,
  minutesIntoDay,
  NowLine,
  Ribbon,
  eventsOnDay,
  isAllDayStyle,
  nowPercent,
  shortTime,
  timelineRange,
  TodoPoint,
  taskMinute,
} from "./calendar/views";

/** The space between people's columns on the timeline. */
const COLUMN_GAP = "0.625rem";

/**
 * The Agenda view (was the Day view): the Today panel on the left with the
 * daily list, and a timeline of today with a column per person filling the
 * rest: events, routines, timed tasks and point events.
 */
export default function Home(props: PageProps<"/">) {
  return (
    <AppFrame section="today">
      <Suspense fallback={<LoadingOutline />}>
        <Today searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Today({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);

  // Heads-ups due soon become to-dos before the lists are read.
  await syncEventAndChoreHeadsUps(household);
  const days = [today];
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  // The chore generator puts today's chores on the daily list before the tasks are read.
  await choreSchedule(household, today, timeZone);
  const [{ members, templates, dayKinds, items }, routineData, todoData, mealBasics, todayMeals, reviewNow] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
    loadTodos(),
    loadMealBasics(),
    loadMeals(today, today),
    reviewReminder(household, today, now),
  ]);
  const todaySpecials = (await loadSpecialDays(today, today)).get(today) ?? [];
  // The person filter: just some people's columns (and things for everyone).
  const people = await devicePeople(members);
  const shown = itemsForPeople(items, people);
  const shownMembers = people.length === 0 ? members : members.filter((m) => people.includes(m.id));

  const longDate = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const todayItems = sortForDay(eventsOnDay(shown, today, timeZone), timeZone);
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const { placing, pending, templateHref } = readAdding(params, household.settings, members, templates, "/");
  // The Survival button and its card are hidden for now (Connor, 2026-11-10);
  // they come back with backup meals.
  const openRoutine = firstParam(params.routine) ?? "";
  const openMember = firstParam(params.member) ?? "";
  const expand = firstParam(params.expand) ?? "";
  const routineOpen = Boolean(openRoutine && openMember) && !placing;

  // The Today panel on the left (no Up next here: the timeline already shows today).
  const panelPrefs = await readPanelPrefs();

  return (
    <>
      <RememberDisplay display="agenda" />
      <WallRefresh timeZone={timeZone} />
      <div className="flex flex-col gap-7 lg:min-h-0 lg:flex-1 lg:flex-row">
      {panelPrefs.open || routineOpen ? (
        <TodayPanel
          household={household}
          today={today}
          upNext={[]}
          tab={panelPrefs.tab}
          returnTo="/"
          day
          routine={
            routineOpen ? (
              <RoutineChecklist
                data={routineData}
                memberId={openMember}
                templateId={openRoutine}
                date={today}
                today={today}
                page={Number(firstParam(params.rpage) ?? 0) || 0}
                closeHref="/"
                hereHref={(p) => `/?routine=${openRoutine}&member=${openMember}${p ? `&rpage=${p}` : ""}`}
              />
            ) : undefined
          }
        />
      ) : (
        <OpenPanelTab returnTo="/" />
      )}
      <div className={`flex min-w-0 flex-1 flex-col gap-3.5 lg:min-h-0 ${panelPrefs.open ? "" : "lg:pl-5"}`}>
      <ScreenHeader title={panelPrefs.open ? "Agenda" : longDate}>
        {panelPrefs.open ? null : <HeaderClock locale={locale} timeZone={timeZone} />}
        {/* A holiday or birthday today: a big ribbon right by the title. */}
        {todaySpecials.length > 0 ? (
          <div className="flex max-w-[28rem] min-w-0 shrink">
            <Ribbon special={todaySpecials[0]} more={todaySpecials.length - 1} big />
          </div>
        ) : null}
        <DayPill data={routineData} today={today} />
        {routineData.breaks
          .filter((b) => b.start_date <= today && today <= b.end_date)
          .slice(0, 1)
          .map((b) => (
            <Link
              key={b.id}
              href="/routines/manage?tab=breaks"
              title={`A break until ${b.end_date}`}
              className="inline-flex min-h-[var(--touch-target)] max-w-64 shrink-0 items-center gap-2 rounded-2xl border-2 border-dashed border-frame bg-rail px-4 text-base font-bold text-ink"
            >
              <Emoji emoji={eventEmoji(b.icon, b.name)} className="size-7" />
              <span className="truncate">{b.name}</span>
            </Link>
          ))}
        {reviewNow ? (
          <Link
            href="/review"
            className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_12%,white)] px-4 text-base font-bold text-accent"
          >
            <CalendarCheck size="1.5rem" weight="bold" aria-hidden />
            Weekly review
          </Link>
        ) : null}
        <div className="flex items-center gap-3 lg:ml-auto">
          <PeopleButton members={members} shown={people} href="/?panel=people" />
          <Segmented
            label="How much to show"
            options={[
              { href: "/", label: "Agenda", active: true },
              {
                href: `/calendar?view=week&date=${today}`,
                label: "Week",
                active: false,
              },
              {
                href: `/calendar?view=month&date=${today}`,
                label: "Month",
                active: false,
              },
            ]}
          />
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {placing ? <PlacingBar hint="Tap someone's column at a time to add an event for them, or drag down to set how long." cancelHref="/" /> : null}

      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <PeopleTimeline
          allDay={todayItems.filter((e) => isAllDayStyle(e, timeZone))}
          items={todayItems}
          members={shownMembers}
          routineData={routineData}
          today={today}
          now={now}
          household={household}
          placing={placing}
          pending={pending}
          meals={todayMeals}
          mealBasics={mealBasics}
          expand={expand}
          timedTodos={todoData.todos.filter(
            (t) => t.due_date === today && (onCalendar(t) || (t.status === "open" && t.date_kind === "start" && t.at_time !== null)),
          )}
        />
      </div>
      </div>
      </div>

      {/* Add button, bottom right: starts adding mode, or cancels it. */}
      <Link
        href={placing ? "/" : "/?placing=1"}
        scroll={false}
        aria-label={placing ? "Stop adding" : "Add an event"}
        title={placing ? "Stop adding" : "Add an event"}
        className={`fixed right-10 bottom-8.5 z-30 flex size-23 items-center justify-center rounded-full text-white shadow-[0_0.5rem_1.375rem_rgba(30,35,45,0.28)] ${
          placing ? "bg-accent" : "bg-ink"
        }`}
      >
        {placing ? <X size="2.625rem" weight="bold" aria-hidden /> : <Plus size="2.625rem" weight="bold" aria-hidden />}
      </Link>


      {firstParam(params.panel) === "people" ? (
        <Sheet title="Showing" closeHref="/" narrow>
          <PeopleChooser members={members} shown={people} returnTo="panel=people" returnPath="/" />
        </Sheet>
      ) : null}

      {pending ? (
        <QuickAddSheet pending={pending} members={members} dayKinds={dayKinds} templates={templates} templateHref={templateHref} closeHref="/" returnTo="" returnPath="/" />
      ) : null}

    </>
  );
}

/**
 * Today as a timeline with one column per person. An event for several
 * people next to each other is one bubble across their columns; one for
 * everyone stretches across the whole row.
 */
function PeopleTimeline({
  allDay,
  items,
  members,
  routineData,
  today,
  now,
  household,
  placing,
  pending,
  meals,
  mealBasics,
  expand,
  timedTodos,
}: {
  allDay: CalendarItem[];
  items: CalendarItem[];
  members: Member[];
  routineData: RoutineData;
  today: LocalDate;
  now: Date;
  household: Household;
  /** Adding mode: each column becomes a place to tap. */
  placing: boolean;
  /** The event being added, shown as a dashed outline. */
  pending: QuickDefaults | null;
  /** Today's planned meals. */
  meals: Meal[];
  mealBasics: MealBasics;
  /** The routine opened up to tick its steps, if any. */
  expand: string;
  /** To-dos that start at a time today: points on the timeline, no length. */
  timedTodos: Todo[];
}) {
  const { timeZone } = household.settings;
  // Point events (a time, no length) are dots: they don't make anyone busy or push routines.
  const points = items.filter((e) => !isAllDayStyle(e, timeZone) && isPointEvent(e));
  const timed = items.filter((e) => !isAllDayStyle(e, timeZone) && !isPointEvent(e));
  const memberIds = new Set(members.map((m) => m.id));
  const forEveryone = timed.filter((e) => !e.member_ids.some((id) => memberIds.has(id)));
  // Meals move around the plans of the people eating them.
  const placedMeals = placeTodayMeals(
    meals,
    mealBasics,
    eventsOnDay(timed, today, timeZone).map((e) => ({
      startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
      endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
      title: e.title,
      memberIds: e.member_ids.filter((id) => memberIds.has(id)),
    })),
  );
  // Routines float around each person's own plans, the ones for everyone, and their meals.
  const dayMeals = mealsForRoutines(placedMeals);
  const dayFor = new Map(
    members.map((m) => [
      m.id,
      floatingDay(
        routineData,
        m.id,
        today,
        [...timed.filter((e) => e.member_ids.includes(m.id)), ...forEveryone],
        timeZone,
        household.settings.routineFlexMinutes,
        dayMeals,
      ),
    ]),
  );
  const routinesFor = new Map([...dayFor].map(([id, d]) => [id, d.routines]));
  const placements = [
    ...[...routinesFor.values()].flat().map((r) => r.placement),
    ...placedMeals,
  ];
  const range = timelineRange(timed, [today], timeZone);
  const first = Math.min(range.first, ...placements.map((p) => Math.floor(p.startMin / 60)), ...timedTodos.map((t) => Math.floor(taskMinute(t) / 60)));
  const last = Math.max(range.last, ...placements.map((p) => Math.ceil(p.endMin / 60)), ...timedTodos.map((t) => Math.ceil((taskMinute(t) + 1) / 60)));
  // No "Everyone" column (Connor, 2026-11-05): things for everyone span the row.
  // A household with nobody in it yet still gets one column to add things to.
  const columns: {
    id: string;
    name: string;
    colour: string;
    icon?: string | null;
    progress?: { done: number; total: number };
  }[] =
    members.length > 0
      ? members.map((m) => ({ id: m.id, name: m.name, colour: m.colour, icon: m.icon, progress: dayProgress(routineData, m.id, today) }))
      : [{ id: "everyone", name: "Everyone", colour: EVERYONE_COLOUR }];
  const columnIds = columns.map((c) => c.id);
  const colourOf = new Map(columns.map((c) => [c.id, c.colour]));
  const placedEvents = layoutSpans([
    ...sortForDay(eventsOnDay(timed, today, timeZone), timeZone).flatMap((e) =>
      memberRuns(e.member_ids, columnIds).map(([c0, c1]) => ({
        id: `${e.id}|${c0}`,
        startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
        endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
        c0,
        c1,
      })),
    ),
    // A meal is its eating time. One for everyone (no one picked) spans the whole row.
    ...placedMeals.flatMap((m) =>
      memberRuns(m.memberIds, columnIds).map(([c0, c1]) => ({
        id: `meal:${m.id}|${c0}`,
        startMin: m.startMin,
        endMin: m.endMin,
        c0,
        c1,
      })),
    ),
  ]);
  const mealById = new Map(placedMeals.map((m) => [m.id, m]));
  const eventById = new Map(timed.map((e) => [e.id, e]));
  const span = (last - first) * 60;
  const editLink = (e: CalendarItem) =>
    `/calendar?view=week&date=${today}&edit=${e.series_id}${e.occurrence_date ? `&occ=${e.occurrence_date}` : ""}`;

  return (
    <section
      aria-label="Today's timeline"
      className="flex min-h-[36rem] flex-col max-lg:overflow-x-auto lg:min-h-0 lg:min-w-0 lg:flex-1"
    >
      <div className="flex flex-1 flex-col max-lg:min-w-[40rem] lg:min-h-0">
        <div className="flex shrink-0 gap-2.5 pl-16.5">
          {columns.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-1 basis-0 items-center gap-2.5">
              <Avatar name={c.name} colour={c.colour} icon={c.icon} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-between gap-1 text-base font-bold text-ink">
                  <span className="truncate">{c.name}</span>
                  {c.progress?.total ? (
                    <span className="font-semibold text-ink-muted">
                      {c.progress.done}/{c.progress.total}
                    </span>
                  ) : null}
                </div>
                {c.progress ? (
                  <ProgressBar done={c.progress.done} total={c.progress.total} colour={c.colour} />
                ) : (
                  <div className="h-2" />
                )}
              </div>
            </div>
          ))}
        </div>
        {allDay.length > 0 ? (
          <div className="mt-4 flex shrink-0 gap-2 overflow-hidden pl-16.5" aria-label="All day">
            {allDay.map((e) => (
              <Link
                key={e.id}
                href={editLink(e)}
                className="flex h-10 min-w-0 items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink"
                style={{ background: soft(EVERYONE_COLOUR) }}
              >
                <Emoji emoji={eventEmoji(e.icon, e.title)} className="size-7" />
                <span className="truncate">{e.title}</span>
              </Link>
            ))}
          </div>
        ) : null}
        <div className="relative mt-6.5 mb-1 flex min-h-0 flex-1 gap-2.5 pl-16.5">
          <HourLines first={first} last={last} />
          {columns.map((c) => (
            <div key={c.id} data-drop-day={today} data-drop-member={c.id} className="relative min-w-0 flex-1 basis-0">
              {(() => {
                const mine = routinesFor.get(c.id) ?? [];
                const tops = chainPositions(mine, first, last);
                return mine.map((r) =>
                  r.template.id === expand ? (
                    <ExpandedRoutine
                      key={r.assignment.id}
                      routine={r}
                      memberId={c.id}
                      colour={c.colour}
                      date={today}
                      top={tops.get(r.assignment.id) ?? 0}
                    />
                  ) : (
                  <RoutineChain
                    key={r.assignment.id}
                    routine={r}
                    colour={c.colour}
                    date={today}
                    top={tops.get(r.assignment.id) ?? 0}
                    household={household}
                  />
                  ),
                );
              })()}
            </div>
          ))}
          {/* Events sit over the columns so one bubble can span several people. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 left-16.5">
            {placedEvents.map((block) => {
              const top = ((block.startMin - first * 60) / span) * 100;
              // A meal is only its eating time; give it room for its name.
              const height = (Math.max(block.endMin - block.startMin, block.id.startsWith("meal:") ? 36 : 30) / span) * 100;
              if (block.id.startsWith("meal:")) {
                const meal = mealById.get(block.id.slice(5).split("|")[0])!;
                return (
                  <div key={block.id} className="pointer-events-auto">
                    <MealBlock
                      meal={meal}
                      date={today}
                      household={household}
                      first={first}
                      last={last}
                      style={spanBox(block.c0, block.c1, columns.length, COLUMN_GAP, block.lane, block.lanes)}
                    />
                  </div>
                );
              }
              const event = eventById.get(block.id.split("|")[0])!;
              const run = columnIds.slice(block.c0, block.c1 + 1);
              return (
                <div key={block.id} className="pointer-events-auto">
                  <EventBlock
                    event={event}
                    colour={colourOf.get(run[0]) ?? EVERYONE_COLOUR}
                    colours={run.map((id) => colourOf.get(id) ?? EVERYONE_COLOUR)}
                    household={household}
                    href={editLink(event)}
                    big
                    drag={{
                      day: today,
                      people: { columns: columnIds, run, gap: COLUMN_GAP },
                      start: block.startMin,
                      minutes: block.endMin - block.startMin,
                      first,
                      last,
                    }}
                    style={{
                      top: `calc(${top}% + 3px)`,
                      height: `calc(${height}% - 6px)`,
                      ...spanBox(block.c0, block.c1, columns.length, COLUMN_GAP, block.lane, block.lanes),
                    }}
                  />
                </div>
              );
            })}
            {points.flatMap((e) => {
              const minute = minutesIntoDay(new Date(e.starts_at), timeZone);
              if (minute < first * 60 || minute > last * 60) return [];
              const runs = memberRuns(e.member_ids, columnIds);
              return runs.map(([c0, c1]) => (
                <EventPoint
                  key={`${e.id}|${c0}`}
                  event={e}
                  colour={colourOf.get(columnIds[c0]) ?? EVERYONE_COLOUR}
                  household={household}
                  href={editLink(e)}
                  top={((minute - first * 60) / span) * 100}
                  box={spanBox(c0, c1, columns.length, COLUMN_GAP)}
                  big
                />
              ));
            })}
            {/* The cook's "Start dinner": a point in their column. */}
            {placedMeals.flatMap((m) => {
              const start = startCooking(m);
              const c = m.cookId ? columnIds.indexOf(m.cookId) : -1;
              if (!start || c < 0 || start.minute < first * 60 || start.minute > last * 60) return [];
              return [
                <Link
                  key={`start:${m.id}`}
                  href={start.href}
                  title={start.title}
                  className="pointer-events-auto absolute z-[2] flex h-8 -translate-y-1/2 items-center gap-1.5 overflow-hidden"
                  style={{ top: `${((start.minute - first * 60) / span) * 100}%`, ...spanBox(c, c, columns.length, COLUMN_GAP) }}
                >
                  <span className="size-3.5 shrink-0 rounded-full border-[3px] border-meal-ink bg-meal" aria-hidden />
                  <Emoji emoji="🔪" className="size-6" />
                  <span className="min-w-0 truncate rounded-lg bg-board/90 px-1.5 font-hand text-xl leading-none text-meal-ink">{start.title}</span>
                </Link>,
              ];
            })}
            {timedTodos.map((t) => {
              const minute = taskMinute(t);
              if (minute < first * 60 || minute > last * 60) return null;
              const c = t.assignee_id ? columnIds.indexOf(t.assignee_id) : -1;
              return (
                <TodoPoint
                  key={t.id}
                  todo={t}
                  top={((minute - first * 60) / span) * 100}
                  box={c >= 0 ? spanBox(c, c, columns.length, COLUMN_GAP) : spanBox(0, columns.length - 1, columns.length, COLUMN_GAP)}
                  colour={c >= 0 ? columns[c].colour : EVERYONE_COLOUR}
                />
              );
            })}
            <div className="pointer-events-auto">
              <PendingSpans day={today} columns={columnIds} first={first} last={last} gap={COLUMN_GAP} />
            </div>
            {placing || pending ? (
              <div className="pointer-events-auto">
                <PlaceAcrossPeople
                  columns={columns.map((c) => ({ id: c.id, name: c.name }))}
                  href={`/?add=${today}`}
                  first={first}
                  last={last}
                  defaultMinutes={household.settings.defaultEventMinutes}
                  gap={COLUMN_GAP}
                  moving={Boolean(pending)}
                />
              </div>
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 left-14.5">
            <NowLine percent={nowPercent(now, first, last, timeZone)} label={`Now, ${shortTime(now, household)}`} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Today's kind of day next to the clock ("Office day"), or each person's
 * when they differ. Tapping it opens Set days.
 */
function DayPill({ data, today }: { data: RoutineData; today: LocalDate }) {
  const kinds = new Map<string, { icon: string | null; who: string[] }>();
  for (const m of data.members) {
    const type = personDay(data, m.id, today).dayType;
    if (!type) continue;
    const kind = kinds.get(type.name) ?? { icon: type.icon, who: [] };
    kind.who.push(m.name);
    kinds.set(type.name, kind);
  }
  if (kinds.size === 0) return null;
  const list = [...kinds.entries()];
  const title = list.map(([name, k]) => (kinds.size === 1 ? name : `${name}: ${k.who.join(", ")}`)).join(" · ");
  return (
    <Link
      href="/routines/manage"
      title={title}
      className="flex min-h-[var(--touch-target)] max-w-[24rem] min-w-0 items-center gap-2 rounded-full bg-rail px-4.5 text-xl font-extrabold whitespace-nowrap text-ink"
    >
      {list[0][1].icon ? <Emoji emoji={list[0][1].icon} className="size-7 shrink-0" /> : <SunHorizon size="1.75rem" aria-hidden className="shrink-0" />}
      <span className="truncate">{list.map(([name]) => name).join(" · ")}</span>
    </Link>
  );
}

/** All-day items first, then by start time. */
function sortForDay(items: CalendarItem[], timeZone: string): CalendarItem[] {
  return items.toSorted((a, b) => {
    const aAll = isAllDayStyle(a, timeZone) ? 0 : 1;
    const bAll = isAllDayStyle(b, timeZone) ? 0 : 1;
    return aAll - bAll || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
}

