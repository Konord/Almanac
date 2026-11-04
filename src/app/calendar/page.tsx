import { Suspense } from "react";
import Link from "next/link";
import { Button, Notice, Panel, firstParam } from "@/components/ui";
import { MEMBER_COLOUR_CLASS } from "@/lib/colours";
import { addMonths, monthGridDays, weekDays } from "@/lib/calendar-layout";
import { requireHousehold, type Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { addEvent, addLayer, removeEvent, removeLayer, updateEvent, updateLayer } from "./actions";
import { EventFields, LayerFields } from "./forms";
import { VISIBILITY_OPTIONS } from "./options";
import type { CalendarEvent, Layer, Member } from "./types";
import { MonthView, WeekView } from "./views";

type View = "week" | "month";

export default function CalendarPage(props: PageProps<"/calendar">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <CalendarContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function CalendarContent({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const household = await requireHousehold();
  const { timeZone, weekStartsOn } = household.settings;
  const params = await searchParams;
  const supabase = await createClient();

  const today = localDateOf(new Date(), timeZone);
  const view: View = firstParam(params.view) === "month" ? "month" : "week";
  const dateParam = firstParam(params.date);
  const anchor = dateParam && isLocalDate(dateParam) ? dateParam : today;
  const editId = firstParam(params.edit);
  const addParam = firstParam(params.add);
  const addDate = addParam && isLocalDate(addParam) ? addParam : undefined;

  const days = view === "week" ? weekDays(anchor, weekStartsOn) : monthGridDays(anchor, weekStartsOn);
  const rangeStart = zonedToUtc(days[0], "00:00", timeZone);
  const rangeEnd = zonedToUtc(addDays(days.at(-1) ?? anchor, 1), "00:00", timeZone);

  const [layersResult, membersResult, eventsResult] = await Promise.all([
    supabase
      .from("layers")
      .select("id, name, colour, owner_member_id, counts_toward_busyness, visibility")
      .order("sort_order")
      .order("name"),
    supabase.from("members").select("id, name").order("role", { ascending: false }).order("name"),
    supabase
      .from("events")
      .select("id, title, layer_id, starts_at, ends_at, all_day, member_id, energy_cost, visibility, notes")
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString())
      .order("starts_at"),
  ]);
  if (layersResult.error) throw layersResult.error;
  if (membersResult.error) throw membersResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const layers: Layer[] = layersResult.data;
  const members: Member[] = membersResult.data;
  const events: CalendarEvent[] = eventsResult.data;
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // The event being edited might be outside the visible range, so fetch it on its own.
  let editing: CalendarEvent | null = null;
  if (editId) {
    const { data } = await supabase
      .from("events")
      .select("id, title, layer_id, starts_at, ends_at, all_day, member_id, energy_cost, visibility, notes")
      .eq("id", editId)
      .maybeSingle();
    editing = data;
  }

  const current = { view, date: anchor };
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | null> = { ...current, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/calendar?${next.toString()}`;
  };
  const returnTo = `view=${view}&date=${anchor}`;

  const step = (n: number) => (view === "week" ? addDays(anchor, 7 * n) : addMonths(anchor, n));
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <NavButton href="/">Home</NavButton>
          <NavButton href={href({ date: step(-1), edit: null, add: null })} label="Previous">
            ‹
          </NavButton>
          <NavButton href={href({ date: today, edit: null, add: null })}>Today</NavButton>
          <NavButton href={href({ date: step(1), edit: null, add: null })} label="Next">
            ›
          </NavButton>
          <h1 className="w-full text-2xl font-semibold tracking-tight text-ink sm:ml-2 sm:w-auto sm:text-3xl">{rangeTitle(view, days, anchor, household)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[var(--radius)] border-2 border-frame">
            {(["week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v, edit: null, add: null })}
                className={`flex min-h-[var(--touch-target)] items-center px-5 text-lg ${
                  v === view ? "bg-marker-blue text-board" : "bg-board text-ink"
                }`}
              >
                {v === "week" ? "Week" : "Month"}
              </Link>
            ))}
          </div>
          <Link
            href={href({ add: addDate ?? (anchor >= days[0] ? anchor : today), edit: null })}
            className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-marker-blue px-5 text-lg font-medium text-board"
          >
            + Add event
          </Link>
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {editing ? (
        <EditEventPanel
          event={editing}
          household={household}
          layers={layers}
          members={members}
          returnTo={returnTo}
          closeHref={href({ edit: null })}
          memberName={editing.member_id ? memberById.get(editing.member_id)?.name : undefined}
        />
      ) : null}

      {addDate && !editing ? (
        <Panel title="Add an event">
          {layers.length === 0 ? (
            <p className="text-lg text-ink-muted">Add a layer first (at the bottom of the page).</p>
          ) : (
            <form action={addEvent} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="returnTo" value={`view=${view}&date=${addDate}`} />
              <EventFields layers={layers} members={members} defaults={{ startDate: addDate }} />
              <div className="flex gap-3 sm:col-span-2">
                <Button>Add event</Button>
                <CloseLink href={href({ add: null })} />
              </div>
            </form>
          )}
        </Panel>
      ) : null}

      {view === "week" ? (
        <WeekView household={household} days={days} today={today} events={events} layerById={layerById} href={href} />
      ) : (
        <MonthView
          household={household}
          days={days}
          today={today}
          events={events}
          layerById={layerById}
          href={href}
          anchor={anchor}
        />
      )}

      {/* Layer key */}
      <div className="flex flex-wrap items-center gap-4 text-base text-ink">
        {layers.map((layer) => (
          <span key={layer.id} className="flex items-center gap-2">
            <span className={`size-4 rounded-full ${MEMBER_COLOUR_CLASS[layer.colour] ?? "bg-marker-black"}`} />
            {layer.name}
          </span>
        ))}
      </div>

      <details className="rounded-[var(--radius)] border-2 border-frame bg-panel/60 p-5">
        <summary className="cursor-pointer text-xl font-semibold text-ink">Manage layers</summary>
        <p className="mt-3 mb-4 text-base text-ink-muted">
          Every event belongs to a layer. Later you&apos;ll be able to choose which layers each screen and phone shows.
        </p>
        <ul className="mb-6 flex flex-col gap-3">
          {layers.map((layer) => (
            <li key={layer.id} className="rounded-[var(--radius)] border-2 border-frame bg-board p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`size-5 rounded-full ${MEMBER_COLOUR_CLASS[layer.colour] ?? "bg-marker-black"}`} />
                <span className="text-lg font-semibold text-ink">{layer.name}</span>
                <span className="text-base text-ink-muted">
                  {visibilityLabel(layer.visibility)}
                  {layer.owner_member_id ? ` · ${memberById.get(layer.owner_member_id)?.name ?? ""}'s` : ""}
                  {layer.counts_toward_busyness ? "" : " · doesn't count toward busy"}
                </span>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-base text-marker-blue">Edit</summary>
                <form action={updateLayer} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={layer.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <LayerFields layer={layer} members={members} />
                  <div className="sm:col-span-2">
                    <Button>Save layer</Button>
                  </div>
                </form>
                <form action={removeLayer} className="mt-4">
                  <input type="hidden" name="id" value={layer.id} />
                  <input type="hidden" name="name" value={layer.name} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <Button variant="danger">Remove {layer.name} and its events</Button>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <h3 className="mb-3 text-xl font-semibold text-ink">Add a layer</h3>
        <form action={addLayer} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          <LayerFields members={members} />
          <div className="sm:col-span-2">
            <Button>Add layer</Button>
          </div>
        </form>
      </details>
    </>
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
}: {
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
    <Panel title={`Edit: ${event.title}`}>
      {memberName ? <p className="-mt-2 mb-4 text-base text-ink-muted">For {memberName}</p> : null}
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
          }}
        />
        <div className="flex gap-3 sm:col-span-2">
          <Button>Save event</Button>
          <CloseLink href={closeHref} />
        </div>
      </form>
      <form action={removeEvent} className="mt-4">
        <input type="hidden" name="id" value={event.id} />
        <input type="hidden" name="title" value={event.title} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button variant="danger">Remove event</Button>
      </form>
    </Panel>
  );
}

function NavButton({ href, children, label }: { href: string; children: React.ReactNode; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink"
    >
      {children}
    </Link>
  );
}

function CloseLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] border-2 border-frame bg-board px-5 text-lg text-ink"
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
