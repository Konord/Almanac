import { Suspense } from "react";
import Link from "next/link";
import { CalendarDots, ListChecks, Plus, SunHorizon, X } from "@phosphor-icons/react/dist/ssr";
import {
  AppFrame,
  Avatar,
  Card,
  Emoji,
  Notice,
  ProgressBar,
  ScreenHeader,
  Segmented,
  firstParam,
} from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { EVERYONE_COLOUR, soft } from "@/lib/colours";
import { formatMinutes, profileLabel, type DayProfile } from "@/lib/day-profile";
import { eventEmoji } from "@/lib/emoji";
import { EATING_MINUTES } from "@/lib/meals";
import { requireHousehold, type Household } from "@/lib/household";
import { addDays, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { deviceView, itemsInView, loadCalendar, profilesFor, rangeOf } from "./calendar/data";
import { PROFILE_COLOUR, ProfileTag } from "./calendar/profile-tag";
import type { CalendarItem, Member } from "./calendar/types";
import { dueChores, loadChores, loadTodos, todosForToday, type ChoreMember, type ChoreWithTiming, type Todo } from "./chores/data";
import { ChoreRow, TodoRow } from "./chores/rows";
import { loadRoutines, type RoutineData } from "./routines/data";
import { energyModeOn, loadBackupParts, loadMealBasics, loadMeals, type Meal, type MealBasics } from "./meals/data";
import { MealBlock, SurvivalButton, placeTodayMeals } from "./meals/today";
import { SurvivalCard } from "./survival-card";
import { floatingRoutines, RoutineBlock } from "./routines/floating";
import { RoutinesGlance } from "./routines/glance";
import { dayProgress } from "./routines/people-row";
import { PlacingBar, QuickAddSheet, readAdding } from "./calendar/adding";
import { PlaceAcrossPeople } from "@/components/place-across-people";
import { PendingSpans } from "@/components/pending-block";
import { layoutSpans, memberRuns, spanBox } from "@/lib/calendar-layout";
import type { QuickDefaults } from "./calendar/forms";
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

/** How many days the "Coming up" card looks ahead. */
const COMING_UP_DAYS = 6;

/**
 * The Today screen: a timeline with a column per person, and cards for
 * what kind of day it is, routines, and what's coming up. To-dos and
 * dinner join it in later steps.
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

  const days = Array.from({ length: COMING_UP_DAYS + 1 }, (_, i) => addDays(today, i));
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  const [{ layers, members, views, tags, templates, items }, routineData, choreData, todoData, mealBasics, todayMeals, energyMode] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
    loadChores(today, timeZone),
    loadTodos(),
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
  const todayItems = sortForDay(eventsOnDay(shown, today, timeZone), timeZone);
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const { placing, pending, templateHref } = readAdding(params, household.settings, members, templates, tags, "/");
  // The Survival card (?survival=1): meals still to cook, and chores due.
  const survivalOpen = firstParam(params.survival) === "1" && !placing;
  const survivalParts = survivalOpen ? await loadBackupParts() : [];
  const mealsToCook = survivalOpen
    ? placeTodayMeals(todayMeals, mealBasics, [])
        .filter((m) => !m.cooked && !m.backup && m.endMin > minutesIntoDay(now, timeZone))
        .sort((a, b) => a.startMin - b.startMin)
    : [];

  return (
    <>
      <ScreenHeader title={longDate}>
        <HeaderClock locale={locale} timeZone={timeZone} />
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

      <div className="flex flex-col gap-6.5 lg:min-h-0 lg:flex-1 lg:flex-row">
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
        />

        <div className="grid min-w-0 flex-1 gap-5 lg:min-h-0 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
          <TodoCard
            todos={todosForToday(todoData.todos, today)}
            chores={dueChores(choreData.chores)}
            members={choreData.members}
            today={today}
            household={household}
          />
          <RoutinesGlance data={routineData} date={today} household={household} className="lg:row-span-2" />
          <ComingUp days={days.slice(1, 6)} shown={shown} profiles={profiles} household={household} />
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
  const dayMeals = placedMeals.map((m) => ({ mealTimeId: m.mealTimeId, eatStart: m.endMin - EATING_MINUTES, endMin: m.endMin, memberIds: m.memberIds, title: m.name }));
  const routinesFor = new Map(
    members.map((m) => [
      m.id,
      floatingRoutines(
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
  const placements = [...[...routinesFor.values()].flat().map((r) => r.placement), ...placedMeals];
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
    // A meal for everyone (no one picked) spans the whole row.
    ...placedMeals.flatMap((m) =>
      memberRuns(m.memberIds, columnIds).map(([c0, c1]) => ({ id: `meal:${m.id}|${c0}`, startMin: m.startMin, endMin: m.endMin, c0, c1 })),
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
            </div>
          ))}
          {/* Events sit over the columns so one bubble can span several people. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 left-16.5">
            {placedEvents.map((block) => {
              const top = ((block.startMin - first * 60) / span) * 100;
              const height = (Math.max(block.endMin - block.startMin, 30) / span) * 100;
              if (block.id.startsWith("meal:")) {
                const meal = mealById.get(block.id.slice(5).split("|")[0])!;
                return (
                  <div key={block.id} className="pointer-events-auto">
                    <MealBlock
                      meal={meal}
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

/** How many things the To-do card lists before "and N more". */
const TODO_CARD_LIMIT = 4;

/** To-dos for today (or with no day) and chores that are due. */
function TodoCard({
  todos,
  chores,
  members,
  today,
  household,
}: {
  todos: Todo[];
  chores: ChoreWithTiming[];
  members: ChoreMember[];
  today: LocalDate;
  household: Household;
}) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const shownTodos = todos.slice(0, TODO_CARD_LIMIT);
  const shownChores = chores.slice(0, Math.max(0, TODO_CARD_LIMIT - shownTodos.length));
  const moreTodos = todos.length - shownTodos.length;
  const moreChores = chores.length - shownChores.length;
  return (
    <Card
      title="To-do"
      icon={ListChecks}
      tint="blue"
      aside={
        <Link href="/lists" className="flex min-h-[var(--touch-target)] items-center text-lg font-bold text-accent">
          Lists
        </Link>
      }
    >
      {todos.length + chores.length === 0 ? (
        <p className="py-3 text-xl text-ink-muted">Nothing to do today.</p>
      ) : (
        <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          {shownTodos.map((t) => (
            <TodoRow key={t.id} todo={t} members={memberById} today={today} household={household} returnTo="/" />
          ))}
          {shownChores.map((c) => (
            <ChoreRow key={c.id} chore={c} members={memberById} today={today} household={household} returnTo="/" />
          ))}
        </ul>
      )}
      {moreTodos + moreChores > 0 ? (
        <p className="mt-auto flex gap-4 pt-1 text-lg font-bold">
          {moreTodos > 0 ? (
            <Link href="/lists" className="text-accent">
              +{moreTodos} more to-do{moreTodos === 1 ? "" : "s"}
            </Link>
          ) : null}
          {moreChores > 0 ? (
            <Link href="/chores" className="text-accent">
              +{moreChores} chore{moreChores === 1 ? "" : "s"} due
            </Link>
          ) : null}
        </p>
      ) : null}
    </Card>
  );
}

