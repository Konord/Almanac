import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, Copy, ListChecks, Plus, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { ActionLink, AppFrame, Button, Emoji, Field, HolidayColoursHere, IconLink, Input, Notice, ScreenHeader, Segmented, SoftLink, firstParam, LoadingOutline } from "@/components/ui";
import { HeaderMenu, headerMenuItemClass } from "@/components/header-menu";
import { RememberDisplay } from "@/components/remember-display";
import { WallRefresh } from "@/components/wall-refresh";
import { Sheet } from "@/components/sheet";
import { addMonths, dayOfWeek, daysWithPanel, firstOfMonth, monthGridDays, rollingWeekDays, weekDays } from "@/lib/calendar-layout";
import { requireHousehold, type Household } from "@/lib/household";
import { addDays, isLocalDate, localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { removeTemplate, updateTemplate } from "./actions";
import { DayKindChips, LocationField } from "./forms";
import { CloseLink, EditEventSheet, readEditing } from "./edit-event";
import { LengthInput } from "./when-fields";
import { Stickers } from "./stickers";
import { EmojiPicker } from "@/components/emoji-picker";
import { PeopleButton, PeopleChooser } from "./people-filter";
import { PlacingBar, QuickAddSheet, readAdding } from "./adding";
import { devicePeople, itemsForPeople, loadCalendar, rangeOf } from "./data";
import type { CalendarEvent, CalendarItem, DayKind, EventTemplate, Member } from "./types";
import { eventEmoji } from "@/lib/emoji";
import { lengthLabel } from "@/lib/quick-times";
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
import { setPanelOpen } from "../today-panel/actions";
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
  const panelParam = firstParam(params.panel);
  const panel = panelParam === "people" || panelParam === "templates" || panelParam === "template" ? panelParam : null;

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
  const people = await devicePeople(members);
  const events: CalendarItem[] = itemsForPeople(items, people);
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

      {panel === "templates" ? (
        <Sheet title="Templates" closeHref={closeHref} narrow>
          <TemplatesPanel templates={templates} memberById={memberById} returnTo={returnTo} />
        </Sheet>
      ) : null}

      {panel === "template" && templates.some((t) => t.id === firstParam(params.tpl)) ? (
        <Sheet title="Edit template" closeHref={href({ panel: "templates", tpl: null })} narrow>
          <TemplateCard
            template={templates.find((t) => t.id === firstParam(params.tpl))!}
            members={members}
            dayKinds={dayKinds}
            returnTo={returnTo}
            backHref={href({ panel: "templates", tpl: null })}
          />
        </Sheet>
      ) : null}

      {panel === "people" ? (
        <Sheet title="Showing" closeHref={closeHref} narrow>
          <PeopleChooser members={members} shown={people} returnTo={`${returnTo}&panel=people`} returnPath="/calendar" />
        </Sheet>
      ) : null}
    </>
  );

  // Week and Month (Glance): the grid edge to edge under the header; the
  // Daily List pushes in from the right (SPEC "Daily List panel — PUSH is
  // locked"). On Month the grid narrows; on Week two days drop out instead
  // (SPEC "Week view: LOCKED", REVISED), so five keep their full width.
  const panelOpen = panelPrefs.open || routineOpen;
  const away = !days.includes(today);
  const unit = byMonth ? "month" : "week";
  return (
    <>
      <RememberDisplay display={view} />
      <WallRefresh timeZone={timeZone} />
      {/* The grid is white and the header's words are on the rail, so Christmas and Halloween colours read fine. */}
      <HolidayColoursHere />
      <div className="flex min-h-0 flex-1 flex-col lg:-mx-8 lg:-mt-6">
        <div className="lg:px-8">
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
                  { href: "/", label: "Today", active: false },
                  { href: href({ view: "week", edit: null, add: null, panel: null }), label: "Week", active: view === "week" },
                  { href: href({ view: "month", edit: null, add: null, panel: null }), label: "Month", active: view === "month" },
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
          >
            {/* Away from this week or month: a way straight back. */}
            {away ? <SoftLink href={href({ date: today, edit: null, add: null, panel: null })}>{`This ${unit}`}</SoftLink> : null}
            <PeopleButton members={members} shown={people} href={href({ panel: "people", edit: null, add: null })} />
            <DailyListToggle open={panelOpen} returnTo={panelReturn} />
            <HeaderMenu label="More: holidays and templates">
              <Link href="/holidays" className={headerMenuItemClass}>
                <Emoji emoji="🎉" className="size-7" />
                Holidays
              </Link>
              <Link href={href({ panel: "templates", edit: null, add: null })} scroll={false} className={headerMenuItemClass}>
                <Copy size="1.75rem" aria-hidden />
                Templates
              </Link>
            </HeaderMenu>
          </ScreenHeader>
        </div>
        {error || message || placing ? (
          <div className="flex shrink-0 flex-col gap-2 pb-3 lg:px-8">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {message ? <Notice tone="success">{message}</Notice> : null}
            {placing ? <PlacingBar hint={byMonth ? "Adding an event: tap a day" : "Adding an event: tap a time, or a day's top for all day"} cancelHref={closeHref} /> : null}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
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
                // The Daily List takes two days' room (desktop only; a phone shows the panel elsewhere).
                days={panelOpen ? daysWithPanel(days, today) : days}
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
            {panelOpen && view === "month" ? (
              // With the Daily List open, a tap on the month grid closes it (the mock's push panel).
              // Week keeps its cards tappable; the list button closes it there.
              <form action={setPanelOpen} className="absolute inset-0 z-20 max-lg:hidden">
                <input type="hidden" name="open" value="0" />
                <input type="hidden" name="returnTo" value={panelReturn} />
                <button aria-label="Close the Daily List" className="size-full cursor-default" />
              </form>
            ) : null}
          </div>
          {panelOpen ? (
            <div className="flex w-[36rem] shrink-0 flex-col border-l border-frame bg-rail p-5 shadow-[-0.35rem_0_1.4rem_rgb(30_35_45/0.12)] max-lg:hidden [&>aside]:flex-1">
              <TodayPanel
                household={household}
                today={today}
                tab={panelPrefs.tab}
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
            </div>
          ) : null}
        </div>
      </div>
      {sheets}
    </>
  );
}

/**
 * Opens or closes the Daily List on Week and Month (it pushes in from the right).
 * Each screen remembers it (a cookie), the same as the old Today panel.
 */
function DailyListToggle({ open, returnTo }: { open: boolean; returnTo: string }) {
  return (
    <form action={setPanelOpen} className="max-lg:hidden">
      <input type="hidden" name="open" value={open ? "0" : "1"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        aria-pressed={open}
        aria-label={open ? "Hide the Daily List" : "Show the Daily List"}
        className={`inline-flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-[var(--radius)] px-4 text-lg font-bold ${
          open ? "bg-tab-on text-tab-on-ink shadow-raised" : "bg-panel text-ink"
        }`}
      >
        <ListChecks size="1.5rem" weight="bold" aria-hidden />
        Daily List
      </button>
    </form>
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

/**
 * The templates you've made, with a way to remove each; tap one to change
 * it. New ones are made on the add card ("Add and save as a template") or an event's card ("Save as a template").
 */
/** How many templates the panel lists (nothing scrolls). */
const TEMPLATES_SHOWN = 16;

function TemplatesPanel({
  templates,
  memberById,
  returnTo,
}: {
  templates: EventTemplate[];
  memberById: Map<string, Member>;
  returnTo: string;
}) {
  const back = `${returnTo}&panel=templates`;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="flex flex-col gap-3">
        {templates.length === 0 ? <p className="text-lg text-ink-muted">No templates yet.</p> : null}
        <ul className="grid grid-cols-2 gap-2">
          {templates.slice(0, TEMPLATES_SHOWN).map((t) => {
            const who = t.member_ids.map((id) => memberById.get(id)?.name).filter(Boolean).join(", ");
            const when = t.all_day ? "All day" : `${t.start_time ? `${t.start_time}, ` : ""}${lengthLabel(t.minutes)}`;
            return (
              <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius)] border border-frame py-1 pr-1 pl-3">
                <Emoji emoji={t.icon || eventEmoji(null, t.title)} className="size-8" />
                <Link
                  href={`/calendar?${returnTo}&panel=template&tpl=${t.id}`}
                  scroll={false}
                  title={`Edit the ${t.title} template`}
                  className="flex min-h-[var(--touch-target)] min-w-0 flex-1 flex-col justify-center"
                >
                  <span className="truncate text-lg font-bold text-ink">{t.title}</span>
                  <span className="truncate text-sm text-ink-muted">{[when, who, t.day_kind ? `Makes it a ${t.day_kind}` : ""].filter(Boolean).join(" · ")}</span>
                </Link>
                <form action={removeTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="name" value={t.title} />
                  <input type="hidden" name="returnTo" value={back} />
                  <RemoveButton label={`Remove the ${t.title} template`} />
                </form>
              </li>
            );
          })}
        </ul>
        {templates.length > TEMPLATES_SHOWN ? <p className="text-base text-ink-muted">+ {templates.length - TEMPLATES_SHOWN} more</p> : null}
      </section>
    </div>
  );
}

function RemoveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-rail hover:text-danger"
    >
      <Trash size="1.5rem" aria-hidden />
    </button>
  );
}

