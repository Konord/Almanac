import { Suspense } from "react";
import { CaretLeft, CaretRight, Plus, X } from "@phosphor-icons/react/dist/ssr";
import { ActionLink, AppFrame, HolidayColoursHere, IconLink, Notice, ScreenHeader, Segmented, firstParam, LoadingOutline } from "@/components/ui";
import { RememberDisplay } from "@/components/remember-display";
import { WallRefresh } from "@/components/wall-refresh";
import { addMonths, dayOfWeek, daysWithPanel, firstOfMonth, monthGridDays, rollingWeekDays, weekDays } from "@/lib/calendar-layout";
import { requireHousehold, type Household } from "@/lib/household";
import { addDays, isLocalDate, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { EditEventSheet, readEditing } from "./edit-event";
import { QuickAddSheet, readAdding } from "./adding";
import { loadCalendar, rangeOf } from "./data";
import type { CalendarEvent, CalendarItem, Member } from "./types";
import { loadBreaks, loadRoutines } from "../routines/data";
import { loadSpecialDays } from "../holidays/data";
import { RoutineChecklist } from "../routines/routine-checklist";
import { loadTodos } from "../chores/data";
import { onCalendar } from "@/lib/todos";
import { MonthView, eventsOnDay, isAllDayStyle, minutesIntoDay } from "./views";
import { WeekView, type WeekMeal } from "./week";
import { loadMealBasics, loadMeals } from "../meals/data";
import { cookHref, placeTodayMeals } from "../meals/today";
import { TodayPanel } from "../today-panel/panel";
import { DailyListDrawer } from "../today-panel/drawer";
import { readPanelPrefs } from "../today-panel/prefs";
import { syncEventAndChoreHeadsUps } from "../heads-ups/sync";
import { choreSchedule } from "../chores/plan";

/** Week or Month. What Month shows (rolling 5 weeks or the calendar month) is a setting. */
type View = "week" | "month";

export default function CalendarPage(props: PageProps<"/calendar">) {
  return (
    <AppFrame section="calendar">
      <Suspense fallback={<LoadingOutline />}>
        <CalendarContent searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function CalendarContent({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const household = await requireHousehold();
  const { timeZone, weekStartsOn } = household.settings;
  const params = await searchParams;

  const today = localDateOf(new Date(), timeZone);
  const view: View = firstParam(params.view) === "month" ? "month" : "week";
  const rolling = household.settings.monthStyle === "rolling";
  const dateParam = firstParam(params.date);
  const anchor = dateParam && isLocalDate(dateParam) ? dateParam : today;

  const days =
    view === "week"
      ? weekDays(anchor, weekStartsOn)
      : rolling
        ? rollingWeekDays(anchor, weekStartsOn)
        : monthGridDays(anchor, weekStartsOn);
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  // The Today panel's daily list needs today's heads-ups and chores made into
  // tasks first, the same as on the Agenda (otherwise a wall left on Week or
  // Month never gets them).
  await syncEventAndChoreHeadsUps(household);
  await choreSchedule(household, today, timeZone);
  const [{ members, templates, dayKinds, items }, routineData, breaks, specials] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
    loadBreaks(days[0], days[days.length - 1]),
    loadSpecialDays(days[0], days[days.length - 1]),
  ]);
  // The person filter is left out for now (Connor, 2026-11-16): everyone's things show.
  const events: CalendarItem[] = items;
  // The week view shows each day's dinner under the date, and list tasks with a time as points.
  const weekMeals = view === "week" ? await mealsFor(days, events, members, timeZone) : new Map<LocalDate, WeekMeal[]>();
  const weekTasks =
    view === "week" ? (await loadTodos()).todos.filter((t) => onCalendar(t) && t.due_date! >= days[0] && t.due_date! <= days[days.length - 1]) : [];
  const { placing, pending, templateHref } = readAdding(params, household.settings, members, templates, "/calendar");
  const memberById = new Map(members.map((m) => [m.id, m]));

  // The event being edited (it may be outside the visible range; the sheet loads it itself).
  const editing = readEditing(params);

  // While adding, moving between weeks or views keeps you in adding mode.
  const current: Record<string, string | null> = { view, date: anchor, placing: placing ? "1" : null };
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | null> = { ...current, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/calendar?${next.toString()}`;
  };
  const returnTo = `view=${view}&date=${anchor}`;
  const closeHref = href({ edit: null, occ: null, add: null, panel: null, placing: null });
  /** Where tapping a day or time while adding goes (start and length get added for a time). */
  const addHref = (day: LocalDate, extra: Record<string, string> = {}) => href({ add: day, edit: null, panel: null, placing: null, ...extra });

  // Open the edit sheet on the side away from the event, so it stays in view.
  const editSide = (event: CalendarEvent): "left" | "right" =>
    (dayOfWeek(editing?.occ ?? localDateOf(new Date(event.starts_at), timeZone)) - weekStartsOn + 7) % 7 >= 4 ? "left" : "right";
  // Week moves a week at a time. Month moves a month: the calendar month keeps
  // the day, and the rolling 5 weeks jumps to the 1st so it sits in the top row.
  const byMonth = view === "month";
  const step = (n: number) =>
    view === "week" ? addDays(anchor, 7 * n) : rolling ? firstOfMonth(anchor, n) : addMonths(anchor, n);
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  // The Today panel on the left: what's still to come today, soonest first.
  const panelPrefs = await readPanelPrefs();
  const panelReturn = `/calendar?${returnTo}`;
  const openRoutine = firstParam(params.routine) ?? "";
  const openMember = firstParam(params.member) ?? "";
  const routineOpen = Boolean(openRoutine && openMember) && !placing;
  const sheets = (
    <>
      {editing ? (
        <EditEventSheet
          editing={editing}
          household={household}
          members={members}
          dayKinds={dayKinds}
          here={href({ edit: null, occ: null, add: null, panel: null, placing: null })}
          returnTo={returnTo}
          returnPath="/calendar"
          side={editSide}
        />
      ) : null}

      {pending && !editing ? (
        <QuickAddSheet
          // A day late in the week opens the card on the left, so the day stays in view.
          side={(dayOfWeek(pending.date) - weekStartsOn + 7) % 7 >= 4 ? "left" : "right"}
          pending={pending} members={members} dayKinds={dayKinds} templates={templates} templateHref={templateHref} closeHref={closeHref} returnTo={returnTo} returnPath="/calendar" />
      ) : null}

    </>
  );

  // Week and Month (Glance): the grid edge to edge under the header; the
  // Daily List pushes in from the right (SPEC "Daily List panel — PUSH is
  // locked"), now with a swipe in from the edge and no header button
  // (Connor, 2026-11-16; drawer.tsx). On Month the grid narrows; on Week
  // two days drop out instead (SPEC "Week view: LOCKED", REVISED), so five
  // keep their full width.
  const panelOpen = panelPrefs.open || routineOpen;
  const unit = byMonth ? "month" : "week";
  return (
    <>
      <RememberDisplay display={view} />
      <WallRefresh timeZone={timeZone} />
      {/* The grid is white and the header's words are on the rail, so Christmas and Halloween colours read fine. */}
      <HolidayColoursHere />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 lg:gap-5">
          <ScreenHeader
            {...headerTitle(view, days, anchor, household)}
            weather
            nav={
              <>
                <IconLink href={href({ date: step(-1), edit: null, add: null, panel: null })} label={`Previous ${unit}`} icon={CaretLeft} />
                <IconLink href={href({ date: step(1), edit: null, add: null, panel: null })} label={`Next ${unit}`} icon={CaretRight} />
              </>
            }
            tabs={
              <Segmented
                label="View"
                options={[
                  { href: "/", label: "Agenda", active: false },
                  // The tabs always bring you back to today (Connor, 2026-11-26), instead of a "This week" button.
                  { href: href({ view: "week", date: null, edit: null, add: null, panel: null }), label: "Week", active: view === "week" },
                  { href: href({ view: "month", date: null, edit: null, add: null, panel: null }), label: "Month", active: view === "month" },
                ]}
              />
            }
            action={
              // Add starts adding mode (tap a day, or a time on Week, to place it), or cancels it.
              <ActionLink
                href={placing ? closeHref : href({ placing: "1", edit: null, add: null, panel: null })}
                scroll={false}
                icon={placing ? X : Plus}
                label={placing ? "Stop adding" : "Add an event"}
              >
                {placing ? "Stop" : "Add"}
              </ActionLink>
            }
          />
        {/* No "tap a day" bar while adding (Connor, 2026-11-16): Add turns into Stop, and the days light up under a finger or the mouse. */}
        {error || message ? (
          <div className="flex shrink-0 flex-col gap-2">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {message ? <Notice tone="success">{message}</Notice> : null}
          </div>
        ) : null}
        <DailyListDrawer
          initialOpen={panelOpen}
          closeOnTap={view === "month"}
          panel={
            <TodayPanel
              household={household}
              today={today}
              tab={firstParam(params.box)}
              returnTo={panelReturn}
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
                    closeHref={panelReturn}
                    hereHref={(p) => `${panelReturn}&routine=${openRoutine}&member=${openMember}${p ? `&rpage=${p}` : ""}`}
                  />
                ) : undefined
              }
            />
          }
        >
          {view === "month" ? (
            <MonthView
              household={household}
              days={days}
              today={today}
              events={events}
              memberById={memberById}
              anchor={anchor}
              mode={rolling ? "weeks" : "month"}
              adding={{ placing, pending, addHref }}
              breaks={breaks}
              specials={specials}
              dayHref={(day) => (day === today ? "/" : `/?date=${day}`)}
            />
          ) : (
            <WeekView
              household={household}
              days={days}
              // With the Daily List out, two days make room for it (desktop only; a phone shows the panel elsewhere).
              dropWhenOpen={days.filter((d) => !daysWithPanel(days, today).includes(d))}
              today={today}
              events={events}
              memberById={memberById}
              href={href}
              meals={weekMeals}
              tasks={weekTasks}
              adding={{ placing, pending, addHref }}
              breaks={breaks}
              specials={specials}
            />
          )}
        </DailyListDrawer>
      </div>
      {sheets}
    </>
  );
}

/**
 * The week's meals as blocks: each planned meal at its eating time, moved
 * out of the way of plans the same way the Agenda does it.
 */
async function mealsFor(days: LocalDate[], events: CalendarItem[], members: Member[], timeZone: string): Promise<Map<LocalDate, WeekMeal[]>> {
  const [basics, meals] = await Promise.all([loadMealBasics(), loadMeals(days[0], days[days.length - 1])]);
  const memberIds = new Set(members.map((m) => m.id));
  const result = new Map<LocalDate, WeekMeal[]>();
  for (const day of days) {
    const plans = eventsOnDay(events, day, timeZone)
      .filter((e) => !isAllDayStyle(e, timeZone))
      .map((e) => ({
        startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
        endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
        title: e.title,
        memberIds: e.member_ids.filter((id) => memberIds.has(id)),
      }));
    const placed = placeTodayMeals(
      meals.filter((m) => m.date === day),
      basics,
      plans,
    );
    if (placed.length === 0) continue;
    result.set(
      day,
      placed.map((m) => ({ id: m.id, name: m.name, icon: m.icon, startMin: m.startMin, endMin: m.endMin, href: cookHref(m), cooked: m.cooked })),
    );
  }
  return result;
}

/**
 * The header for Week and Month: the month's name, with the year on its
 * baseline (Glance: no date-range text). A week that runs over two months
 * is named for the month most of its days are in.
 */
function headerTitle(view: View, days: LocalDate[], anchor: LocalDate, household: Household): { title: string; sub: string } {
  const { locale, timeZone } = household.settings;
  const date = view === "week" ? days[3] : anchor;
  return {
    title: new Intl.DateTimeFormat(locale, { timeZone, month: "long" }).format(zonedToUtc(date, "12:00", timeZone)),
    sub: date.slice(0, 4),
  };
}
