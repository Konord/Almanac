import { Suspense } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, HolidayColoursHere, Notice, ScreenHeader, ActionLink, Segmented, firstParam, LoadingOutline } from "@/components/ui";
import { holidayHero } from "@/lib/holiday-theme";
import { specialLabel } from "@/lib/holidays";
import { RememberDisplay } from "@/components/remember-display";
import { WallRefresh } from "@/components/wall-refresh";
import { eventEmoji } from "@/lib/emoji";
import { requireHousehold } from "@/lib/household";
import { addDays, localDateOf, zonedToUtc } from "@/lib/time";
import { nowText, shortClockTime, untilText } from "@/lib/time-text";
import { devicePeople, itemsForPeople, loadCalendar, rangeOf } from "./calendar/data";
import { PeopleButton, PeopleChooser } from "./calendar/people-filter";
import { Sheet } from "@/components/sheet";
import type { CalendarItem } from "./calendar/types";
import { loadSpecialDays } from "./holidays/data";
import { loadRoutines, personDay } from "./routines/data";
import { loadMealBasics, loadMeals } from "./meals/data";
import { mealsForRoutines, placeTodayMeals } from "./meals/today";
import { TodayPanel } from "./today-panel/panel";
import { readPanelPrefs } from "./today-panel/prefs";
import { floatingDay } from "./routines/floating";
import { RoutineChecklist } from "./routines/routine-checklist";
import { QuickAddSheet, readAdding } from "./calendar/adding";
import { syncEventAndChoreHeadsUps } from "./heads-ups/sync";
import { choreSchedule } from "./chores/plan";
import { reviewReminder } from "./review/data";
import { eventsOnDay, isAllDayStyle, isPointEvent, minutesIntoDay } from "./calendar/views";
import { AgendaFit, NowLabel } from "./agenda/fit";
import { AllDayStrip, ComingUp, EventCard, RoutineCard, type AgendaEvent, type AgendaRoutine, type AllDayChip, type ComingUpItem } from "./agenda/parts";

/**
 * Today (the Agenda), in the Glance look (docs/glance/SPEC.md, "Finalized
 * agenda" to "FINAL update"):
 *
 *   - the header: the weekday (or a holiday's name and picture) with the
 *     date on its baseline, Today | Week | Month, and Add;
 *   - left, one white panel: the all-day strip, then today's events and
 *     routines as cards in time order, with the red Now line between what's
 *     finished (faded) and what's next, and "Coming up" when there's room;
 *   - right, 36rem: the dinner card above the Daily List (and the other
 *     boxes it flips to).
 *
 * Routines sit in the list at the time they start; tapping a person on one
 * opens their checklist on the right, where the steps are ticked.
 */