/** Changing a template: the same fields as the event card, without a date. One Save. */
function TemplateCard({
  template,
  members,
  dayKinds,
  returnTo,
  backHref,
}: {
  template: EventTemplate;
  members: Member[];
  dayKinds: DayKind[];
  returnTo: string;
  backHref: string;
}) {
  const back = `${returnTo}&panel=template&tpl=${template.id}`;
  return (
    <div className="flex h-full flex-col gap-5">
      <form id="edit-template" action={updateTemplate} className="group flex min-h-0 flex-1 flex-col gap-5">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="returnTo" value={back} />
        <div className="flex gap-3">
          <EmojiPicker initial={template.icon ?? ""} />
          <div className="min-w-0 flex-1">
            <Field label="Name">
              <Input name="title" required maxLength={120} defaultValue={template.title} />
            </Field>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1 group-has-[input[name=allDay]:checked]:invisible">
            <Field label="Usually starts at">
              <Input name="startTime" type="time" step={900} defaultValue={template.start_time ?? ""} />
            </Field>
          </div>
          <label className="mb-7 flex min-h-[var(--touch-target)] shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold">
            <input type="checkbox" name="allDay" defaultChecked={template.all_day} className="size-5 accent-ink" />
            All day
          </label>
        </div>
        <div className="group-has-[input[name=allDay]:checked]:hidden">
          <LengthInput initial={template.minutes} />
        </div>
        <Stickers members={members} memberIds={template.member_ids} />
        <DayKindChips kinds={dayKinds} value={template.day_kind} />
        <LocationField value={template.location} />
        <Field label="Notes">
          <Input name="notes" maxLength={2000} defaultValue={template.notes ?? ""} />
        </Field>
      </form>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button form="edit-template" variant="save">Save</Button>
        <CloseLink href={backHref} />
        <form action={removeTemplate} className="ml-auto">
          <input type="hidden" name="id" value={template.id} />
          <input type="hidden" name="name" value={template.title} />
          <input type="hidden" name="returnTo" value={`${returnTo}&panel=templates`} />
          <Button variant="danger">Delete template</Button>
        </form>
      </div>
    </div>
  );
}
