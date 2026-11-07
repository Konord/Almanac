import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, Plus, Stack, Tag, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Emoji, Field, IconLink, Input, Notice, ScreenHeader, Segmented, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { Sheet } from "@/components/sheet";
import { strong } from "@/lib/colours";
import { addMonths, dayOfWeek, monthGridDays, rollingWeekDays, weekDays } from "@/lib/calendar-layout";
import { requireHousehold, type Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { describeRule, parseRule } from "@/lib/recurrence";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import {
  addLayer,
  addView,
  removeView,
  updateView,
  moveOccurrence,
  removeEvent,
  removeLayer,
  removeTag,
  removeTemplate,
  resetOccurrence,
  skipOccurrence,
  updateEvent,
  updateLayer,
} from "./actions";
import { EventCardFields, LayerFields, ViewFields } from "./forms";
import { ViewChooser } from "./view-chooser";
import { PlacingBar, QuickAddSheet, readAdding } from "./adding";
import { VISIBILITY_OPTIONS } from "./options";
import { deviceView, EVENT_COLUMNS, itemsInView, toEvent, loadCalendar, profilesFor, rangeOf } from "./data";
import type { CalendarEvent, CalendarItem, EventTemplate, Layer, Member, SavedView, Tag as TagType } from "./types";
import { eventEmoji } from "@/lib/emoji";
import { lengthLabel } from "@/lib/quick-times";
import { loadRoutines } from "../routines/data";
import { PeopleRow } from "../routines/people-row";
import { MonthView, WeekView, eventColour, eventsOnDay, isAllDayStyle, shortTime, type Dinner } from "./views";
import { loadMealBasics, loadMeals, mealIcon, mealName } from "../meals/data";
import { OpenPanelTab, TodayPanel, type UpNextItem } from "../today-panel/panel";
import { readPanelPrefs } from "../today-panel/prefs";
import { HeadsUpEditor, loadHeadsUps, type HeadsUp } from "../heads-ups/editor";

/** Week or Month. What Month shows (rolling 5 weeks or the calendar month) is a setting. */
type View = "week" | "month";

export default function CalendarPage(props: PageProps<"/calendar">) {
  return (
    <AppFrame section="calendar">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <CalendarContent searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function CalendarContent({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const household = await requireHousehold();
  const { timeZone, weekStartsOn, locale } = household.settings;
  const params = await searchParams;
  const supabase = await createClient();

  const today = localDateOf(new Date(), timeZone);
  const view: View = firstParam(params.view) === "month" ? "month" : "week";
  const rolling = household.settings.monthStyle === "rolling";
  const dateParam = firstParam(params.date);
  const anchor = dateParam && isLocalDate(dateParam) ? dateParam : today;
  const editId = firstParam(params.edit);
  const occParam = firstParam(params.occ);
  const editOccurrence = occParam && isLocalDate(occParam) ? occParam : undefined;
  const panelParam = firstParam(params.panel);
  const panel = panelParam === "layers" || panelParam === "tags" ? panelParam : null;

  const days =
    view === "week"
      ? weekDays(anchor, weekStartsOn)
      : rolling
        ? rollingWeekDays(anchor, weekStartsOn)
        : monthGridDays(anchor, weekStartsOn);
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  const [{ layers, members, views, tags, templates, items, exceptions }, routineData] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
  ]);
  const savedView = await deviceView(views);
  const events: CalendarItem[] = itemsInView(items, savedView);
  // The week view shows each day's dinner under the date.
  const dinners = view === "week" ? await dinnersFor(days) : new Map<LocalDate, Dinner>();
  const profiles = profilesFor(days, items, layers, household);
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const { placing, pending, templateHref } = readAdding(params, household.settings, members, templates, tags, "/calendar");
  const memberById = new Map(members.map((m) => [m.id, m]));

  // The event being edited might be outside the visible range, so fetch it on its own.
  let editing: CalendarEvent | null = null;
  if (editId) {
    const { data } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("id", editId)
      .maybeSingle();
    editing = data ? toEvent(data) : null;
  }

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

  // Open the edit card on the side away from the event, so it stays in view.
  const editDay = editOccurrence ?? (editing ? localDateOf(new Date(editing.starts_at), timeZone) : today);
  const editSide = (dayOfWeek(editDay) - weekStartsOn + 7) % 7 >= 4 ? "left" : "right";
  // Week and the rolling 5 weeks move a week at a time; the calendar month moves a month.
  const byMonth = view === "month" && !rolling;
  const step = (n: number) => (byMonth ? addMonths(anchor, n) : addDays(anchor, 7 * n));
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  // The Today panel on the left: what's still to come today, soonest first.
  const panelPrefs = await readPanelPrefs();
  const panelReturn = `/calendar?${returnTo}`;
  const now = new Date();
  // Up next is always about today, even when the calendar shows another month.
  let todayEvents = events;
  if (!days.includes(today)) {
    const todayRange = rangeOf([today], timeZone);
    todayEvents = panelPrefs.open ? itemsInView((await loadCalendar(todayRange.rangeStart, todayRange.rangeEnd)).items, savedView) : [];
  }
  const upNext: UpNextItem[] = eventsOnDay(todayEvents, today, timeZone)
    .filter((e) => !isAllDayStyle(e, timeZone) && new Date(e.ends_at) > now)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .map((e) => ({
      id: `${e.id}|${e.occurrence_date ?? ""}`,
      title: e.title,
      emoji: eventEmoji(e.icon, e.title),
      time: new Date(e.starts_at) <= now ? "Now" : shortTime(new Date(e.starts_at), household),
      colour: eventColour(e, memberById),
    }));

  return (
    <>
      <div className="flex flex-col gap-7 lg:min-h-0 lg:flex-1 lg:flex-row">
      {panelPrefs.open ? (
        <TodayPanel household={household} today={today} upNext={upNext} tab={panelPrefs.tab} returnTo={panelReturn} />
      ) : (
        <OpenPanelTab returnTo={panelReturn} />
      )}
      <div className={`flex min-w-0 flex-1 flex-col gap-3.5 lg:min-h-0 ${panelPrefs.open ? "" : "lg:pl-5"}`}>
      <ScreenHeader title={rangeTitle(view, days, anchor, household)}>
        {panelPrefs.open ? null : <HeaderClock locale={locale} timeZone={timeZone} />}
        <div className="flex items-center gap-2">
          <IconLink href={href({ date: step(-1), edit: null, add: null, panel: null })} label={byMonth ? "Previous month" : "Previous week"} icon={CaretLeft} />
          <SoftLink href={href({ date: today, edit: null, add: null, panel: null })}>Today</SoftLink>
          <IconLink href={href({ date: step(1), edit: null, add: null, panel: null })} label={byMonth ? "Next month" : "Next week"} icon={CaretRight} />
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
          <SoftLink href={href({ panel: "tags", edit: null, add: null })}>
            <Tag size="1.5rem" aria-hidden />
            Tags
          </SoftLink>
          <SoftLink href={href({ panel: "layers", edit: null, add: null })}>
            <Stack size="1.5rem" aria-hidden />
            {savedView ? savedView.name : "Layers"}
          </SoftLink>
          <Segmented
            label="How much to show"
            options={[
              { href: "/", label: "Day", active: false },
              { href: href({ view: "week", edit: null, add: null, panel: null }), label: "Week", active: view === "week" },
              { href: href({ view: "month", edit: null, add: null, panel: null }), label: "Month", active: view === "month" },
            ]}
          />
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {placing ? (
        <PlacingBar
          hint={view === "week" ? "Tap a time to add an event there, or drag down to set how long. Tap a day's name for all day." : "Tap a day to add an event on it."}
          cancelHref={closeHref}
        />
      ) : null}

      {view === "week" ? <PeopleRow data={routineData} date={today} hrefFor={(id) => `/routines?member=${id}`} /> : null}

      {view === "week" ? (
        <WeekView
          household={household}
          days={days}
          today={today}
          events={events}
          memberById={memberById}
          href={href}
          profiles={profiles}
          dinners={dinners}
          adding={{ placing, pending, addHref }}
        />
      ) : (
        <MonthView
          household={household}
          days={days}
          today={today}
          events={events}
          memberById={memberById}
          href={href}
          profiles={profiles}
          anchor={anchor}
          mode={rolling ? "weeks" : "month"}
          adding={{ placing, pending, addHref }}
        />
      )}
      </div>
      </div>

      {/* Add button, bottom right: starts adding mode, or cancels it. */}
      <Link
        href={placing ? closeHref : href({ placing: "1", edit: null, add: null, panel: null })}
        scroll={false}
        aria-label={placing ? "Stop adding" : "Add an event"}
        title={placing ? "Stop adding" : "Add an event"}
        className={`fixed right-10 bottom-8.5 z-30 flex size-23 items-center justify-center rounded-full text-white shadow-[0_0.5rem_1.375rem_rgba(30,35,45,0.28)] ${
          placing ? "bg-accent" : "bg-ink"
        }`}
      >
        {placing ? <X size="2.625rem" weight="bold" aria-hidden /> : <Plus size="2.625rem" weight="bold" aria-hidden />}
      </Link>

      {editing ? (
        <Sheet title={editing.title} closeHref={closeHref} narrow side={editSide}>
          <EditEventPanel
            everyDateHref={href({ edit: editing.id, occ: editOccurrence ?? null, scope: "all", add: null, panel: null })}
            showEveryDate={firstParam(params.scope) === "all"}
            event={editing}
            household={household}
            layers={layers}
            members={members}
            tags={tags}
            returnTo={returnTo}
            closeHref={closeHref}
            occurrence={editOccurrence && editing.recurrence_rule ? (events.find((e) => e.series_id === editing?.id && e.occurrence_date === editOccurrence) ?? null) : null}
            occurrenceDate={editing.recurrence_rule ? editOccurrence : undefined}
            isException={Boolean(editOccurrence && exceptions.some((x) => x.event_id === editing?.id && x.original_date === editOccurrence))}
            skippedDates={exceptions.filter((x) => x.event_id === editing?.id && x.skipped).map((x) => x.original_date).sort()}
            memberName={editing.member_ids.map((id) => memberById.get(id)?.name).filter(Boolean).join(" and ") || undefined}
            headsUps={await loadHeadsUps({ eventId: editing.id })}
            headsUpReturn={`/calendar?${returnTo}&edit=${editing.id}&scope=all&tab=heads-ups`}
            initialTab={firstParam(params.tab)}
          />
        </Sheet>
      ) : null}

      {pending && !editing ? (
        <QuickAddSheet
          // A day late in the week opens the card on the left, so the day stays in view.
          side={(dayOfWeek(pending.date) - weekStartsOn + 7) % 7 >= 4 ? "left" : "right"}
          pending={pending} layers={layers} members={members} tags={tags} templates={templates} templateHref={templateHref} closeHref={closeHref} returnTo={returnTo} returnPath="/calendar" />
      ) : null}

      {panel === "tags" ? (
        <Sheet title="Tags and templates" closeHref={closeHref} narrow>
          <TagsPanel tags={tags} templates={templates} memberById={memberById} tagById={new Map(tags.map((t) => [t.id, t]))} returnTo={returnTo} />
        </Sheet>
      ) : null}

      {panel === "layers" ? (
        <Sheet title="Layers and views" closeHref={closeHref}>
          <LayersPanel
            layers={layers}
            views={views}
            savedView={savedView}
            members={members}
            memberById={memberById}
            layerById={layerById}
            returnTo={returnTo}
          />
        </Sheet>
      ) : null}
    </>
  );
}

/** Which layers this screen shows, and adding or changing layers and views. */
function LayersPanel({
  layers,
  views,
  savedView,
  members,
  memberById,
  layerById,
  returnTo,
}: {
  layers: Layer[];
  views: SavedView[];
  savedView: SavedView | null;
  members: Member[];
  memberById: Map<string, Member>;
  layerById: Map<string, Layer>;
  returnTo: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <ViewChooser views={views} current={savedView} returnTo={returnTo} returnPath="/calendar" />

      <section>
        <h3 className="mb-1 text-2xl font-bold text-ink">Layers</h3>
        <p className="mb-4 text-lg text-ink-muted">
          Every event belongs to a layer, like Court or Kids. Blocks on the calendar take the colour of the person
          they&apos;re for.
        </p>
        <ul className="mb-6 flex flex-col gap-3">
          {layers.map((layer) => (
            <li key={layer.id} className="rounded-[var(--radius-card)] border border-frame p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="size-5 rounded-full" style={{ background: strong(layer.colour) }} />
                <span className="text-xl font-bold text-ink">{layer.name}</span>
                <span className="text-lg text-ink-muted">
                  {visibilityLabel(layer.visibility)}
                  {layer.owner_member_id ? ` · ${memberById.get(layer.owner_member_id)?.name ?? ""}'s` : ""}
                  {layer.counts_toward_busyness ? "" : " · doesn't count toward busy"}
                </span>
              </div>
              <details className="mt-2">
                <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-lg font-bold text-accent">Edit</summary>
                <form action={updateLayer} className="mt-2 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={layer.id} />
                  <input type="hidden" name="returnTo" value={`${returnTo}&panel=layers`} />
                  <LayerFields layer={layer} members={members} />
                  <div className="sm:col-span-2">
                    <Button>Save layer</Button>
                  </div>
                </form>
                <form action={removeLayer} className="mt-4">
                  <input type="hidden" name="id" value={layer.id} />
                  <input type="hidden" name="name" value={layer.name} />
                  <input type="hidden" name="returnTo" value={`${returnTo}&panel=layers`} />
                  <Button variant="danger">Remove {layer.name} and its events</Button>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <details className="rounded-[var(--radius-card)] bg-rail p-4">
          <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-xl font-bold text-ink">Add a layer</summary>
          <form action={addLayer} className="mt-2 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="returnTo" value={`${returnTo}&panel=layers`} />
            <LayerFields members={members} />
            <div className="sm:col-span-2">
              <Button>Add layer</Button>
            </div>
          </form>
        </details>
      </section>

      <section>
        <h3 className="mb-1 text-2xl font-bold text-ink">Views</h3>
        <p className="mb-4 text-lg text-ink-muted">
          A view is a set of layers, like &ldquo;Court and appointments&rdquo;. Each screen remembers the view you
          picked on it, so the wall can show everything while a phone shows just a few layers.
        </p>
        <ul className="mb-6 flex flex-col gap-3">
          {views.map((v) => (
            <li key={v.id} className="rounded-[var(--radius-card)] border border-frame p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl font-bold text-ink">{v.name}</span>
                <span className="text-lg text-ink-muted">
                  {v.layer_ids.map((id) => layerById.get(id)?.name).filter(Boolean).join(", ") || "No layers"}
                </span>
              </div>
              <details className="mt-2">
                <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-lg font-bold text-accent">Edit</summary>
                <form action={updateView} className="mt-2 grid gap-4">
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="returnTo" value={`${returnTo}&panel=layers`} />
                  <ViewFields layers={layers} view={v} />
                  <div>
                    <Button>Save view</Button>
                  </div>
                </form>
                <form action={removeView} className="mt-4">
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="name" value={v.name} />
                  <input type="hidden" name="returnTo" value={`${returnTo}&panel=layers`} />
                  <Button variant="danger">Remove the {v.name} view</Button>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <details className="rounded-[var(--radius-card)] bg-rail p-4">
          <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-xl font-bold text-ink">Add a view</summary>
          <form action={addView} className="mt-2 grid gap-4">
            <input type="hidden" name="returnTo" value={`${returnTo}&panel=layers`} />
            <ViewFields layers={layers} />
            <div>
              <Button>Add view</Button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}

function EditEventPanel({
  event,
  household,
  layers,
  members,
  tags,
  returnTo,
  closeHref,
  memberName,
  occurrence,
  occurrenceDate,
  isException,
  skippedDates,
  everyDateHref,
  showEveryDate,
  headsUps,
  headsUpReturn,
  initialTab,
}: {
  headsUps: HeadsUp[];
  headsUpReturn: string;
  initialTab: string | undefined;
  skippedDates: string[];
  occurrence: CalendarItem | null;
  occurrenceDate: string | undefined;
  isException: boolean;
  event: CalendarEvent;
  household: Household;
  layers: Layer[];
  members: Member[];
  tags: TagType[];
  returnTo: string;
  closeHref: string;
  memberName: string | undefined;
  /** For a repeating event: the link that switches to changing every date. */
  everyDateHref: string;
  showEveryDate: boolean;
}) {
  const { timeZone } = household.settings;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const startDate = localDateOf(start, timeZone);
  const endDate = event.all_day ? addDays(localDateOf(end, timeZone), -1) : localDateOf(end, timeZone);
  const summary = (
    <p className="shrink-0 text-lg text-ink-muted">
      {memberName ? `For ${memberName} · ` : ""}
      {describeRule(event.recurrence_rule)}
    </p>
  );

  // A repeating event opens on "just this date" first; every date is one tap away.
  if (occurrenceDate && !showEveryDate) {
    return (
      <div className="flex h-full flex-col gap-5">
        {summary}
        <OccurrenceControls
          event={event}
          household={household}
          occurrence={occurrence}
          occurrenceDate={occurrenceDate}
          isException={isException}
          returnTo={returnTo}
        />
        {skippedDates.length > 0 ? <SkippedDates event={event} dates={skippedDates} returnTo={returnTo} /> : null}
        <div className="mt-auto flex shrink-0 gap-3">
          <Link
            href={everyDateHref}
            scroll={false}
            className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] bg-ink px-5 text-lg font-bold text-board"
          >
            Change every date
          </Link>
          <CloseLink href={closeHref} label="Close" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {summary}
      <form id="edit-event" action={updateEvent} className="group flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="id" value={event.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <EventCardFields
          layers={layers}
          members={members}
          tags={tags}
          defaults={{
            title: event.title,
            layerId: event.layer_id,
            date: startDate,
            endDate: event.all_day ? endDate : undefined,
            allDay: event.all_day,
            startTime: event.all_day ? undefined : localTimeOf(start, timeZone),
            minutes: event.all_day ? household.settings.defaultEventMinutes : Math.round((end.getTime() - start.getTime()) / 60_000),
            memberIds: event.member_ids,
            tagIds: event.tag_ids,
            energyCost: event.energy_cost,
            visibility: event.visibility,
            notes: event.notes ?? "",
            icon: event.icon ?? "",
            repeat: parseRule(event.recurrence_rule),
          }}
          headsUps={<HeadsUpEditor headsUps={headsUps} source={{ eventId: event.id }} returnTo={headsUpReturn} what={event.recurrence_rule ? "each one" : "it"} />}
          initialTab={initialTab}
        />
      </form>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button form="edit-event">{event.recurrence_rule ? "Save every date" : "Save"}</Button>
        <CloseLink href={closeHref} />
        <form action={removeEvent} className="ml-auto">
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="title" value={event.title} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button variant="danger">{event.recurrence_rule ? "Remove every date" : "Remove"}</Button>
        </form>
      </div>
    </div>
  );
}

/** How many skipped dates to list before "and N more". */
const SKIPPED_LIMIT = 6;

/** Dates skipped from a repeating event, each with a way to bring it back. */
function SkippedDates({ event, dates, returnTo }: { event: CalendarEvent; dates: string[]; returnTo: string }) {
  const shown = dates.slice(-SKIPPED_LIMIT);
  return (
    <div className="shrink-0">
      <h3 className="mb-2 text-lg font-bold text-ink">Skipped dates</h3>
      <ul className="flex flex-wrap gap-2">
        {shown.map((date) => (
          <li key={date}>
            <form action={resetOccurrence} className="flex items-center gap-2 rounded-[var(--radius)] bg-rail pl-3">
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="occurrenceDate" value={date} />
              <input type="hidden" name="title" value={event.title} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <span className="text-base text-ink">{date}</span>
              <Button variant="secondary" className="border-0">
                Bring back
              </Button>
            </form>
          </li>
        ))}
      </ul>
      {dates.length > shown.length ? <p className="mt-2 text-base text-ink-muted">and {dates.length - shown.length} earlier</p> : null}
    </div>
  );
}

/** "Just this one" controls for one date of a repeating event. */
function OccurrenceControls({
  event,
  household,
  occurrence,
  occurrenceDate,
  isException,
  returnTo,
}: {
  event: CalendarEvent;
  household: Household;
  occurrence: CalendarItem | null;
  occurrenceDate: string;
  isException: boolean;
  returnTo: string;
}) {
  const { timeZone, locale } = household.settings;
  const start = occurrence ? new Date(occurrence.starts_at) : zonedToUtc(occurrenceDate, localTimeOf(new Date(event.starts_at), event.timezone), timeZone);
  const end = occurrence ? new Date(occurrence.ends_at) : new Date(start.getTime() + (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()));
  const dayLabel = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(
    zonedToUtc(occurrenceDate, "12:00", timeZone),
  );
  const hidden = (
    <>
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="occurrenceDate" value={occurrenceDate} />
      <input type="hidden" name="title" value={event.title} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  return (
    <div className="shrink-0 rounded-[var(--radius-card)] bg-rail p-5">
      <h3 className="mb-1 text-xl font-semibold text-ink">Just {dayLabel}</h3>
      <p className="mb-4 text-base text-ink-muted">Changes here leave the rest of the dates alone.</p>
      <form action={moveOccurrence} className="grid gap-4 sm:grid-cols-3">
        {hidden}
        <input type="hidden" name="allDay" value={String(event.all_day)} />
        <Field label="Move to">
          <Input name="newDate" type="date" defaultValue={localDateOf(start, timeZone)} required />
        </Field>
        {event.all_day ? null : (
          <>
            <Field label="Starts at">
              <Input name="newStartTime" type="time" defaultValue={localTimeOf(start, timeZone)} required />
            </Field>
            <Field label="Ends at">
              <Input name="newEndTime" type="time" defaultValue={localTimeOf(end, timeZone)} required />
            </Field>
          </>
        )}
        <div className="sm:col-span-3">
          <Button variant="secondary" className="bg-board">Move this one</Button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap gap-3">
        <form action={skipOccurrence}>
          {hidden}
          <Button variant="danger">Skip this one</Button>
        </form>
        {isException ? (
          <form action={resetOccurrence}>
            {hidden}
            <Button variant="secondary">Put back to normal</Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function CloseLink({ href, label = "Cancel" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] bg-rail px-5 text-lg font-bold text-ink"
    >
      {label}
    </Link>
  );
}

/**
 * Each day's dinner: the planned meals at the dinner meal time (the one
 * called Dinner or Supper, else the latest in the day).
 */
async function dinnersFor(days: LocalDate[]): Promise<Map<LocalDate, Dinner>> {
  const [basics, meals] = await Promise.all([loadMealBasics(), loadMeals(days[0], days[days.length - 1])]);
  const times = basics.mealTimes.toSorted((x, y) => (x.usual_time ?? "").localeCompare(y.usual_time ?? ""));
  const dinner = times.find((t) => /dinner|supper/i.test(t.name)) ?? times.at(-1);
  const recipes = new Map(basics.recipes.map((r) => [r.id, r]));
  const categories = new Map(basics.categories.map((c) => [c.id, c]));
  const result = new Map<LocalDate, Dinner>();
  if (!dinner) return result;
  for (const day of days) {
    const here = meals.filter((m) => m.date === day && m.meal_time_id === dinner.id && (m.status === "planned" || m.status === "cooked"));
    if (here.length === 0) continue;
    result.set(day, { name: mealName(here[0], recipes, categories), icon: mealIcon(here[0], recipes, categories), more: here.length - 1 });
  }
  return result;
}

function rangeTitle(view: View, days: LocalDate[], anchor: LocalDate, household: Household): string {
  const { locale, timeZone } = household.settings;
  const noon = (d: LocalDate) => zonedToUtc(d, "12:00", timeZone);
  // Month is titled with the month either way (today's, unless you've moved).
  if (view !== "week") {
    return new Intl.DateTimeFormat(locale, { timeZone, month: "long", year: "numeric" }).format(noon(anchor));
  }
  const first = days[0];
  const last = days[6];
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const fmt = new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" });
  const year = last.slice(0, 4);
  return sameMonth
    ? `${fmt.format(noon(first))} – ${Number(last.slice(8))}, ${year}`
    : `${fmt.format(noon(first))} – ${fmt.format(noon(last))}, ${year}`;
}

function visibilityLabel(value: string): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * The tags and templates you've made, with a way to remove each. New ones
 * are made on the add card ("New tag", and "Save as a template too").
 */
function TagsPanel({
  tags,
  templates,
  memberById,
  tagById,
  returnTo,
}: {
  tags: TagType[];
  templates: EventTemplate[];
  memberById: Map<string, Member>;
  tagById: Map<string, TagType>;
  returnTo: string;
}) {
  const back = `${returnTo}&panel=tags`;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-2xl font-bold text-ink">Tags</h3>
        {tags.length === 0 ? <p className="text-lg text-ink-muted">No tags yet. Tap &ldquo;New tag&rdquo; when adding an event.</p> : null}
        <ul className="grid grid-cols-2 gap-2">
          {tags.slice(0, 16).map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius)] border border-frame py-1 pr-1 pl-3">
              <Emoji emoji={t.icon || eventEmoji(null, t.name)} className="size-8" />
              <span className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{t.name}</span>
              <form action={removeTag}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="name" value={t.name} />
                <input type="hidden" name="returnTo" value={back} />
                <RemoveButton label={`Remove the ${t.name} tag`} />
              </form>
            </li>
          ))}
        </ul>
        {tags.length > 16 ? <p className="text-base text-ink-muted">+ {tags.length - 16} more</p> : null}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-2xl font-bold text-ink">Templates</h3>
        {templates.length === 0 ? (
          <p className="text-lg text-ink-muted">No templates yet. Tick &ldquo;Save as a template too&rdquo; when adding an event.</p>
        ) : null}
        <ul className="grid grid-cols-2 gap-2">
          {templates.slice(0, 8).map((t) => {
            const who = t.member_ids.map((id) => memberById.get(id)?.name).filter(Boolean).join(", ");
            const tagNames = t.tag_ids.map((id) => tagById.get(id)?.name).filter(Boolean).join(", ");
            const when = t.all_day ? "All day" : `${t.start_time ? `${t.start_time}, ` : ""}${lengthLabel(t.minutes)}`;
            return (
              <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius)] border border-frame py-1 pr-1 pl-3">
                <Emoji emoji={t.icon || eventEmoji(null, t.title)} className="size-8" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-lg font-bold text-ink">{t.title}</span>
                  <span className="truncate text-sm text-ink-muted">{[when, who, tagNames].filter(Boolean).join(" · ")}</span>
                </span>
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
        {templates.length > 8 ? <p className="text-base text-ink-muted">+ {templates.length - 8} more</p> : null}
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
