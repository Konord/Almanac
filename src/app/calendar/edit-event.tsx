import Link from "next/link";
import { Button, editorInputClass } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import type { Household } from "@/lib/household";
import { describeRule, parseRule } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc } from "@/lib/time";
import { HeadsUpEditor, loadHeadsUps, type HeadsUp } from "../heads-ups/editor";
import { moveOccurrence, removeEvent, resetOccurrence, saveEventAsTemplate, skipOccurrence, updateEvent } from "./actions";
import { EVENT_COLUMNS, toEvent } from "./data";
import { EventCardFields, SheetField } from "./forms";
import type { CalendarEvent, DayKind, Member } from "./types";

/*
 * The edit event sheet (g-final-event.html), opened by tapping an event on
 * the Agenda, Week, or a day from Month. Nothing drags or resizes events
 * (Connor, 15 Nov): every change is made here.
 *
 *   ?edit=<event id>        the whole event (Event | Repeats | More | Heads-ups)
 *   &occ=<date>             a repeating event opens on just that date first
 *   &scope=all              ... or on every date
 *   &tab=heads-ups          open on the Heads-ups tab (after adding one)
 */

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** What the address asks to edit, if anything. */
export function readEditing(params: Params): { id: string; occ?: string; all: boolean; tab?: string } | null {
  const id = first(params.edit);
  if (!id) return null;
  const occ = first(params.occ);
  return { id, occ: occ && isLocalDate(occ) ? occ : undefined, all: first(params.scope) === "all", tab: first(params.tab) };
}

/**
 * Loads the event and draws its sheet. `here` is this page's own address
 * (e.g. "/?date=2026-11-20" or "/calendar?view=week&date=…"), to come back
 * to after a change; `returnTo` and `returnPath` are what the save actions
 * send you back to.
 */
export async function EditEventSheet({
  editing,
  household,
  members,
  dayKinds,
  here,
  returnTo,
  returnPath,
  side = "right",
}: {
  editing: { id: string; occ?: string; all: boolean; tab?: string };
  household: Household;
  members: Member[];
  dayKinds: DayKind[];
  here: string;
  returnTo: string;
  returnPath: "/" | "/calendar";
  side?: "left" | "right" | ((event: CalendarEvent) => "left" | "right");
}) {
  const supabase = await createClient();
  const [{ data }, { data: exceptions }, headsUps] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", editing.id).maybeSingle(),
    supabase.from("event_exceptions").select("original_date, skipped, new_starts_at, new_ends_at").eq("event_id", editing.id),
    loadHeadsUps({ eventId: editing.id }),
  ]);
  if (!data) return null;
  const event = toEvent(data);
  const join = here.includes("?") ? "&" : "?";
  const editHref = (extra: string) => `${here}${join}edit=${event.id}${extra}`;
  const occurrenceDate = event.recurrence_rule ? editing.occ : undefined;
  const exception = occurrenceDate ? (exceptions ?? []).find((x) => x.original_date === occurrenceDate) : undefined;
  const memberById = new Map(members.map((m) => [m.id, m]));
  return (
    <Sheet title="Edit event" closeHref={here} floating side={typeof side === "function" ? side(event) : side}>
      <EditEventPanel
        event={event}
        household={household}
        members={members}
        dayKinds={dayKinds}
        returnTo={returnTo}
        returnPath={returnPath}
        closeHref={here}
        memberName={event.member_ids.map((id) => memberById.get(id)?.name).filter(Boolean).join(" and ") || undefined}
        occurrenceDate={occurrenceDate}
        moved={exception?.new_starts_at && exception.new_ends_at ? { starts_at: exception.new_starts_at, ends_at: exception.new_ends_at } : null}
        isException={Boolean(exception)}
        skippedDates={(exceptions ?? []).filter((x) => x.skipped).map((x) => x.original_date).sort()}
        everyDateHref={editHref(`${occurrenceDate ? `&occ=${occurrenceDate}` : ""}&scope=all`)}
        showEveryDate={editing.all}
        headsUps={headsUps}
        headsUpReturn={editHref("&scope=all&tab=heads-ups")}
        initialTab={editing.tab}
      />
    </Sheet>
  );
}

