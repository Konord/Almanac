import Link from "next/link";
import { ArrowsClockwise, Check, CheckCircle, X } from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import { strong } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { DAY_END, placeRoutines, toMinutes, wantedSlot, type Busy, type DayAnchors, type Placement } from "@/lib/routine-placement";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import { loadCalendar, rangeOf } from "../calendar/data";
import { eventsOnDay, isAllDayStyle, minutesIntoDay, shortTime } from "../calendar/views";
import { loadMealBasics, loadMeals } from "../meals/data";
import { mealsForRoutines, placeTodayMeals } from "../meals/today";
import type { CalendarItem } from "../calendar/types";
import { dayRoutinesFor, personDay, type DayRoutine, type RoutineData } from "./data";
import { toggleStep } from "./actions";

export type FloatingRoutine = DayRoutine & { placement: Placement };

/** A meal on the day, as routines see it: when it's eaten, and by whom. */
export type DayMeal = { mealTimeId: string; eatStart: number; endMin: number; memberIds: string[]; title: string };

/**
 * One person's routines for a day, placed around their plans (their own
 * events and ones for everyone) and the meals they eat. Each routine
 * starts from its anchor: wake-up, bedtime, a meal or a set time.
 * See src/lib/routine-placement.ts.
 */
export function floatingRoutines(
  data: RoutineData,
  memberId: string,
  date: LocalDate,
  events: CalendarItem[],
  timeZone: string,
  flexMinutes: number,
  meals: DayMeal[] = [],
): FloatingRoutine[] {
  return floatingDay(data, memberId, date, events, timeZone, flexMinutes, meals).routines;
}

/** Something else that floats with the routines: where it would like to be. */
export type FloatingExtra = { id: string; start: number; minutes: number; loose: boolean };

/**
 * Like floatingRoutines, with other floating things placed in the same
 * pass, so they keep out of each other's way.
 */
export function floatingDay(
  data: RoutineData,
  memberId: string,
  date: LocalDate,
  events: CalendarItem[],
  timeZone: string,
  flexMinutes: number,
  meals: DayMeal[] = [],
  extras: FloatingExtra[] = [],
): { routines: FloatingRoutine[]; extras: Placement[] } {
  const routines = dayRoutinesFor(data, memberId, date);
  const myMeals = meals.filter((m) => m.memberIds.length === 0 || m.memberIds.includes(memberId));
  const busy: Busy[] = [
    ...events
      .filter((e) => !isAllDayStyle(e, timeZone))
      .map((e) => ({
        startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
        endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
        title: e.title,
      })),
    // Meals are heavy: routines move around them, not the other way.
    ...myMeals.map((m) => ({ startMin: m.eatStart, endMin: m.endMin, title: m.title })),
  ];
  const day = personDay(data, memberId, date);
  const anchors: DayAnchors = {
    wake: toMinutes(day.wake),
    bed: toMinutes(day.bed),
    mealEnd: (id) => {
      const ends = myMeals.filter((m) => m.mealTimeId === id).map((m) => m.endMin);
      return ends.length > 0 ? Math.max(...ends) : null;
    },
  };
  const placements = placeRoutines(
    [
      ...routines.map((r) => ({
        id: r.assignment.id,
        ...wantedSlot(r.template, r.steps.map((s) => s.target_time), anchors, flexMinutes),
      })),
      // Extras move either way, like a routine at a set time.
      ...extras.map((x) => ({ id: x.id, start: x.start, minutes: x.minutes, direction: "both" as const, band: x.loose ? DAY_END : flexMinutes })),
    ],
    busy,
  );
  return {
    routines: routines.map((r, i) => ({ ...r, placement: placements[i] })),
    extras: placements.slice(routines.length),
  };
}

/** "7:00" for minutes since midnight, in the household's clock style. */
export function clock(minutes: number, date: LocalDate, household: Household): string {
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return shortTime(zonedToUtc(date, `${hh}:${mm}`, household.settings.timeZone), household);
}

