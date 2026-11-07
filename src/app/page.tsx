import { Suspense } from "react";
import Link from "next/link";
import { Plus, SunHorizon, X } from "@phosphor-icons/react/dist/ssr";
import {
  AppFrame,
  Avatar,
  Emoji,
  Notice,
  ProgressBar,
  ScreenHeader,
  Segmented,
  firstParam,
} from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { EVERYONE_COLOUR, soft, strong } from "@/lib/colours";
import { formatMinutes, profileLabel, type DayProfile } from "@/lib/day-profile";
import { eventEmoji } from "@/lib/emoji";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { deviceView, itemsInView, loadCalendar, profilesFor, rangeOf } from "./calendar/data";
import { PROFILE_COLOUR } from "./calendar/profile-tag";
import type { CalendarItem, Member } from "./calendar/types";
import { dueChores, loadChores, loadTodos, type Todo } from "./chores/data";
import { loadRoutines, type RoutineData } from "./routines/data";
import { energyModeOn, loadBackupParts, loadMealBasics, loadMeals, type Meal, type MealBasics } from "./meals/data";
import { MealBlock, SurvivalButton, mealsForRoutines, placeTodayMeals } from "./meals/today";
import { SurvivalCard } from "./survival-card";
import { OpenPanelTab, TodayPanel } from "./today-panel/panel";
import { readPanelPrefs } from "./today-panel/prefs";
import { clock, floatingDay, RoutineBlock } from "./routines/floating";
import { RoutineChecklist } from "./routines/routine-checklist";
import { dayProgress } from "./routines/people-row";
import { PlacingBar, QuickAddSheet, readAdding } from "./calendar/adding";
import { PlaceAcrossPeople } from "@/components/place-across-people";
import { PendingSpans } from "@/components/pending-block";
import { layoutSpans, memberRuns, spanBox } from "@/lib/calendar-layout";
import type { QuickDefaults } from "./calendar/forms";
import { syncEventAndChoreHeadsUps } from "./heads-ups/sync";
import { loadBlocks, planChores, syncChoreTodos, type PlannedTodo } from "./chores/blocks";
import { ChoreBlockOnTimeline } from "./chores/block-view";
import type { BlockDay } from "@/lib/chore-blocks";
import { toMinutes } from "@/lib/routine-placement";
import {
  EventBlock,
  HourLines,
  minutesIntoDay,
  NowLine,
  eventsOnDay,
  isAllDayStyle,
  nowPercent,
  shortTime,
  timelineRange,
  weekdayLabel,
} from "./calendar/views";

/** The space between people's columns on the timeline. */
const COLUMN_GAP = "0.625rem";

/**
 * The Today screen (the Day view): the Today panel on the left showing
 * lists, and a timeline with a column per person filling the rest.
 */
