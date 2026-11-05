import Link from "next/link";
import { ArrowsClockwise, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import { strong } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { placeRoutines, usualSlot, type Busy, type Placement } from "@/lib/routine-placement";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import { isAllDayStyle, minutesIntoDay, shortTime } from "../calendar/views";
import type { CalendarItem } from "../calendar/types";
import { dayRoutinesFor, type DayRoutine, type RoutineData } from "./data";

export type FloatingRoutine = DayRoutine & { placement: Placement };

/**
 * One person's routines for a day, placed around their plans (their own
 * events and ones for everyone). See src/lib/routine-placement.ts.
 */
export function floatingRoutines(
  data: RoutineData,
  memberId: string,
  date: LocalDate,
  events: CalendarItem[],
  timeZone: string,
): FloatingRoutine[] {
  const routines = dayRoutinesFor(data, memberId, date);
  const busy: Busy[] = events
    .filter((e) => !isAllDayStyle(e, timeZone))
    .map((e) => ({
      startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
      endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
      title: e.title,
    }));
  const placements = placeRoutines(
    routines.map((r) => ({
      id: r.assignment.id,
      kind: r.template.kind,
      ...usualSlot(r.template, r.steps.map((s) => s.target_time)),
    })),
    busy,
  );
  return routines.map((r, i) => ({ ...r, placement: placements[i] }));
}

/** "7:00" for minutes since midnight, in the household's clock style. */
function clock(minutes: number, date: LocalDate, household: Household): string {
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return shortTime(zonedToUtc(date, `${hh}:${mm}`, household.settings.timeZone), household);
}

/**
 * A routine on the timeline: a dashed block in the person's colour, so it
 * reads as "this moves" next to the solid events. Tapping it opens the
 * person's checklist.
 */
export function RoutineBlock({
  routine,
  memberId,
  colour,
  date,
  first,
  last,
  household,
}: {
  routine: FloatingRoutine;
  memberId: string;
  colour: string;
  date: LocalDate;
  first: number;
  last: number;
  household: Household;
}) {
  const { placement, template, progress } = routine;
  const span = (last - first) * 60;
  // Short routines still get enough room for a line of text.
  const shownMinutes = Math.max(placement.endMin - placement.startMin, 35);
  const top = ((placement.startMin - first * 60) / span) * 100;
  const height = (shownMinutes / span) * 100;
  const icon = progress.next?.icon ?? routine.steps[0]?.icon ?? null;
  const when = placement.clash
    ? "No free time for it"
    : placement.movedFor
      ? `Moved for ${placement.movedFor}`
      : `${clock(placement.startMin, date, household)}–${clock(placement.endMin, date, household)}`;
  const flagged = Boolean(placement.movedFor || placement.clash);
  const short = shownMinutes < 55;
  const count = `${progress.done}/${progress.total}`;
  return (
    <Link
      href={`/routines?member=${memberId}`}
      className={`absolute z-[1] flex gap-1.5 overflow-hidden rounded-xl border-2 border-dashed px-2 text-ink ${short ? "items-center" : "items-start py-1"} ${progress.complete ? "opacity-60" : ""}`}
      style={{
        top: `calc(${top}% + 2px)`,
        height: `calc(${height}% - 4px)`,
        left: "4px",
        right: "4px",
        borderColor: strong(colour),
        background: `color-mix(in srgb, ${strong(colour)} 7%, white)`,
      }}
      title={`${template.name}: ${progress.done} of ${progress.total} done. ${when}.`}
    >
      {progress.complete ? (
        <CheckCircle size="1.5rem" weight="fill" className="shrink-0" style={{ color: strong(colour) }} aria-hidden />
      ) : (
        <Emoji emoji={icon} className="size-6" />
      )}
      {short ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm leading-[1.15] font-bold">{template.name}</span>
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold" style={flagged ? { color: strong(colour) } : undefined}>
            {flagged ? <ArrowsClockwise size="0.875rem" weight="bold" aria-label="Moved" /> : null}
            {count}
          </span>
        </>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base leading-[1.15] font-bold">{template.name}</span>
          <span
            className={`truncate text-sm leading-[1.15] font-semibold ${flagged ? "" : "text-ink-soft"}`}
            style={flagged ? { color: strong(colour) } : undefined}
          >
            {when} · {count}
          </span>
        </span>
      )}
    </Link>
  );
}