/**
 * A routine on the Agenda (tasks rework, step 3): a point, or a chain of
 * points. It sits at the time it starts, in the person's colour: a ring
 * (filled once it's all done), its name, then a row of small dots, one
 * per step, filled as each is ticked. Its length is only for working out
 * where it fits; it never shows as a block. Tapping it opens its
 * checklist in the Today panel.
 *
 * `top` is where to draw it (a percentage down the timeline), which can
 * sit a little below its start so routines close together don't overlap.
 */
export function RoutineChain({
  routine,
  colour,
  date,
  top,
  household,
}: {
  routine: FloatingRoutine;
  colour: string;
  date: LocalDate;
  top: number;
  household: Household;
}) {
  const { placement, template, progress, steps, doneIds } = routine;
  const ink = strong(colour);
  const single = steps.length === 1;
  const icon = progress.next?.icon ?? steps[0]?.icon ?? null;
  const when = placement.clash
    ? "No free time for it"
    : placement.movedFor
      ? `Moved for ${placement.movedFor}`
      : clock(placement.startMin, date, household);
  const flagged = Boolean(placement.movedFor || placement.clash);
  const ordered = steps.toSorted((x, y) => x.position - y.position);
  return (
    <Link
      // Tapping a routine opens it up right there, in everyone's column who shares it (Connor, 2026-11-10).
      href={`/?expand=${template.id}`}
      scroll={false}
      className={`absolute right-1 left-1 z-[1] flex h-8 -translate-y-1/2 items-center gap-1.5 overflow-hidden ${progress.complete ? "opacity-60" : ""}`}
      style={{ top: `${top}%` }}
      title={`${template.name}: ${progress.done} of ${progress.total} done. ${when}.`}
    >
      {progress.complete ? (
        <CheckCircle size="1.25rem" weight="fill" className="shrink-0" style={{ color: ink }} aria-hidden />
      ) : (
        <span className="size-3.5 shrink-0 rounded-full border-[3px] bg-board" style={{ borderColor: ink }} aria-hidden />
      )}
      {icon ? <Emoji emoji={icon} className="size-6" /> : null}
      <span className="min-w-0 shrink truncate rounded-lg bg-board/90 px-1 text-sm leading-none font-bold text-ink">{template.name}</span>
      {single ? null : (
        <span className="flex shrink-0 items-center gap-0.5" aria-label={`${progress.done} of ${progress.total} done`}>
          {ordered.slice(0, 8).map((step) => (
            <span
              key={step.id}
              className="size-2 rounded-full border-2"
              style={{ borderColor: ink, background: doneIds.has(step.id) ? ink : "white" }}
              aria-hidden
            />
          ))}
          {ordered.length > 8 ? <span className="text-xs font-bold text-ink-muted">+{ordered.length - 8}</span> : null}
        </span>
      )}
      <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-ink-muted" style={flagged ? { color: ink } : undefined}>
        {flagged ? <ArrowsClockwise size="0.75rem" weight="bold" aria-label="Moved" /> : null}
        {when}
      </span>
    </Link>
  );
}

/** How many steps an opened routine shows in a column; the rest open in the Today panel. */
const EXPANDED_STEPS = 6;

/**
 * A routine opened up on the Agenda timeline: this person's steps with a
 * tick for each, in their own column. A routine several people share opens
 * in each of their columns at once, each with their own steps. It sits at
 * the routine's time, moved up if it would run off the bottom.
 */
