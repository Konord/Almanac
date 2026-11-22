import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { parseRule } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, localDateOf, localTimeOf } from "@/lib/time";
import { EVENT_COLUMNS, toEvent } from "../../../calendar/data";
import { PhoneLoading } from "../../page";
import { PhoneHeader } from "../../phone-ui";
import { EventForm, type EventDraft } from "../../event-form";

/*
 * An event on the phone, to change or delete. ?occ=2026-12-04 is the date
 * tapped on a repeating event: it can be skipped on its own; other changes
 * change every date.
 */
export default function PhoneEventPage(props: PageProps<"/m/event/[id]">) {
  return (
    <Suspense fallback={<PhoneLoading />}>
      <PhoneEvent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PhoneEvent({ params, searchParams }: Pick<PageProps<"/m/event/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  const household = await requireHousehold();
  const { timeZone, locale } = household.settings;
  const supabase = await createClient();
  const [{ data }, members] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("members").select("id, name, colour, icon").order("role", { ascending: false }).order("name"),
  ]);
  if (!data) notFound();
  if (members.error) throw members.error;
  const event = toEvent(data);
  const occ = firstParam(query.occ);
  const occurrence = event.recurrence_rule && occ && isLocalDate(occ) ? occ : undefined;

  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  // An all-day event ends at midnight after its last day.
  const lastInstant = event.all_day ? new Date(end.getTime() - 1) : end;
  const rule = parseRule(event.recurrence_rule);
  const draft: EventDraft = {
    title: event.title,
    icon: event.icon ?? "",
    memberIds: event.member_ids,
    allDay: event.all_day,
    startDate: localDateOf(start, timeZone),
    startTime: localTimeOf(start, timeZone).slice(0, 5),
    endDate: localDateOf(lastInstant, timeZone),
    endTime: event.all_day ? localTimeOf(start, timeZone).slice(0, 5) : localTimeOf(end, timeZone).slice(0, 5),
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.weekdays,
    end: rule.end,
    until: rule.until,
    count: rule.count,
    location: event.location ?? "",
    notes: event.notes ?? "",
    visibility: event.visibility,
    dayKind: event.day_kind ?? "",
  };
  const back = `/m?date=${occurrence ?? draft.startDate}`;

  return (
    <>
      <PhoneHeader title="Event">
        <Link href={back} className="inline-flex min-h-12 items-center gap-1 rounded-[var(--radius)] bg-panel px-4 text-[1.1rem] font-bold text-ink">
          <CaretLeft size="1.1rem" weight="bold" aria-hidden />
          Calendar
        </Link>
      </PhoneHeader>
      <EventForm members={members.data} initial={draft} eventId={event.id} occurrence={occurrence} locale={locale} back={back} />
    </>
  );
}