function EditEventPanel({
  event,
  household,
  members,
  dayKinds,
  returnTo,
  returnPath,
  closeHref,
  memberName,
  occurrenceDate,
  moved,
  isException,
  skippedDates,
  everyDateHref,
  showEveryDate,
  headsUps,
  headsUpReturn,
  initialTab,
}: {
  event: CalendarEvent;
  household: Household;
  members: Member[];
  dayKinds: DayKind[];
  returnTo: string;
  returnPath: "/" | "/calendar";
  closeHref: string;
  memberName: string | undefined;
  occurrenceDate: string | undefined;
  /** A date of a repeating event that's been moved: its new times. */
  moved: { starts_at: string; ends_at: string } | null;
  isException: boolean;
  skippedDates: string[];
  /** For a repeating event: the link that switches to changing every date. */
  everyDateHref: string;
  showEveryDate: boolean;
  headsUps: HeadsUp[];
  headsUpReturn: string;
  initialTab: string | undefined;
}) {
  const { timeZone } = household.settings;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const startDate = localDateOf(start, timeZone);
  const endDate = event.all_day ? addDays(localDateOf(end, timeZone), -1) : localDateOf(end, timeZone);
  const back = (
    <>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="returnPath" value={returnPath} />
    </>
  );

  // A repeating event opens on "just this date" first; every date is one tap away.
  if (occurrenceDate && !showEveryDate) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        <p className="shrink-0 text-[1.25rem] font-bold text-ink-soft">
          {event.title}
          {memberName ? ` · for ${memberName}` : ""} · {describeRule(event.recurrence_rule)}
        </p>
        <OccurrenceControls event={event} household={household} moved={moved} occurrenceDate={occurrenceDate} isException={isException} back={back} />
        {skippedDates.length > 0 ? <SkippedDates event={event} dates={skippedDates} back={back} /> : null}
        <div className="flex shrink-0 justify-end gap-[0.6rem] pt-1">
          <CloseLink href={closeHref} label="Close" />
          <Link href={everyDateHref} scroll={false} className={primaryLinkClass}>
            Change every date
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <form id="edit-event" action={updateEvent} className="group flex min-h-0 flex-col">
        <input type="hidden" name="id" value={event.id} />
        {back}
        <EventCardFields
          members={members}
          dayKinds={dayKinds}
          defaults={{
            title: event.title,
            date: startDate,
            endDate: event.all_day ? endDate : undefined,
            allDay: event.all_day,
            startTime: event.all_day ? undefined : localTimeOf(start, timeZone),
            minutes: event.all_day ? household.settings.defaultEventMinutes : Math.round((end.getTime() - start.getTime()) / 60_000),
            memberIds: event.member_ids,
            visibility: event.visibility,
            notes: event.notes ?? "",
            dayKind: event.day_kind ?? undefined,
            icon: event.icon ?? "",
            location: event.location ?? "",
            repeat: parseRule(event.recurrence_rule),
          }}
          repeatText={event.recurrence_rule ? describeRule(event.recurrence_rule) : undefined}
          headsUps={<HeadsUpEditor headsUps={headsUps} source={{ eventId: event.id }} returnTo={headsUpReturn} />}
          initialTab={initialTab}
        />
      </form>
      <div className="flex shrink-0 items-center gap-[0.6rem] pt-1">
        <form action={removeEvent}>
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="title" value={event.title} />
          {back}
          <Button variant="danger">{event.recurrence_rule ? "Remove every date" : "Remove"}</Button>
        </form>
        <Button form="edit-event" formAction={saveEventAsTemplate} variant="secondary" className="ml-auto">
          Save as template
        </Button>
        <CloseLink href={closeHref} />
        <Button form="edit-event">Save</Button>
      </div>
    </>
  );
}

