import { Suspense } from "react";
import Link from "next/link";
import { Notice, Panel, firstParam } from "@/components/ui";
import { MEMBER_COLOUR_CLASS } from "@/lib/colours";
import { requireHousehold, type Household } from "@/lib/household";
import { isLate } from "@/lib/routines";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { toggleStep } from "./actions";
import { NavButton, clock } from "./sections";
import { ProgressBar } from "./progress-bar";
import { dayRoutinesFor, loadRoutines, type DayRoutine, type RoutineMember, type RoutineStep } from "./data";

/**
 * Routines: checklists for each person (morning, after school, bedtime).
 * The top of the page is the checklist itself; below are the settings for
 * who does which routine on which days, and the routines' steps.
 */
export default function RoutinesPage(props: PageProps<"/routines">) {
  return (
    // On a landscape wall screen the checklist fills one screen; long
    // routines scroll inside their own column.
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-4 p-4 sm:p-6 lg:h-dvh lg:max-h-dvh lg:min-h-0 lg:overflow-hidden">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Routines searchParams={props.searchParams} />
      </Suspense>
    </main>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-marker-blue pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <NavButton href="/">Home</NavButton>
          <NavButton href={here({ date: addDays(date, -1) })} label="Previous day">
            ‹
          </NavButton>
          <NavButton href={here({ date: null })}>Today</NavButton>
          <NavButton href={here({ date: addDays(date, 1) })} label="Next day">
            ›
          </NavButton>
          <h1 className="w-full text-3xl font-semibold tracking-tight text-ink sm:ml-2 sm:w-auto">Routines · {dayTitle}</h1>
        </div>
        <NavButton href="/routines/manage">Set up routines</NavButton>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {data.members.length === 0 ? (
        <Notice tone="error">
          Add the people in your household first, on{" "}
          <Link href="/household" className="underline">
            Household &amp; people
          </Link>
          .
        </Notice>
      ) : null}

      {/* Whose checklist */}
      <div className="flex flex-wrap gap-2" aria-label="Whose routines">
        {data.members.map((m) => {
          const routines = dayRoutinesFor(data, m.id, date);
          const done = routines.reduce((n, r) => n + r.progress.done, 0);
          const total = routines.reduce((n, r) => n + r.progress.total, 0);
          const active = member?.id === m.id;
          return (
            <Link
              key={m.id}
              href={here({ member: m.id })}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[var(--touch-target)] items-center gap-3 rounded-full border-2 px-4 text-lg ${
                active ? "border-marker-blue bg-marker-blue text-board" : "border-frame bg-board text-ink"
              }`}
            >
              <span className={`size-4 rounded-full ring-2 ring-board ${MEMBER_COLOUR_CLASS[m.colour] ?? "bg-marker-black"}`} />
              {m.name}
              <span className={active ? "text-board/80" : "text-ink-muted"}>{total ? `${done}/${total}` : "none"}</span>
            </Link>
          );
        })}
      </div>

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
          <Link href="/routines/manage" className="text-marker-blue underline">
            Give them one
          </Link>
          .
        </p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:auto-rows-[minmax(0,1fr)] lg:grid-cols-3">
      {routines.map(({ template, steps, progress, doneIds }) => (
        <section key={template.id} className="flex flex-col rounded-[var(--radius)] border-2 border-frame bg-board p-4 lg:min-h-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold text-ink">
              {template.name}
              {progress.complete ? " ✓" : ""}
            </h2>
            <span className="text-lg text-ink-muted">
              {progress.done} of {progress.total}
            </span>
          </div>
          <ProgressBar done={progress.done} total={progress.total} />
          <ul className="mt-2 flex flex-col lg:min-h-0 lg:overflow-y-auto">
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
        </section>
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
    <li className="border-t border-frame/70 first:border-t-0">
      <form action={toggleStep}>
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-pressed={done}
          className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left"
          title={done ? "Tap to untick" : "Tap when done"}
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-xl ${
              done ? "border-marker-green bg-marker-green text-board" : "border-frame bg-board"
            }`}
            aria-hidden
          >
            {done ? "✓" : ""}
          </span>
          <span className="w-10 shrink-0 text-center text-3xl" aria-hidden>
            {step.icon}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`text-xl ${done ? "text-ink-muted line-through" : "font-semibold text-ink"}`}>{step.text}</span>
            {step.target_time ? (
              <span className={`text-base ${late ? "font-semibold text-marker-red" : "text-ink-muted"}`}>
                by {clock(step.target_time, household)}
                {late ? " · running late" : ""}
              </span>
            ) : null}
          </span>
          {step.essential ? <span className="text-sm text-ink-muted">essential</span> : null}
        </button>
      </form>
    </li>
  );
}