export function ExpandedRoutine({
  routine,
  memberId,
  colour,
  date,
  top,
}: {
  routine: FloatingRoutine;
  memberId: string;
  colour: string;
  date: LocalDate;
  top: number;
}) {
  const { template, progress, steps, doneIds } = routine;
  const ink = strong(colour);
  const ordered = steps.toSorted((x, y) => x.position - y.position);
  const shown = ordered.slice(0, EXPANDED_STEPS);
  const more = ordered.length - shown.length;
  const here = `/?expand=${template.id}`;
  // Header, rows and the "more" line, in rem, so the card can be kept on screen.
  const height = 4 + shown.length * 3.25 + (more > 0 ? 2.5 : 0);
  return (
    <div
      className="absolute right-0 left-0 z-20 flex flex-col overflow-hidden rounded-2xl border-2 bg-board shadow-[0_0.5rem_1.5rem_rgba(30,35,45,0.18)]"
      style={{ top: `max(0%, min(calc(${top}% - 1rem), calc(100% - ${height}rem)))`, height: `${height}rem`, borderColor: ink }}
      role="group"
      aria-label={`${template.name}: ${progress.done} of ${progress.total} done`}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-3" style={{ background: `color-mix(in srgb, ${ink} 10%, white)` }}>
        <span className="min-w-0 flex-1 truncate text-lg font-extrabold text-ink">{template.name}</span>
        <span className="shrink-0 text-base font-bold text-ink-muted tabular-nums">
          {progress.done}/{progress.total}
        </span>
        <Link href="/" scroll={false} aria-label={`Close ${template.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-board text-ink">
          <X size="1.25rem" weight="bold" aria-hidden />
        </Link>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col px-2">
        {shown.map((step) => {
          const done = doneIds.has(step.id);
          return (
            <li key={step.id} className="border-b border-panel last:border-0">
              <form action={toggleStep}>
                <input type="hidden" name="memberId" value={memberId} />
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="returnTo" value={here} />
                <button aria-pressed={done} className="flex h-12 w-full items-center gap-2 text-left" title={done ? "Tap to untick" : "Tap when done"}>
                  {step.icon ? <Emoji emoji={step.icon} className="size-7" faded={done} /> : <span className="size-7 shrink-0" aria-hidden />}
                  <span className={`min-w-0 flex-1 truncate text-lg font-semibold ${done ? "text-ink-muted line-through" : "text-ink"}`}>{step.text}</span>
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-white ${done ? "" : "border-[2.5px] border-check-border"}`}
                    style={done ? { background: ink } : undefined}
                    aria-hidden
                  >
                    {done ? <Check size="1rem" weight="bold" /> : null}
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {more > 0 ? (
        <Link href={`/?routine=${template.id}&member=${memberId}`} scroll={false} className="flex h-10 shrink-0 items-center px-3 text-base font-bold text-accent">
          +{more} more steps
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Where to draw each of a person's routines: at its start, nudged down so
 * points close together stay readable (and always in order).
 */
export function chainPositions(routines: FloatingRoutine[], first: number, last: number): Map<string, number> {
  const span = (last - first) * 60;
  // About one row of text on a 720-pixel-high screen.
  const gap = span * 0.055;
  const out = new Map<string, number>();
  let previous = -Infinity;
  for (const r of routines.toSorted((a, b) => a.placement.startMin - b.placement.startMin)) {
    const at = Math.max(r.placement.startMin, previous + gap);
    previous = at;
    out.set(r.assignment.id, ((at - first * 60) / span) * 100);
  }
  return out;
}

/**
 * Everyone's routines placed on a date, around that day's events and
 * meals (for screens other than Today, which works this out itself).
 */
export async function routinesPlacedOn(data: RoutineData, date: LocalDate, household: Household): Promise<Map<string, FloatingRoutine[]>> {
  const { timeZone } = household.settings;
  const { rangeStart, rangeEnd } = rangeOf([date], timeZone);
  const [{ items }, meals, basics] = await Promise.all([loadCalendar(rangeStart, rangeEnd), loadMeals(date, date), loadMealBasics()]);
  const memberIds = new Set(data.members.map((m) => m.id));
  const timed = eventsOnDay(items, date, timeZone).filter((e) => !isAllDayStyle(e, timeZone));
  const forEveryone = timed.filter((e) => !e.member_ids.some((id) => memberIds.has(id)));
  const placedMeals = placeTodayMeals(
    meals,
    basics,
    timed.map((e) => ({
      startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
      endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
      title: e.title,
      memberIds: e.member_ids.filter((id) => memberIds.has(id)),
    })),
  );
  const dayMeals = mealsForRoutines(placedMeals);
  return new Map(
    data.members.map((m) => [
      m.id,
      floatingRoutines(data, m.id, date, [...timed.filter((e) => e.member_ids.includes(m.id)), ...forEveryone], timeZone, household.settings.routineFlexMinutes, dayMeals),
    ]),
  );
}