/** How many skipped dates to list before "and N earlier". */
const SKIPPED_LIMIT = 4;

/** Dates skipped from a repeating event, each with a way to bring it back. */
function SkippedDates({ event, dates, back }: { event: CalendarEvent; dates: string[]; back: React.ReactNode }) {
  const shown = dates.slice(-SKIPPED_LIMIT);
  return (
    <div className="flex shrink-0 flex-col gap-[0.35rem]">
      <h3 className="text-[1.15rem] font-bold text-ink-muted">Skipped dates</h3>
      <ul className="flex flex-wrap gap-[0.45rem]">
        {shown.map((date) => (
          <li key={date}>
            <form action={resetOccurrence} className="flex items-center gap-2 rounded-[var(--radius)] bg-panel pl-4">
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="occurrenceDate" value={date} />
              <input type="hidden" name="title" value={event.title} />
              {back}
              <span className="tabular text-[1.25rem] font-bold text-ink">{date}</span>
              <Button variant="secondary">Bring back</Button>
            </form>
          </li>
        ))}
      </ul>
      {dates.length > shown.length ? <p className="text-[1.125rem] font-semibold text-ink-muted">and {dates.length - shown.length} earlier</p> : null}
    </div>
  );
}

/** "Just this one" controls for one date of a repeating event. */
function OccurrenceControls({
  event,
  household,
  moved,
  occurrenceDate,
  isException,
  back,
}: {
  event: CalendarEvent;
  household: Household;
  moved: { starts_at: string; ends_at: string } | null;
  occurrenceDate: string;
  isException: boolean;
  back: React.ReactNode;
}) {
  const { timeZone, locale } = household.settings;
  const start = moved ? new Date(moved.starts_at) : zonedToUtc(occurrenceDate, localTimeOf(new Date(event.starts_at), event.timezone), timeZone);
  const end = moved ? new Date(moved.ends_at) : new Date(start.getTime() + (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()));
  const dayLabel = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(zonedToUtc(occurrenceDate, "12:00", timeZone));
  const hidden = (
    <>
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="occurrenceDate" value={occurrenceDate} />
      <input type="hidden" name="title" value={event.title} />
      {back}
    </>
  );

  return (
    <div className="flex shrink-0 flex-col gap-4 rounded-[var(--radius-card)] bg-rail p-5">
      <h3 className="text-[1.5rem] font-extrabold text-ink">Just {dayLabel}</h3>
      <form action={moveOccurrence} className="grid grid-cols-3 items-end gap-[0.7rem]">
        {hidden}
        <input type="hidden" name="allDay" value={String(event.all_day)} />
        <SheetField label="Move to">
          <input name="newDate" type="date" defaultValue={localDateOf(start, timeZone)} required className={editorInputClass} />
        </SheetField>
        {event.all_day ? null : (
          <>
            <SheetField label="Starts">
              <input name="newStartTime" type="time" defaultValue={localTimeOf(start, timeZone)} required className={editorInputClass} />
            </SheetField>
            <SheetField label="Ends">
              <input name="newEndTime" type="time" defaultValue={localTimeOf(end, timeZone)} required className={editorInputClass} />
            </SheetField>
          </>
        )}
        <div className="col-span-3">
          <Button variant="secondary" className="bg-board">
            Move this one
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-[0.6rem]">
        <form action={skipOccurrence}>
          {hidden}
          <Button variant="danger">Skip this one</Button>
        </form>
        {isException ? (
          <form action={resetOccurrence}>
            {hidden}
            <Button variant="secondary" className="bg-board">
              Put back to normal
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

const primaryLinkClass =
  "inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] bg-primary px-6 text-[1.25rem] font-bold text-primary-ink";

/** Cancel (or Close): the mock's grey `.btn.secondary`. */
export function CloseLink({ href, label = "Cancel" }: { href: string; label?: string }) {
  return (
    <Link href={href} scroll={false} className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] bg-panel px-6 text-[1.25rem] font-bold text-ink">
      {label}
    </Link>
  );
}
