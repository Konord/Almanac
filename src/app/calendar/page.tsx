import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, Plus, Stack } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Field, IconLink, Input, Notice, ScreenHeader, Segmented, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { Sheet } from "@/components/sheet";
import { strong } from "@/lib/colours";
import { addMonths, monthGridDays, weekDays } from "@/lib/calendar-layout";
import { requireHousehold, type Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { describeRule, parseRule } from "@/lib/recurrence";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import {
  addEvent,
  addLayer,
  addView,
  removeView,
  updateView,
  moveOccurrence,
  removeEvent,
  removeLayer,
  resetOccurrence,
  skipOccurrence,
  updateEvent,
  updateLayer,
} from "./actions";
import { EventFields, LayerFields, ViewFields } from "./forms";
import { ViewChooser } from "./view-chooser";
import { VISIBILITY_OPTIONS } from "./options";
import { deviceView, EVENT_COLUMNS, itemsInView, loadCalendar, profilesFor, rangeOf } from "./data";
import type { CalendarEvent, CalendarItem, Layer, Member, SavedView } from "./types";
import { loadRoutines } from "../routines/data";
import { PeopleRow } from "../routines/people-row";
import { MonthView, WeekView } from "./views";

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
  const dateParam = firstParam(params.date);
  const anchor = dateParam && isLocalDate(dateParam) ? dateParam : today;
  const editId = firstParam(params.edit);
  const occParam = firstParam(params.occ);
  const editOccurrence = occParam && isLocalDate(occParam) ? occParam : undefined;
  const addParam = firstParam(params.add);
  const addDate = addParam && isLocalDate(addParam) ? addParam : undefined;
  const panel = firstParam(params.panel) === "layers" ? "layers" : null;

  const days = view === "week" ? weekDays(anchor, weekStartsOn) : monthGridDays(anchor, weekStartsOn);
  const { rangeStart, rangeEnd } = rangeOf(days, timeZone);
  const [{ layers, members, views, items, exceptions }, routineData] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
  ]);
  const savedView = await deviceView(views);
  const events: CalendarItem[] = itemsInView(items, savedView);
  const profiles = profilesFor(days, items, layers, household);
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // The event being edited might be outside the visible range, so fetch it on its own.
  let editing: CalendarEvent | null = null;
  if (editId) {
    const { data } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("id", editId)
      .maybeSingle();
    editing = data;
  }

  const current: Record<string, string | null> = { view, date: anchor };
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | null> = { ...current, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/calendar?${next.toString()}`;
  };
  const returnTo = `view=${view}&date=${anchor}`;
  const closeHref = href({ edit: null, occ: null, add: null, panel: null });

  const step = (n: number) => (view === "week" ? addDays(anchor, 7 * n) : addMonths(anchor, n));
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader title={rangeTitle(view, days, anchor, household)}>
        <HeaderClock locale={locale} timeZone={timeZone} />
        <div className="flex items-center gap-2">
          <IconLink href={href({ date: step(-1), edit: null, add: null, panel: null })} label={view === "week" ? "Previous week" : "Previous month"} icon={CaretLeft} />
          <SoftLink href={href({ date: today, edit: null, add: null, panel: null })}>Today</SoftLink>
          <IconLink href={href({ date: step(1), edit: null, add: null, panel: null })} label={view === "week" ? "Next week" : "Next month"} icon={CaretRight} />
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
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

      {view === "week" ? <PeopleRow data={routineData} date={today} hrefFor={(id) => `/routines?member=${id}`} /> : null}

      {view === "week" ? (
        <WeekView household={household} days={days} today={today} events={events} memberById={memberById} href={href} profiles={profiles} />
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
        />
      )}

      {/* Add button, bottom right */}
      <Link
        href={href({ add: anchor >= days[0] && anchor <= days[days.length - 1] ? anchor : days[0], edit: null, panel: null })}
        scroll={false}
        aria-label="Add an event"
        title="Add an event"
        className="fixed right-10 bottom-8.5 z-30 flex size-23 items-center justify-center rounded-full bg-ink text-white shadow-[0_0.5rem_1.375rem_rgba(30,35,45,0.28)]"
      >
        <Plus size="2.625rem" weight="bold" aria-hidden />
      </Link>

      {editing ? (
        <Sheet title={editing.title} closeHref={closeHref}>
          <EditEventPanel
            event={editing}
            household={household}
            layers={layers}
            members={members}
            returnTo={returnTo}
            closeHref={closeHref}
            occurrence={editOccurrence && editing.recurrence_rule ? (events.find((e) => e.series_id === editing?.id && e.occurrence_date === editOccurrence) ?? null) : null}
            occurrenceDate={editing.recurrence_rule ? editOccurrence : undefined}
            isException={Boolean(editOccurrence && exceptions.some((x) => x.event_id === editing?.id && x.original_date === editOccurrence))}
            skippedDates={exceptions.filter((x) => x.event_id === editing?.id && x.skipped).map((x) => x.original_date).sort()}
            memberName={editing.member_id ? memberById.get(editing.member_id)?.name : undefined}
          />
        </Sheet>
      ) : null}

      {addDate && !editing ? (
        <Sheet title="Add an event" closeHref={closeHref}>
          {layers.length === 0 ? (
            <p className="text-lg text-ink-muted">Add a layer first (under Layers).</p>
          ) : (
            <form action={addEvent} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="returnTo" value={`view=${view}&date=${addDate}`} />
              <EventFields layers={layers} members={members} defaults={{ startDate: addDate }} />
              <div className="flex gap-3 sm:col-span-2">
                <Button>Add event</Button>
                <CloseLink href={closeHref} />
              </div>
            </form>
          )}
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
  returnTo,
  closeHref,
  memberName,
  occurrence,
  occurrenceDate,
  isException,
  skippedDates,
}: {
  skippedDates: string[];
  occurrence: CalendarItem | null;
  occurrenceDate: string | undefined;
  isException: boolean;
  event: CalendarEvent;
  household: Household;
  layers: Layer[];
  members: Member[];
  returnTo: string;
  closeHref: string;
  memberName: string | undefined;
}) {
  const { timeZone } = household.settings;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const startDate = localDateOf(start, timeZone);
  const endDate = event.all_day ? addDays(localDateOf(end, timeZone), -1) : localDateOf(end, timeZone);

  return (
    <div>
      <p className="mb-5 text-lg text-ink-muted">
        {memberName ? `For ${memberName} · ` : ""}
        {describeRule(event.recurrence_rule)}
      </p>
      {occurrenceDate ? (
        <OccurrenceControls
          event={event}
          household={household}
          occurrence={occurrence}
          occurrenceDate={occurrenceDate}
          isException={isException}
          returnTo={returnTo}
        />
      ) : null}
      {skippedDates.length > 0 ? (
        <div className="mb-6">
          <h3 className="mb-2 text-lg font-semibold text-ink">Skipped dates</h3>
          <ul className="flex flex-wrap gap-2">
            {skippedDates.map((date) => (
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
        </div>
      ) : null}
      {event.recurrence_rule ? (
        <h3 className="mb-3 text-xl font-semibold text-ink">Every date</h3>
      ) : null}
      <form action={updateEvent} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={event.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <EventFields
          layers={layers}
          members={members}
          defaults={{
            title: event.title,
            layerId: event.layer_id,
            startDate,
            endDate,
            allDay: event.all_day,
            startTime: event.all_day ? "" : localTimeOf(start, timeZone),
            endTime: event.all_day ? "" : localTimeOf(end, timeZone),
            memberId: event.member_id ?? "",
            energyCost: event.energy_cost,
            visibility: event.visibility,
            notes: event.notes ?? "",
            icon: event.icon ?? "",
            repeat: parseRule(event.recurrence_rule),
          }}
        />
        <div className="flex gap-3 sm:col-span-2">
          <Button>{event.recurrence_rule ? "Save every date" : "Save event"}</Button>
          <CloseLink href={closeHref} />
        </div>
      </form>
      <form action={removeEvent} className="mt-4">
        <input type="hidden" name="id" value={event.id} />
        <input type="hidden" name="title" value={event.title} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button variant="danger">{event.recurrence_rule ? "Remove every date" : "Remove event"}</Button>
      </form>
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
    <div className="mb-8 rounded-[var(--radius-card)] bg-rail p-5">
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
          <Button variant="secondary">Move this one</Button>
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

function CloseLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] bg-rail px-5 text-lg font-bold text-ink"
    >
      Cancel
    </Link>
  );
}

function rangeTitle(view: View, days: LocalDate[], anchor: LocalDate, household: Household): string {
  const { locale, timeZone } = household.settings;
  const noon = (d: LocalDate) => zonedToUtc(d, "12:00", timeZone);
  if (view === "month") {
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