export default function Home(props: PageProps<"/">) {
  return (
    <AppFrame section="today">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
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
  // Chores that have come due make their to-dos before the to-dos are read.
  const choreData = await loadChores(today, timeZone);
  await syncChoreTodos(household, choreData.chores);
  const [{ layers, members, views, tags, templates, items }, routineData, todoData, blocks, mealBasics, todayMeals, energyMode] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
    loadTodos(),
    loadBlocks(),
    loadMealBasics(),
    loadMeals(today, today),
    energyModeOn(today),
  ]);
  const savedView = await deviceView(views);
  const shown = itemsInView(items, savedView);
  const profiles = profilesFor(days, items, layers, household);

  const longDate = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const todayProfile = profiles.get(today);
  // Which chore to-dos wait for a chore block; the rest go on the to-do list,
  // a few at a time so it isn't overwhelming.
  const chorePlan = planChores(blocks, choreData.chores, todoData.todos, today);
  const todayItems = sortForDay(eventsOnDay(shown, today, timeZone), timeZone);
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const { placing, pending, templateHref } = readAdding(params, household.settings, members, templates, tags, "/");
  // The Survival card (?survival=1): meals still to cook, and chores due.
  const survivalOpen = firstParam(params.survival) === "1" && !placing;
  const openRoutine = firstParam(params.routine) ?? "";
  const openMember = firstParam(params.member) ?? "";
  const routineOpen = Boolean(openRoutine && openMember) && !placing;
  const survivalParts = survivalOpen ? await loadBackupParts() : [];
  const mealsToCook = survivalOpen
    ? placeTodayMeals(todayMeals, mealBasics, [])
        .filter((m) => !m.cooked && !m.backup && m.endMin > minutesIntoDay(now, timeZone))
        .sort((a, b) => a.startMin - b.startMin)
    : [];

  // The Today panel on the left (lists only here: the timeline already shows today).
  const panelPrefs = await readPanelPrefs();

  return (
    <>
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
      <ScreenHeader title={panelPrefs.open ? "Today" : longDate}>
        {panelPrefs.open ? null : <HeaderClock locale={locale} timeZone={timeZone} />}
        {todayProfile ? (
          <DayPill profile={todayProfile} label={profileLabel(todayProfile.kind, weekdayLabel(today, household, "long"))} household={household} today={today} />
        ) : null}
        <SurvivalButton used={energyMode === "survival"} href="/?survival=1" />
        <div className="lg:ml-auto">
          <Segmented
            label="How much to show"
            options={[
              { href: "/", label: "Day", active: true },
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
          members={members}
          routineData={routineData}
          today={today}
          now={now}
          household={household}
          placing={placing}
          pending={pending}
          meals={todayMeals}
          mealBasics={mealBasics}
          timedTodos={todoData.todos.filter((t) => t.status === "open" && t.date_kind === "start" && t.due_date === today && t.at_time)}
          choreBlocks={chorePlan.days.filter((d) => d.date === today)}
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

      {survivalOpen ? (
        <SurvivalCard meals={mealsToCook} basics={mealBasics} parts={survivalParts} chores={dueChores(choreData.chores)} closeHref="/" />
      ) : null}

      {pending ? (
        <QuickAddSheet pending={pending} layers={layers} members={members} tags={tags} templates={templates} templateHref={templateHref} closeHref="/" returnTo="" returnPath="/" />
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
  timedTodos,
  choreBlocks,
}: {
  /** Today's chore blocks, with their to-dos. */
  choreBlocks: BlockDay<PlannedTodo>[];
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
  /** To-dos that start at a time today: points on the timeline, no length. */
  timedTodos: Todo[];
}) {
  const { timeZone } = household.settings;
  const timed = items.filter((e) => !isAllDayStyle(e, timeZone));
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
  // Chore blocks float with them, in the columns of the people doing them (everyone's if nobody's picked).
  const blocksOf = (memberId: string) => choreBlocks.filter((d) => d.block.member_ids.length === 0 || d.block.member_ids.includes(memberId));
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
        blocksOf(m.id).map((d) => ({ id: d.block.id, start: toMinutes(d.block.start_time), minutes: d.block.minutes, loose: d.block.loose })),
      ),
    ]),
  );
  const routinesFor = new Map([...dayFor].map(([id, d]) => [id, d.routines]));
  const choreBlocksFor = new Map([...dayFor].map(([id, d]) => [id, blocksOf(id).map((day, i) => ({ day, placement: d.extras[i] }))]));
  const placements = [
    ...[...routinesFor.values()].flat().map((r) => r.placement),
    ...[...choreBlocksFor.values()].flat().map((b) => b.placement),
    ...placedMeals,
  ];
  const range = timelineRange(timed, [today], timeZone);
  const first = Math.min(range.first, ...placements.map((p) => Math.floor(p.startMin / 60)));
  const last = Math.max(range.last, ...placements.map((p) => Math.ceil(p.endMin / 60)));
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
    // A meal for everyone (no one picked) spans the whole row. With a cook,
    // the prep is in the cook's column and the rest in the eaters'.
    ...placedMeals.flatMap((m) => {
      const cook = m.cookId ? columnIds.indexOf(m.cookId) : -1;
      const prep = cook >= 0 ? [{ id: `meal:${m.id}|prep`, startMin: m.startMin, endMin: m.eatStart, c0: cook, c1: cook }] : [];
      return [
        ...prep,
        ...memberRuns(m.memberIds, columnIds).map(([c0, c1]) => ({
          id: `meal:${m.id}|${c0}`,
          startMin: cook >= 0 ? m.eatStart : m.startMin,
          endMin: m.endMin,
          c0,
          c1,
        })),
      ];
    }),
  ]);
  const mealById = new Map(placedMeals.map((m) => [m.id, m]));
  const eventById = new Map(timed.map((e) => [e.id, e]));
  const span = (last - first) * 60;
  const editLink = (e: CalendarItem) =>
    `/calendar?view=week&date=${today}&edit=${e.series_id}${e.occurrence_date ? `&occ=${e.occurrence_date}` : ""}`;

  return (
    <section
      aria-label="Today's timeline"
      className="flex min-h-[36rem] flex-col max-lg:overflow-x-auto lg:min-h-0 lg:w-[56.25rem] lg:shrink-0"
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
              {(routinesFor.get(c.id) ?? []).map((r) => (
                <RoutineBlock
                  key={r.assignment.id}
                  routine={r}
                  memberId={c.id}
                  colour={c.colour}
                  date={today}
                  first={first}
                  last={last}
                  household={household}
                />
              ))}
              {(choreBlocksFor.get(c.id) ?? []).map((b) => (
                <ChoreBlockOnTimeline
                  key={b.day.block.id}
                  day={b.day}
                  placement={b.placement}
                  colour={c.colour}
                  first={first}
                  last={last}
                  clock={(m) => clock(m, today, household)}
                />
              ))}
            </div>
          ))}
          {/* Events sit over the columns so one bubble can span several people. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 left-16.5">
            {placedEvents.map((block) => {
              const top = ((block.startMin - first * 60) / span) * 100;
              const height = (Math.max(block.endMin - block.startMin, 30) / span) * 100;
              if (block.id.startsWith("meal:")) {
                const [mealId, which] = block.id.slice(5).split("|");
                const meal = mealById.get(mealId)!;
                return (
                  <div key={block.id} className="pointer-events-auto">
                    <MealBlock
                      meal={meal}
                      part={which === "prep" ? "prep" : meal.cookId && columnIds.includes(meal.cookId) ? "eat" : "whole"}
                      date={today}
                      household={household}
                      style={{
                        top: `calc(${top}% + 3px)`,
                        height: `calc(${height}% - 6px)`,
                        ...spanBox(block.c0, block.c1, columns.length, COLUMN_GAP, block.lane, block.lanes),
                      }}
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
            {timedTodos.map((t) => {
              const minute = Number(t.at_time!.slice(0, 2)) * 60 + Number(t.at_time!.slice(3, 5));
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

/** "Busy Thursday" next to the clock; the detail shows when you hover or hold. */
function DayPill({ profile, label, household, today }: { profile: DayProfile; label: string; household: Household; today: LocalDate }) {
  const { timeZone, dayProfile } = household.settings;
  const time = (t: string) => clockTime(zonedToUtc(today, t, timeZone), household);
  // Times like "9 p.m." already end in a full stop, so don't add a second.
  const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);
  const detail =
    profile.kind === "busy_evening"
      ? `${formatMinutes(profile.eveningMinutes)} of plans after ${time(dayProfile.eveningStarts)}, and ${formatMinutes(profile.freeMinutes)} free overall`
      : profile.kind === "busy"
        ? `${formatMinutes(profile.busyMinutes)} of plans, leaving ${formatMinutes(profile.freeMinutes)} free`
        : profile.busyMinutes === 0
          ? `Nothing planned between ${time(dayProfile.dayStarts)} and ${time(dayProfile.dayEnds)}`
          : `${formatMinutes(profile.freeMinutes)} free between ${time(dayProfile.dayStarts)} and ${time(dayProfile.dayEnds)}`;
  const colour = PROFILE_COLOUR[profile.kind];
  return (
    <Link
      href="/household"
      title={sentence(detail)}
      className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-full px-4.5 text-xl font-extrabold whitespace-nowrap"
      style={{ color: colour, background: `color-mix(in srgb, ${colour} 12%, white)` }}
    >
      <SunHorizon size="1.75rem" aria-hidden />
      {label}
    </Link>
  );
}

