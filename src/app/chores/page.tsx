import { Suspense } from "react";
import { AppFrame, ScreenHeader, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { placeable } from "@/lib/chore-days";
import { snapOf, type Season } from "@/lib/chores";
import type { ChoreManagerDraft, DraftOccasional, OnlyIn, Snap } from "@/lib/chore-manager";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { loadTodos } from "./data";
import { ChoreManager, type DayPreview, type OccasionalInfo } from "./manager";
import { choreSchedule } from "./plan";

/**
 * The Chore Manager (2026-11-09): one screen for setting chores up.
 * Occasional chores (on a repeat rule) on top, then the chore days with
 * their regular chores. Chores run by themselves once set up; today's
 * show on the daily list in the Today panel.
 *
 * ?edit=<chore> opens an occasional chore, ?day=<chore day> a chore day.
 */
export default function ChoresPage(props: PageProps<"/chores">) {
  return (
    <AppFrame section="chores">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Chores searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Chores({ searchParams }: { searchParams: PageProps<"/chores">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const { chores, members, choreDays, plan, hard } = await choreSchedule(household, today, timeZone);
  const supabase = await createClient();
  const [{ todos }, heads, onToday] = await Promise.all([
    loadTodos(),
    supabase.from("heads_ups").select("id, chore_id, label, minutes_before, makes").not("chore_id", "is", null).order("sort_order").order("minutes_before", { ascending: false }),
    supabase.from("task_instances").select("template_id").not("template_id", "is", null).eq("status", "open").eq("due_date", today),
  ]);
  if (heads.error) throw heads.error;
  if (onToday.error) throw onToday.error;

  const days = [...choreDays.filter((d) => !d.is_free), ...choreDays.filter((d) => d.is_free)];
  const free = days.find((d) => d.is_free);
  const regular = chores.filter((c) => c.kind === "preset");
  const occasional = chores.filter((c) => c.kind === "generated");

  const initial: ChoreManagerDraft = {
    days: days.map((d) => ({
      id: d.id,
      name: d.name,
      icon: d.icon,
      weekdays: [...d.weekdays].sort(),
      span: d.span,
      restrictive: d.restrictive,
      max_tasks: d.max_tasks,
      max_big: d.max_big,
      is_free: d.is_free,
    })),
    regular: regular
      .map((c) => ({
        id: c.id,
        chore_day_id: c.chore_day_ids[0] ?? free?.id ?? "",
        name: c.name,
        icon: c.icon,
        assignee_id: c.default_assignee_id,
        due_time: c.at_time,
        notes: c.notes,
        active: c.active,
      }))
      .filter((c) => c.chore_day_id),
    occasional: occasional.map(
      (c): DraftOccasional => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        assignee_id: c.default_assignee_id,
        tags: c.tags,
        chore_day_ids: c.chore_day_ids,
        repeat_every: c.repeat_every,
        repeat_unit: c.repeat_unit,
        repeat_from: c.repeat_from === "date" ? "date" : "done",
        start_date: c.start_date ?? null,
        snap: snapOf(c) as Snap,
        preferred_weekday: c.preferred_weekday ?? 6,
        only_in: (c.season_start ? "dates" : c.only_seasons?.length ? "seasons" : c.only_months?.length ? "months" : "any") as OnlyIn,
        only_seasons: (c.only_seasons ?? []) as Season[],
        only_months: c.only_months ?? [],
        season_start: c.season_start ?? "10-01",
        season_end: c.season_end ?? "10-31",
        at_time: c.at_time,
        visibility: c.visibility,
        notes: c.notes,
        active: c.active,
        heads_ups: (heads.data ?? [])
          .filter((h) => h.chore_id === c.id)
          .map((h) => ({ id: h.id, label: h.label, minutes_before: h.minutes_before, makes: h.makes === "grocery" ? "grocery" : "todo" })),
      }),
    ),
  };

  // Where each occasional chore stands: due, placed, on today's list, or hard to place.
  const today_ = new Set((onToday.data ?? []).map((t) => t.template_id));
  const placedOn = new Map<string, string>();
  for (const d of plan.days) for (const item of d.items) if (item.kind === "generated" && !placedOn.has(item.id)) placedOn.set(item.id, d.date);
  const info: Record<string, OccasionalInfo> = {};
  for (const c of occasional) {
    info[c.id] = {
      dueOn: c.timing.dueOn,
      lastDone: c.timing.lastDone,
      placedOn: placedOn.get(c.id) ?? null,
      onToday: today_.has(c.id),
      hard: hard.has(c.id) ? (placeable(choreDays, c.chore_day_ids) ? "No room on its chore days" : "No chore day takes it") : null,
    };
  }

  // The next time each chore day comes round, and what's on it.
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const previews: Record<string, DayPreview> = {};
  for (const d of days) {
    const next = plan.days.find((p) => p.choreDays.some((cd) => cd.id === d.id));
    if (!next) {
      previews[d.id] = null;
      continue;
    }
    const mine = (ids: string[]) => ids.includes(d.id);
    previews[d.id] = {
      date: next.date,
      items: [
        ...next.presets.flatMap((id) => {
          const c = choreById.get(id);
          return c && mine(c.chore_day_ids) ? [{ icon: c.icon, name: c.name, occasional: false }] : [];
        }),
        ...next.items.flatMap((item) => {
          if (item.kind === "generated") {
            const c = choreById.get(item.id);
            return c ? [{ icon: c.icon, name: c.name, occasional: true }] : [];
          }
          const t = todoById.get(item.id);
          return t ? [{ icon: t.icon, name: t.title, occasional: true }] : [];
        }),
      ],
    };
  }

  return (
    <>
      <ScreenHeader title="Chore Manager">
        <HeaderClock locale={locale} timeZone={timeZone} />
      </ScreenHeader>
      <ChoreManager
        // A fresh start after each save, so the screen shows what was saved.
        key={hash(JSON.stringify(initial))}
        initial={initial}
        members={members}
        info={info}
        previews={previews}
        today={today}
        locale={locale}
        timeZone={timeZone}
        weekStartsOn={weekStartsOn}
        startWith={{ chore: firstParam(params.edit), day: firstParam(params.day) }}
      />
    </>
  );
}

/** A short fingerprint of what was loaded. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