/** The next few days: a picture, what's on, and the day. */
function ComingUp({
  days,
  shown,
  profiles,
  household,
}: {
  days: LocalDate[];
  shown: CalendarItem[];
  profiles: Map<LocalDate, DayProfile>;
  household: Household;
}) {
  const { timeZone } = household.settings;
  return (
    <Card title="Coming up" icon={CalendarDots} tint="purple">
      <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        {days.map((day) => {
          const dayItems = sortForDay(eventsOnDay(shown, day, timeZone), timeZone);
          const profile = profiles.get(day);
          const lead = dayItems[0];
          return (
            <li key={day} className="border-b border-panel last:border-0">
              <Link href={`/calendar?view=week&date=${day}`} className="flex min-h-16 items-center gap-3.5 py-1.5">
                {lead ? (
                  <Emoji emoji={eventEmoji(lead.icon, lead.title)} className="size-10" />
                ) : (
                  <span className="size-10 shrink-0" />
                )}
                <span
                  className={`min-w-0 flex-1 truncate text-xl font-semibold ${dayItems.length ? "text-ink" : "text-ink-muted"}`}
                >
                  {dayItems.length === 0
                    ? "Nothing planned"
                    : dayItems
                        .slice(0, 2)
                        .map((e) => e.title)
                        .join(", ") + (dayItems.length > 2 ? ` +${dayItems.length - 2}` : "")}
                </span>
                {profile && profile.kind !== "free" ? <ProfileTag kind={profile.kind} /> : null}
                <span className="w-14 shrink-0 text-right text-sm font-bold text-ink-muted">
                  {weekdayLabel(day, household)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
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
