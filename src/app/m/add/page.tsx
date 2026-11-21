import { Suspense } from "react";
import { firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, isLocalTime, localDateOf, localTimeOf } from "@/lib/time";
import { loadChoreDays } from "../../chores/data";
import { PhoneLoading } from "../page";
import { PhoneHeader } from "../phone-ui";
import { AddTabs } from "./tabs";
import type { EventDraft } from "../event-form";

/*
 * Adding on the phone: an event, a to-do or a one-off chore.
 * ?date=2026-12-04&time=15:00 starts the event there (from the calendar).
 * ?kind=todo or ?kind=chore opens on that tab.
 */
export default function PhoneAddPage(props: PageProps<"/m/add">) {
  return (
    <Suspense fallback={<PhoneLoading />}>
      <PhoneAdd searchParams={props.searchParams} />
    </Suspense>
  );
}

function plus(time: string, minutes: number): { time: string; nextDay: boolean } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return { time: `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`, nextDay: total >= 1440 };
}

async function PhoneAdd({ searchParams }: { searchParams: PageProps<"/m/add">["searchParams"] }) {
  const params = await searchParams;
  const household = await requireHousehold();
  const { timeZone, defaultEventMinutes } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);
  const askedDate = firstParam(params.date);
  const date = askedDate && isLocalDate(askedDate) ? askedDate : today;
  const askedTime = firstParam(params.time);
  // The next whole hour today, or 9 am on another day.
  const nextHour = `${String(Math.min(23, Number(localTimeOf(now, timeZone).slice(0, 2)) + 1)).padStart(2, "0")}:00`;
  const startTime = askedTime && isLocalTime(askedTime) ? askedTime : date === today ? nextHour : "09:00";
  const end = plus(startTime, defaultEventMinutes || 60);
  const kind = firstParam(params.kind);

  const supabase = await createClient();
  const [members, lists, choreDays] = await Promise.all([
    supabase.from("members").select("id, name, colour, icon").order("role", { ascending: false }).order("name"),
    supabase.from("task_lists").select("id, name, icon, is_chores, is_groceries").order("sort_order").order("name"),
    loadChoreDays(),
  ]);
  if (members.error) throw members.error;
  if (lists.error) throw lists.error;

  const event: EventDraft = {
    title: "",
    icon: "",
    memberIds: [],
    allDay: false,
    startDate: date,
    startTime,
    endDate: end.nextDay ? addDays(date, 1) : date,
    endTime: end.time,
    frequency: "none",
    interval: 1,
    weekdays: [],
    end: "never",
    until: null,
    count: null,
    location: "",
    notes: "",
    visibility: "everyone",
    dayKind: "",
  };

  return (
    <>
      <PhoneHeader title="Add" />
      <AddTabs
        initialKind={kind === "todo" || kind === "chore" ? kind : "event"}
        members={members.data}
        event={event}
        locale={household.settings.locale}
        today={today}
        lists={lists.data.filter((l) => !l.is_chores && !l.is_groceries).map(({ id, name, icon }) => ({ id, name, icon }))}
        choresListId={lists.data.find((l) => l.is_chores)?.id ?? null}
        choreDays={choreDays.filter((d) => !d.is_free).map(({ id, name, icon }) => ({ id, name, icon }))}
      />
    </>
  );
}
