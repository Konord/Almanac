import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, Check, GearSix } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Card, Emoji, IconLink, Notice, Panel, ProgressBar, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { requireHousehold, type Household } from "@/lib/household";
import { isLate } from "@/lib/routines";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { toggleStep } from "./actions";
import { clock } from "./sections";
import { PeopleRow } from "./people-row";
import { dayRoutinesFor, loadRoutines, type DayRoutine, type RoutineMember, type RoutineStep } from "./data";

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
        <SoftLink href="/routines/manage" className="lg:ml-auto">
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

      {member ? (
        <Checklist
          member={member}
          routines={dayRoutinesFor(data, member.id, date)}
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

function Checklist({
  member,
  routines,
  date,
  isToday,
  now,
  household,
  returnTo,
}: {
  member: RoutineMember;
  routines: DayRoutine[];
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
    <div className="grid gap-5 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:auto-rows-[minmax(0,1fr)] lg:grid-cols-3">
      {routines.map(({ template, steps, progress, doneIds }) => (
        <Card
          key={template.id}
          title={template.name}
          aside={
            <span className={`text-lg font-bold ${progress.complete ? "text-success" : "text-ink-muted"}`}>
              {progress.complete ? "All done ✓" : `${progress.done}/${progress.total}`}
            </span>
          }
        >
          <div className="mt-2 mb-1">
            <ProgressBar done={progress.done} total={progress.total} colour={member.colour} />
          </div>
          <ul className="mt-1 flex flex-col lg:min-h-0 lg:overflow-y-auto">
            {steps.map((step) => {
              const done = doneIds.has(step.id);
              return (
                <StepRow
                  key={step.id}
                  step={step}
                  done={done}
                  late={isToday && !done && isLate(step, now)}
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
      ))}
    </div>
  );
}

function StepRow({
  step,
  done,
  late,
  memberId,
  templateId,
  date,
  household,
  returnTo,
}: {
  step: RoutineStep;
  done: boolean;
  late: boolean;
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
            <span className={`text-xl leading-[1.1] font-semibold ${done ? "text-ink-muted" : "text-ink"}`}>
              {step.text}
              {step.essential ? <span className="sr-only"> (essential)</span> : null}
            </span>
            {step.target_time ? (
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