/** A time for sentences, like "5 p.m." or "5:30 p.m." (in the household's locale). */
function clockTime(instant: Date, household: Household): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(instant)
    .replace(":00", "");
}

/** All-day items first, then by start time. */
function sortForDay(items: CalendarItem[], timeZone: string): CalendarItem[] {
  return items.toSorted((a, b) => {
    const aAll = isAllDayStyle(a, timeZone) ? 0 : 1;
    const bAll = isAllDayStyle(b, timeZone) ? 0 : 1;
    return aAll - bAll || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
}

/** A to-do at a time: a point on the line, not a block (it has no length). Tapping opens its list. */
function TodoPoint({ todo, top, box, colour }: { todo: Todo; top: number; box: { left: string; width: string }; colour: string }) {
  return (
    <Link
      href={todo.link ?? `/lists?list=${todo.list_id}`}
      title={todo.title}
      className="pointer-events-auto absolute z-[2] flex h-8 -translate-y-1/2 items-center gap-1.5 overflow-hidden"
      style={{ top: `${top}%`, ...box }}
    >
      <span className="size-3.5 shrink-0 rounded-full border-[3px] bg-board" style={{ borderColor: strong(colour) }} aria-hidden />
      <span className="min-w-0 truncate rounded-lg bg-board/90 px-1.5 font-hand text-xl leading-none text-ink">{todo.title}</span>
    </Link>
  );
}
