import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, ChartLineUp, Check, GearSix } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Card, Emoji, IconLink, Notice, Panel, ProgressBar, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { requireHousehold, type Household } from "@/lib/household";
import { isLate } from "@/lib/routines";
import { toMinutes } from "@/lib/routine-placement";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { endRoutine, setDay, toggleStep } from "./actions";
import { routinesPlacedOn } from "./floating";
import { clock } from "./sections";
import { PeopleRow } from "./people-row";
import { routineStreaks } from "./habits-data";
import type { HabitStats } from "@/lib/habits";
import { dayRoutinesFor, loadRoutines, personDay, type DayRoutine, type RoutineData, type RoutineMember, type RoutineStep } from "./data";

/**
 * Routines: checklists for each person (morning, after school, bedtime).
 * The top of the page is the checklist itself; below are the settings for
 * who does which routine on which days, and the routines' steps.
 */
export default function RoutinesPage(props: PageProps<"/routines">) {
  return (
    // On a landscape wall screen the checklist fills one screen.
    <AppFrame section="routines">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Routines searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Routines({ searchParams }: { searchParams: PageProps<"/routines">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { timeZone, locale } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);
  const dateParam = firstParam(params.date);
  const date = dateParam && isLocalDate(dateParam) ? dateParam : today;
  const data = await loadRoutines(date);
  const memberParam = firstParam(params.member);
  // Open the chosen person, or else the first person with routines today.
  const member =
    data.members.find((m) => m.id === memberParam) ??
    data.members.find((m) => dayRoutinesFor(data, m.id, date).length > 0) ??
    data.members[0] ??
    null;
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const placed = await routinesPlacedOn(data, date, household);
  // Streaks for routines tracked as habits (counted up to today).
  const streaks = member ? await routineStreaks(data, member.id, today) : new Map<string, HabitStats>();
  const anyHabits = data.templates.some((t) => t.habit_since);

  const here = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | null> = { member: member?.id ?? null, date: date === today ? null : date, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/routines?${query}` : "/routines";
  };
  const returnTo = here({});
  const dayTitle = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(
    zonedToUtc(date, "12:00", timeZone),
  );

  return (
    <>
      <ScreenHeader title={dayTitle}>
        <HeaderClock locale={locale} timeZone={timeZone} />
        <div className="flex items-center gap-2">
          <IconLink href={here({ date: addDays(date, -1) })} label="Previous day" icon={CaretLeft} />
          <SoftLink href={here({ date: null })}>Today</SoftLink>
          <IconLink href={here({ date: addDays(date, 1) })} label="Next day" icon={CaretRight} />
        </div>
        {anyHabits ? (
          <SoftLink href={member ? `/routines/habits?member=${member.id}` : "/routines/habits"} className="lg:ml-auto">
            <ChartLineUp size="1.5rem" aria-hidden />
            Habits
          </SoftLink>
        ) : null}
        <SoftLink href="/routines/manage" className={anyHabits ? "" : "lg:ml-auto"}>
          <GearSix size="1.5rem" aria-hidden />
          Set up routines
        </SoftLink>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {data.members.length === 0 ? (
        <Notice tone="error">
          Add the people in your household first, on{" "}
          <Link href="/household" className="font-bold underline">
            Household &amp; people
          </Link>
          .
        </Notice>
      ) : null}

      {/* Whose checklist */}
      <PeopleRow data={data} date={date} hrefFor={(id) => here({ member: id })} activeId={member?.id} />

      {member ? <DayBar data={data} member={member} date={date} dayTitle={dayTitle.split(",")[0]} returnTo={returnTo} /> : null}

      {member ? (
        <Checklist
          member={member}
          routines={dayRoutinesFor(data, member.id, date)}
          page={Math.max(0, Number(firstParam(params.rpage) ?? 0) || 0)}
          pageHref={(p) => here({ rpage: p ? String(p) : null })}
          endsAt={new Map((placed.get(member.id) ?? []).map((r) => [r.template.id, r.placement.endMin]))}
          ended={data.ended}
          streaks={streaks}
          isPast={date < today}
          date={date}
          isToday={date === today}
          now={localTimeOf(now, timeZone)}
          household={household}
          returnTo={returnTo}
        />
      ) : null}

    </>
  );
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

const PER_PAGE = 4;

function Checklist({
  member,
  routines,
  page,
  pageHref,
  endsAt,
  ended,
  streaks,
  isPast,
  date,
  isToday,
  now,
  household,
  returnTo,
}: {
  member: RoutineMember;
  routines: DayRoutine[];
  page: number;
  pageHref: (page: number) => string;
  /** When each routine's time is up today (minutes since midnight). */
  endsAt: Map<string, number>;
  /** "memberId:templateId" for routines ended early. */
  ended: Set<string>;
  /** Streaks for routines tracked as habits, by routine id. */
  streaks: Map<string, HabitStats>;
  isPast: boolean;
  date: LocalDate;
  isToday: boolean;
  now: string;
  household: Household;
  returnTo: string;
}) {
  if (routines.length === 0) {
    return (
      <Panel>
        <p className="text-lg text-ink-muted">
          {member.name} has no routines on this day.{" "}
          <Link href="/routines/manage" className="font-bold text-accent">
            Give them one
          </Link>
          .
        </p>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
    {/* One row of up to four routines; more than that turn into pages, so nothing scrolls. */}
    <div
      className="grid gap-5 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:auto-rows-[minmax(0,1fr)]"
      style={{ gridTemplateColumns: `repeat(${Math.min(PER_PAGE, Math.max(routines.length, 3))}, minmax(0, 1fr))` }}
    >
      {routines.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(({ template, steps, progress, doneIds }) => {
        const endedEarly = ended.has(`${member.id}:${template.id}`);
        // A routine is over once it's ended, its time is up, or the day has passed.
        const over = !progress.complete && (isPast || endedEarly || (isToday && toMinutes(now) >= (endsAt.get(template.id) ?? 24 * 60)));
        const missed = over ? progress.total - progress.done : 0;
        return (
        <Card
          key={template.id}
          title={template.name}
          aside={
            progress.complete ? (
              <span className="text-lg font-bold text-success">All done ✓</span>
            ) : over ? (
              <span className="flex items-center gap-2">
                <span className="text-base font-bold text-ink-muted">{missed} missed</span>
                {endedEarly && isToday ? <EndButton member={member} templateId={template.id} date={date} returnTo={returnTo} reopen /> : null}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-lg font-bold text-ink-muted">{`${progress.done}/${progress.total}`}</span>
                {isToday && progress.done > 0 ? <EndButton member={member} templateId={template.id} date={date} returnTo={returnTo} /> : null}
              </span>
            )
          }
        >
          <div className="mt-2 mb-1 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <ProgressBar done={progress.done} total={progress.total} colour={member.colour} />
            </div>
            {streaks.has(template.id) ? <Streak days={streaks.get(template.id)?.streak ?? 0} /> : null}
          </div>
          <ul className="mt-1 flex flex-col lg:min-h-0 lg:overflow-hidden">
            {steps.map((step) => {
              const done = doneIds.has(step.id);
              return (
                <StepRow
                  key={step.id}
                  step={step}
                  done={done}
                  late={isToday && !done && !over && isLate(step, now)}
                  missed={over && !done}
                  memberId={member.id}
                  templateId={template.id}
                  date={date}
                  household={household}
                  returnTo={returnTo}
                />
              );
            })}
          </ul>
        </Card>
        );
      })}
    </div>
    {routines.length > PER_PAGE ? (
      <div className="flex shrink-0 items-center gap-3 text-base font-bold">
        {Array.from({ length: Math.ceil(routines.length / PER_PAGE) }, (_, i) => (
          <Link
            key={i}
            href={pageHref(i)}
            aria-current={i === page ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-xl px-3.5 ${i === page ? "bg-ink text-board" : "bg-rail text-ink"}`}
          >
            {routines
              .slice(i * PER_PAGE, i * PER_PAGE + PER_PAGE)
              .map((r) => r.template.name)
              .join(", ")}
          </Link>
        ))}
      </div>
    ) : null}
    </div>
  );
}

