import { Suspense } from "react";
import Link from "next/link";
import { Button, Field, Input, Notice, PageShell, Panel, Select, firstParam } from "@/components/ui";
import { MEMBER_COLOURS, MEMBER_COLOUR_CLASS } from "@/lib/colours";
import { requireHousehold, type Household } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateOf, localTimeOf, zonedToUtc } from "@/lib/time";
import { addEvent, addLayer, removeEvent, removeLayer, updateEvent, updateLayer } from "./actions";
import { ENERGY_OPTIONS, VISIBILITY_OPTIONS } from "./options";

/** How many days ahead the list shows. */
const DAYS_SHOWN = 14;

export default function CalendarPage(props: PageProps<"/calendar">) {
  return (
    <PageShell title="Calendar">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <CalendarContent searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}

type Layer = {
  id: string;
  name: string;
  colour: string;
  owner_member_id: string | null;
  counts_toward_busyness: boolean;
  visibility: string;
};

type Member = { id: string; name: string };

type CalendarEvent = {
  id: string;
  title: string;
  layer_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  member_id: string | null;
  energy_cost: number;
  visibility: string;
  notes: string | null;
};

async function CalendarContent({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const household = await requireHousehold();
  const { timeZone } = household.settings;
  const params = await searchParams;
  const supabase = await createClient();

  const today = localDateOf(new Date(), timeZone);
  const rangeStart = zonedToUtc(today, "00:00", timeZone);
  const rangeEnd = zonedToUtc(addDays(today, DAYS_SHOWN), "00:00", timeZone);

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
      .order("all_day", { ascending: false })
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

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i));
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-3">
        <NavLink href="/">Home</NavLink>
        <NavLink href="/household">Household</NavLink>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <Panel title={`Next ${DAYS_SHOWN} days`}>
        <ol className="flex flex-col gap-5">
          {days.map((day) => {
            const dayStart = zonedToUtc(day, "00:00", timeZone);
            const dayEnd = zonedToUtc(addDays(day, 1), "00:00", timeZone);
            const onThisDay = events.filter(
              (e) => new Date(e.starts_at) < dayEnd && new Date(e.ends_at) > dayStart,
            );
            return (
              <li key={day}>
                <h3 className="mb-2 text-lg font-semibold text-ink">
                  {formatDay(day, household)}
                  {day === today ? <span className="ml-2 text-marker-blue">Today</span> : null}
                </h3>
                {onThisDay.length === 0 ? (
                  <p className="text-base text-ink-muted">Nothing booked.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {onThisDay.map((event) => (
                      <li key={event.id} className="rounded-[var(--radius)] border-2 border-frame bg-board p-3">
                        <EventRow
                          event={event}
                          layer={layerById.get(event.layer_id)}
                          member={event.member_id ? memberById.get(event.member_id) : undefined}
                          household={household}
                          layers={layers}
                          members={members}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel title="Add an event">
        {layers.length === 0 ? (
          <p className="text-lg text-ink-muted">Add a layer first.</p>
        ) : (
          <form action={addEvent} className="grid gap-4 sm:grid-cols-2">
            <EventFields layers={layers} members={members} defaults={{ startDate: today }} />
            <div className="sm:col-span-2">
              <Button>Add event</Button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="Layers">
        <p className="mb-4 text-base text-ink-muted">
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
                  <LayerFields layer={layer} members={members} />
                  <div className="sm:col-span-2">
                    <Button>Save layer</Button>
                  </div>
                </form>
                <form action={removeLayer} className="mt-4">
                  <input type="hidden" name="id" value={layer.id} />
                  <input type="hidden" name="name" value={layer.name} />
                  <Button variant="danger">Remove {layer.name} and its events</Button>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <h3 className="mb-3 text-xl font-semibold text-ink">Add a layer</h3>
        <form action={addLayer} className="grid gap-4 sm:grid-cols-2">
          <LayerFields members={members} />
          <div className="sm:col-span-2">
            <Button>Add layer</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function EventRow({
  event,
  layer,
  member,
  household,
  layers,
  members,
}: {
  event: CalendarEvent;
  layer: Layer | undefined;
  member: Member | undefined;
  household: Household;
  layers: Layer[];
  members: Member[];
}) {
  const { timeZone } = household.settings;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const when = event.all_day
    ? "All day"
    : `${formatTime(start, household)} – ${formatTime(end, household)}`;

  // Values for the edit form, in local time.
  const startDate = localDateOf(start, timeZone);
  const endDate = event.all_day ? addDays(localDateOf(end, timeZone), -1) : localDateOf(end, timeZone);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`size-4 rounded-full ${MEMBER_COLOUR_CLASS[layer?.colour ?? ""] ?? "bg-marker-black"}`} />
        <span className="w-48 shrink-0 text-base text-ink-muted">{when}</span>
        <span className="text-lg font-medium text-ink">{event.title}</span>
        <span className="text-base text-ink-muted">
          {layer?.name}
          {member ? ` · ${member.name}` : ""}
          {event.visibility !== "everyone" ? ` · ${visibilityLabel(event.visibility)}` : ""}
        </span>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-base text-marker-blue">Edit</summary>
        <form action={updateEvent} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={event.id} />
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
          <div className="sm:col-span-2">
            <Button>Save event</Button>
          </div>
        </form>
        <form action={removeEvent} className="mt-4">
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="title" value={event.title} />
          <Button variant="danger">Remove event</Button>
        </form>
      </details>
    </div>
  );
}

type EventDefaults = {
  title?: string;
  layerId?: string;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  memberId?: string;
  energyCost?: number;
  visibility?: string;
  notes?: string;
};

function EventFields({ layers, members, defaults }: { layers: Layer[]; members: Member[]; defaults: EventDefaults }) {
  return (
    <>
      <Field label="What">
        <Input name="title" defaultValue={defaults.title} required maxLength={120} />
      </Field>
      <Field label="Layer">
        <Select name="layerId" defaultValue={defaults.layerId ?? layers[0]?.id}>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input name="startDate" type="date" defaultValue={defaults.startDate} required />
      </Field>
      <Field label="Ends on" hint="Leave blank if it's the same day.">
        <Input name="endDate" type="date" defaultValue={defaults.endDate === defaults.startDate ? "" : defaults.endDate} />
      </Field>
      <Field label="Starts at">
        <Input name="startTime" type="time" defaultValue={defaults.startTime} />
      </Field>
      <Field label="Ends at">
        <Input name="endTime" type="time" defaultValue={defaults.endTime} />
      </Field>
      <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink sm:col-span-2">
        <input type="checkbox" name="allDay" defaultChecked={defaults.allDay} className="size-6 accent-marker-blue" />
        All day (times are ignored)
      </label>
      <Field label="Who it's for" hint="Optional.">
        <Select name="memberId" defaultValue={defaults.memberId ?? ""}>
          <option value="">Nobody in particular</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Energy cost" hint="How draining it is. Busy days are worked out from this later.">
        <Select name="energyCost" defaultValue={String(defaults.energyCost ?? 1)}>
          {ENERGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Who can see it">
        <Select name="visibility" defaultValue={defaults.visibility ?? "everyone"}>
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" hint="Optional.">
        <Input name="notes" defaultValue={defaults.notes} maxLength={2000} />
      </Field>
    </>
  );
}

function LayerFields({ layer, members }: { layer?: Layer; members: Member[] }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" defaultValue={layer?.name} required maxLength={40} />
      </Field>
      <Field label="Colour">
        <Select name="colour" defaultValue={layer?.colour ?? "marker-blue"}>
          {MEMBER_COLOURS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Whose layer" hint="Optional, e.g. Dad's court schedule.">
        <Select name="ownerMemberId" defaultValue={layer?.owner_member_id ?? ""}>
          <option value="">The whole family</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Who can see it">
        <Select name="visibility" defaultValue={layer?.visibility ?? "everyone"}>
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink sm:col-span-2">
        <input
          type="checkbox"
          name="countsTowardBusyness"
          defaultChecked={layer?.counts_toward_busyness ?? true}
          className="size-6 accent-marker-blue"
        />
        Events here make a day count as busy
      </label>
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] border-2 border-frame bg-board px-5 text-lg text-ink"
    >
      {children}
    </Link>
  );
}

function formatDay(day: string, household: Household): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(
    zonedToUtc(day, "12:00", timeZone),
  );
}

function formatTime(instant: Date, household: Household): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(instant);
}

function visibilityLabel(value: string): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
