import { Suspense } from "react";
import Link from "next/link";
import { AppFrame, Notice, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { groupKey, type DaysDraft } from "@/lib/set-days";
import { addDays, localDateOf } from "@/lib/time";
import { loadBreaks, loadRoutines } from "../data";
import { SetDays, type Tab } from "./set-days";

/**
 * Set days: the week (which kind of day each weekday is), the kinds of
 * day (wake-up and bedtime for each person), and breaks. Opened from the
 * Routine Manager. One Save for the whole page; nothing scrolls.
 */
export default function SetDaysPage(props: PageProps<"/routines/manage">) {
  return (
    <AppFrame section="routines">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Days searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Days({ searchParams }: { searchParams: PageProps<"/routines/manage">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const [data, breaks] = await Promise.all([loadRoutines(today), loadBreaks(today, addDays(today, 3 * 366))]);

  if (data.members.length === 0) {
    return (
      <Notice tone="error">
        Add the people in your household first, on{" "}
        <Link href="/household" className="font-bold underline">
          Household &amp; people
        </Link>
        .
      </Notice>
    );
  }

  const initial: DaysDraft = {
    dayTypes: data.members.flatMap((m) =>
      data.dayTypes
        .filter((t) => t.member_id === m.id)
        .map((t) => ({ id: t.id, member_id: m.id, group: groupKey(t.name), name: t.name, icon: t.icon, wake: t.wake_time.slice(0, 5), bed: t.bed_time.slice(0, 5) })),
    ),
    weekPlans: data.members.flatMap((m) => data.weekPlans.filter((p) => p.member_id === m.id).map((p) => ({ id: p.id, member_id: m.id, name: p.name }))),
    planDays: data.weekPlanDays
      .map((d) => ({ plan_id: d.week_plan_id, weekday: d.weekday, day_type_id: d.day_type_id }))
      .toSorted((a, b) => (a.plan_id < b.plan_id ? -1 : a.plan_id > b.plan_id ? 1 : a.weekday - b.weekday)),
    members: data.members.map((m) => ({
      member_id: m.id,
      current_week_plan_id: m.current_week_plan_id,
      rotate: m.week_plans_rotate,
      rotation_start: m.rotation_start,
    })),
    breaks: breaks.map((b) => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      start: b.start_date,
      end: b.end_date,
      away: b.away ?? false,
      people: data.members.flatMap((m) => b.people.filter((p) => p.member_id === m.id)),
    })),
  };
  const routineCounts: Record<string, number> = {};
  for (const a of data.assignments) if (a.day_type_id) routineCounts[a.day_type_id] = (routineCounts[a.day_type_id] ?? 0) + 1;

  // 2026-11-01 was a Sunday.
  const weekday = (style: "short" | "long", value: number) => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + value)));
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const value = (weekStartsOn + i) % 7;
    return { value, short: weekday("short", value), long: weekday("long", value) };
  });
  const tab = firstParam(params.tab);

  return (
    <SetDays
      // A fresh start after each save, so the screen shows what was saved.
      key={hash(JSON.stringify(initial))}
      initial={initial}
      members={data.members.map((m) => ({ id: m.id, name: m.name, colour: m.colour, icon: m.icon }))}
      routineCounts={routineCounts}
      weekdays={weekdays}
      today={today}
      locale={locale}
      startTab={tab === "kinds" || tab === "breaks" ? (tab as Tab) : "week"}
    />
  );
}

/** A short fingerprint of what was loaded. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