/** "🔥 5 days": done days in a row for a routine tracked as a habit. */
function Streak({ days }: { days: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-base font-bold text-ink" title={`${days} ${days === 1 ? "day" : "days"} in a row`}>
      <Emoji emoji="🔥" className="size-6" faded={days === 0} />
      {days} {days === 1 ? "day" : "days"}
    </span>
  );
}

function StepRow({
  step,
  done,
  late,
  missed,
  memberId,
  templateId,
  date,
  household,
  returnTo,
}: {
  step: RoutineStep;
  done: boolean;
  late: boolean;
  /** The routine is over and this wasn't ticked. It can still be ticked. */
  missed: boolean;
  memberId: string;
  templateId: string;
  date: LocalDate;
  household: Household;
  returnTo: string;
}) {
  return (
    <li>
      <form action={toggleStep}>
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-pressed={done}
          className="flex min-h-16 w-full items-center gap-3.5 py-1 text-left"
          title={done ? "Tap to untick" : "Tap when done"}
        >
          <Emoji emoji={step.icon} className="size-10" faded={done} />
          {step.icon ? null : <span className="size-10 shrink-0" aria-hidden />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`text-xl leading-[1.1] font-semibold ${done || missed ? "text-ink-muted" : "text-ink"}`}>
              {step.text}
            </span>
            {missed ? (
              <span className="text-sm font-bold text-ink-muted">Missed · tap if it got done</span>
            ) : step.target_time ? (
              <span className={`text-sm font-bold ${late ? "text-now" : "text-ink-muted"}`}>
                by {clock(step.target_time, household)}
                {late ? " · running late" : ""}
              </span>
            ) : null}
          </span>
          <span
            className={`flex size-8.5 shrink-0 items-center justify-center rounded-full text-white ${
              done ? "bg-success" : "border-[2.5px] border-check-border"
            }`}
            aria-hidden
          >
            {done ? <Check size="1.125rem" weight="bold" /> : null}
          </span>
        </button>
      </form>
    </li>
  );
}