export default function Home(props: PageProps<"/">) {
  return (
    <AppFrame section="today">
      <Suspense fallback={<LoadingOutline />}>
        <Today searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

/** How far ahead "Coming up" looks. */
const COMING_DAYS = 14;

async function Today({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);
  const nowMin = minutesIntoDay(now, timeZone);

  // Heads-ups due soon become to-dos before the lists are read.
  await syncEventAndChoreHeadsUps(household);
  // Today and the next two weeks (for Coming up).
  const { rangeStart } = rangeOf([today], timeZone);
  const rangeEnd = zonedToUtc(addDays(today, COMING_DAYS + 1), "00:00", timeZone);
  // The chore generator puts today's chores on the daily list before the tasks are read.
  await choreSchedule(household, today, timeZone);
  const [{ members, templates, dayKinds, items }, routineData, mealBasics, todayMeals, reviewNow] = await Promise.all([
    loadCalendar(rangeStart, rangeEnd),
    loadRoutines(today),
    loadMealBasics(),
    loadMeals(today, today),
    reviewReminder(household, today, now),
  ]);
  const todaySpecials = (await loadSpecialDays(today, today)).get(today) ?? [];
  // The person filter: just some people's things (and things for everyone).
  const people = await devicePeople(members);
  const shown = itemsForPeople(items, people);
  const shownMembers = people.length === 0 ? members : members.filter((m) => people.includes(m.id));
  const colourOf = new Map(members.map((m) => [m.id, m.colour]));
  const coloursOf = (ids: string[]) => ids.flatMap((id) => (colourOf.has(id) ? [colourOf.get(id)!] : []));

  // The header: "Sunday" with "November 15" on its baseline; on a holiday
  // (holiday themes on) the holiday's name and picture, the weekday moving into the date.
  const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(now);
  const monthDay = new Intl.DateTimeFormat(locale, { timeZone, month: "long", day: "numeric" }).format(now);
  const hero = holidayHero(todaySpecials, household.settings.holidayThemes);

  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const { pending, templateHref } = readAdding(params, household.settings, members, templates, "/");
  const openRoutine = firstParam(params.routine) ?? "";
  const openMember = firstParam(params.member) ?? "";
  const routineOpen = Boolean(openRoutine && openMember) && !pending;

  const editLink = (e: CalendarItem) => `/calendar?view=week&date=${localDateOf(new Date(e.starts_at), timeZone)}&edit=${e.series_id}${e.occurrence_date ? `&occ=${e.occurrence_date}` : ""}`;
  const time = (iso: string) => shortClockTime(new Date(iso), locale, timeZone);

  // --- Today's things --------------------------------------------------------
  const todayItems = eventsOnDay(shown, today, timeZone);
  const allDay = todayItems.filter((e) => isAllDayStyle(e, timeZone));
  const timed = todayItems.filter((e) => !isAllDayStyle(e, timeZone));
  const startOf = (e: CalendarItem) => (localDateOf(new Date(e.starts_at), timeZone) < today ? 0 : minutesIntoDay(new Date(e.starts_at), timeZone));
  const endOf = (e: CalendarItem) => (localDateOf(new Date(e.ends_at), timeZone) > today ? 24 * 60 : minutesIntoDay(new Date(e.ends_at), timeZone));

  // Routines float around each person's own plans and their meals, as before.
  const memberIds = new Set(shownMembers.map((m) => m.id));
  const forEveryone = timed.filter((e) => !isPointEvent(e) && !e.member_ids.some((id) => memberIds.has(id)));
  const placedMeals = placeTodayMeals(
    todayMeals,
    mealBasics,
    timed.filter((e) => !isPointEvent(e)).map((e) => ({ startMin: startOf(e), endMin: endOf(e), title: e.title, memberIds: e.member_ids.filter((id) => memberIds.has(id)) })),
  );
  const dayMeals = mealsForRoutines(placedMeals);
  const routineHref = (templateId: string, memberId: string) => `/?routine=${templateId}&member=${memberId}`;
  const grouped = new Map<string, AgendaRoutine & { startMin: number }>();
  for (const m of shownMembers) {
    const mine = timed.filter((e) => !isPointEvent(e) && e.member_ids.includes(m.id));
    const { routines } = floatingDay(routineData, m.id, today, [...mine, ...forEveryone], timeZone, household.settings.routineFlexMinutes, dayMeals);
    for (const r of routines) {
      if (routineData.ended.has(`${m.id}:${r.template.id}`)) continue;
      // The same routine at the same time for several people is one card.
      const key = `${r.template.id}@${r.placement.startMin}`;
      const card =
        grouped.get(key) ??
        ({
          key,
          title: r.template.name,
          emoji: r.progress.next?.icon ?? r.steps[0]?.icon ?? "✨",
          start: shortClockTime(zonedToUtc(today, hhmm(r.placement.startMin), timeZone), locale, timeZone),
          past: r.placement.endMin <= nowMin,
          people: [],
          startMin: r.placement.startMin,
        } satisfies AgendaRoutine & { startMin: number });
      card.people.push({ name: m.name, colour: m.colour, href: routineHref(r.template.id, m.id), done: r.progress.complete, count: `${r.progress.done}/${r.progress.total}` });
      grouped.set(key, card);
    }
  }

  // Events and routines in time order; the next event still to start gets "IN 20 MIN".
  const nextEvent = timed
    .filter((e) => new Date(e.starts_at).getTime() > now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  type Card = { kind: "event"; startMin: number; past: boolean; event: AgendaEvent } | { kind: "routine"; startMin: number; past: boolean; routine: AgendaRoutine };
  const cards: Card[] = [
    ...timed.map((e): Card => {
      const startMin = startOf(e);
      const point = isPointEvent(e);
      const past = point ? startMin < nowMin : endOf(e) <= nowMin;
      const minutesAway = Math.ceil((new Date(e.starts_at).getTime() - now.getTime()) / 60_000);
      return {
        kind: "event",
        startMin,
        past,
        event: {
          key: e.id,
          title: e.title,
          emoji: eventEmoji(e.icon, e.title),
          start: time(e.starts_at),
          until: point ? null : untilText(new Date(e.ends_at), locale, timeZone),
          // Events have no place field yet (it comes with the event editor); nothing to show.
          place: null,
          colours: coloursOf(e.member_ids),
          href: editLink(e),
          past,
          soon: nextEvent && e.id === nextEvent.id ? { startsAt: e.starts_at, minutes: minutesAway > 0 && minutesAway <= 30 ? minutesAway : null } : null,
        },
      };
    }),
    ...[...grouped.values()].map((r): Card => ({ kind: "routine", startMin: r.startMin, past: r.past, routine: r })),
  ].sort((a, b) => a.startMin - b.startMin);
  const finished = cards.filter((c) => c.past);
  const ahead = cards.filter((c) => !c.past);

  // --- The all-day strip --------------------------------------------------------
  // Official days are printed: today's kinds of day (tap: Set days), days off,
  // and a holiday when holiday themes are off. Things the family added are
  // handwritten in their colours: all-day events and birthdays.
  const kinds = new Map<string, { icon: string | null }>();
  for (const m of routineData.members.filter((m) => memberIds.has(m.id) || people.length === 0)) {
    const type = personDay(routineData, m.id, today).dayType;
    if (type && !kinds.has(type.name)) kinds.set(type.name, { icon: type.icon });
  }
  const chips: AllDayChip[] = [
    ...(reviewNow ? [{ key: "review", label: "Plan the week", emoji: "📋", printed: true, colours: [], href: "/review" }] : []),
    ...[...kinds].map(([name, k]) => ({ key: `kind:${name}`, label: name, emoji: k.icon, printed: true, colours: [], href: "/routines/manage" })),
    ...routineData.breaks
      .filter((b) => b.start_date <= today && today <= b.end_date)
      .map((b) => ({ key: `break:${b.id}`, label: b.name, emoji: eventEmoji(b.icon, b.name), printed: true, colours: [], href: "/routines/manage?tab=breaks" })),
    ...todaySpecials
      .filter((s) => s.kind === "holiday" && !(hero && s.name === hero.title))
      .map((s) => ({ key: s.key, label: specialLabel(s), emoji: s.icon, printed: true, colours: [], href: "/holidays" })),
    ...todaySpecials
      .filter((s) => s.kind === "birthday")
      .map((s) => ({ key: s.key, label: specialLabel(s), emoji: s.icon, printed: false, colours: [], href: "/holidays" })),
    ...allDay
      // An all-day event that only makes the day a kind of day already shows as that kind.
      .filter((e) => !(e.day_kind && kinds.has(e.day_kind) && e.title.trim().toLowerCase() === e.day_kind.trim().toLowerCase()))
      .map((e) => ({ key: e.id, label: e.title, emoji: eventEmoji(e.icon, e.title), printed: false, colours: coloursOf(e.member_ids), href: editLink(e) })),
  ];

  // --- Coming up: the next few timed things after today ----------------------
  const coming: ComingUpItem[] = shown
    .filter((e) => !isAllDayStyle(e, timeZone) && localDateOf(new Date(e.starts_at), timeZone) > today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 3)
    .map((e) => ({
      key: e.id,
      title: e.title,
      emoji: eventEmoji(e.icon, e.title),
      when: `${new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(new Date(e.starts_at))} · ${time(e.starts_at)}`,
      href: editLink(e),
    }));

  // Add opens the quick-add card for today, starting at the next half hour.
  const nextSlot = Math.min(Math.ceil((nowMin + 1) / 30) * 30, 23 * 60);
  const addHref = `/?add=${today}&start=${hhmm(nextSlot)}`;
  // Which box the right-hand card shows (each screen remembers the last one picked).
  const panelTab = (await readPanelPrefs()).tab;
  const drawCard = (c: Card) => (c.kind === "event" ? <EventCard key={c.event.key} event={c.event} /> : <RoutineCard key={c.routine.key} routine={c.routine} />);

  return (
    <>
      <RememberDisplay display="agenda" />
      {/* Everything here sits on white panels, so Christmas and Halloween colours are fine. */}
      <HolidayColoursHere />
      <WallRefresh timeZone={timeZone} />
      <ScreenHeader
        title={hero ? hero.title : weekday}
        sub={hero ? `${weekday}, ${monthDay}` : monthDay}
        hero={hero?.emoji}
        weather
        tabs={
          <Segmented
            label="View"
            options={[
              { href: "/", label: "Today", active: true },
              { href: `/calendar?view=week&date=${today}`, label: "Week", active: false },
              { href: `/calendar?view=month&date=${today}`, label: "Month", active: false },
            ]}
          />
        }
        action={
          <ActionLink href={addHref} scroll={false} icon={Plus} label="Add an event">
            Add
          </ActionLink>
        }
      >
        {/* Whose things this screen shows (each screen remembers its own). */}
        <PeopleButton members={members} shown={people} href="/?panel=people" />
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_36rem]">
        <AgendaFit className="flex min-h-[30rem] min-w-0 flex-col gap-4 overflow-hidden rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised lg:min-h-0">
          <AllDayStrip chips={chips} />
          <section data-cards aria-label="Today" className="flex min-h-0 shrink-0 flex-col gap-4">
            {finished.map(drawCard)}
            <div className="tabular flex shrink-0 items-center gap-3 py-[0.1rem] text-[1.25rem] font-extrabold text-now">
              <NowLabel locale={locale} timeZone={timeZone} initial={nowText(locale, timeZone, now)} />
              <span aria-hidden className="h-[0.2rem] min-w-8 flex-1 rounded-full bg-now" />
            </div>
            {ahead.map(drawCard)}
          </section>
          <button
            type="button"
            data-more
            hidden
            className="tabular flex min-h-[var(--touch-target)] w-full shrink-0 items-center justify-center text-[1.25rem] font-bold text-ink-soft"
          />
          <ComingUp items={coming} />
        </AgendaFit>

        <TodayPanel
          household={household}
          today={today}
          upNext={[]}
          tab={panelTab}
          returnTo="/"
          day
          layout="side"
          routine={
            routineOpen ? (
              <RoutineChecklist
                data={routineData}
                memberId={openMember}
                templateId={openRoutine}
                date={today}
                today={today}
                page={Number(firstParam(params.rpage) ?? 0) || 0}
                closeHref="/"
                hereHref={(p) => `/?routine=${openRoutine}&member=${openMember}${p ? `&rpage=${p}` : ""}`}
              />
            ) : undefined
          }
        />
      </div>

      {firstParam(params.panel) === "people" ? (
        <Sheet title="Showing" closeHref="/" narrow>
          <PeopleChooser members={members} shown={people} returnTo="panel=people" returnPath="/" />
        </Sheet>
      ) : null}

      {pending ? (
        <QuickAddSheet pending={pending} members={members} dayKinds={dayKinds} templates={templates} templateHref={templateHref} closeHref="/" returnTo="" returnPath="/" />
      ) : null}
    </>
  );
}

/** "07:30" for minutes since midnight. */
function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