function EndButton({ member, templateId, date, returnTo, reopen = false }: { member: RoutineMember; templateId: string; date: LocalDate; returnTo: string; reopen?: boolean }) {
  return (
    <form action={endRoutine}>
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {reopen ? <input type="hidden" name="reopen" value="true" /> : null}
      <button className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-base font-bold text-ink" title={reopen ? "Carry on with it" : "Finish it now; anything unticked counts as missed"}>
        {reopen ? "Reopen" : "End"}
      </button>
    </form>
  );
}

/** What kind of day it is for this person, with their wake-up and bedtime. Tap a kind of day to switch just this date. */
function DayBar({ data, member, date, dayTitle, returnTo }: { data: RoutineData; member: RoutineMember; date: LocalDate; dayTitle: string; returnTo: string }) {
  const day = personDay(data, member.id, date);
  const types = data.dayTypes.filter((t) => t.member_id === member.id);
  const override = data.overrides.find((o) => o.member_id === member.id && o.date === date);
  const hidden = (
    <>
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2" aria-label="Kind of day">
      <span className="mr-1 text-lg font-bold text-ink">
        {member.name}&rsquo;s {dayTitle} is a
      </span>
      {types.map((t) => {
        const active = t.id === day.dayType?.id;
        return (
          <form key={t.id} action={setDay}>
            {hidden}
            <input type="hidden" name="dayTypeId" value={t.id} />
            <button
              aria-pressed={active}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-base ${active ? "border-ink bg-rail font-bold text-ink" : "border-frame bg-board text-ink"}`}
            >
              {t.icon ? <Emoji emoji={t.icon} className="size-6" /> : null}
              {t.name}
            </button>
          </form>
        );
      })}
      <form action={setDay} className="flex items-center gap-2 lg:ml-auto">
        {hidden}
        <label className="flex items-center gap-1.5 text-base font-bold text-ink">
          Up
          <input name="wake" type="time" defaultValue={day.wake} className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base" />
        </label>
        <label className="flex items-center gap-1.5 text-base font-bold text-ink">
          Bed
          <input name="bed" type="time" defaultValue={day.bed} className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base" />
        </label>
        <button className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-base font-bold text-ink">Set for this day</button>
      </form>
      {override ? (
        <form action={setDay}>
          {hidden}
          <input type="hidden" name="reset" value="true" />
          <button className="flex min-h-11 items-center rounded-xl px-2 text-base font-bold text-accent">Back to usual</button>
        </form>
      ) : null}
    </div>
  );
}
