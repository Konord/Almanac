"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { changeEventPeople, rescheduleEvent, stretchEventDays } from "@/app/calendar/actions";
import { spanBox } from "@/lib/calendar-layout";
import { SideHandles } from "./side-handles";
import { ResizeHandle } from "./pending-block";
import { clock, useTimelineDrag } from "./timeline-drag";

/**
 * An event block you can drag: up and down to change the time, sideways
 * to another day (or, on Today, another person), or by its bottom edge to
 * change how long it is. On the week view, pulling a side over more days
 * makes it a multi-day event. A tap still opens it for editing.
 */
export function DraggableEvent({
  href,
  eventId,
  occurrenceDate,
  day,
  people,
  start,
  minutes,
  first,
  last,
  className,
  style,
  title,
  children,
  week,
}: {
  /** On the week view: the week's days, so the block's sides stretch it over more days. */
  week?: string[];
  href: string;
  eventId: string;
  occurrenceDate: string | null;
  day: string;
  /**
   * On Today: every person's column in order, and the run of them this
   * bubble covers. Dragging it sideways moves it to the people it lands on.
   */
  people?: { columns: string[]; run: string[]; gap: string };
  start: number;
  minutes: number;
  first: number;
  last: number;
  className: string;
  /** Left, width and background (top and height come from the drag). */
  style: CSSProperties;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const drag = useTimelineDrag({
    first,
    last,
    placement: { start, minutes, day, member: people?.run[0] },
    onTap: () => router.push(href, { scroll: false }),
    onDrop: (p, fromMember) =>
      startSaving(async () => {
        const result = await rescheduleEvent({
          eventId,
          occurrenceDate,
          date: p.day,
          startTime: clock(p.start),
          minutes: p.minutes,
          ...(people && fromMember && p.member && p.member !== fromMember ? { members: shiftRun(people, fromMember, p.member) } : {}),
        });
        if (result.error) {
          drag.clearPreview();
          window.alert(result.error);
        } else {
          router.refresh();
        }
      }),
  });

  // Stretching sideways over more people (Today only).
  const [widening, setWidening] = useState<[number, number] | null>(null);
  const c0 = people ? people.columns.indexOf(people.run[0]) : -1;
  const c1 = people ? c0 + people.run.length - 1 : -1;
  const wide = people && widening ? spanBox(widening[0], widening[1], people.columns.length, people.gap) : null;
  const widen = (range: [number, number]) =>
    startSaving(async () => {
      if (!people) return;
      const result = await changeEventPeople({ eventId, remove: people.run, add: people.columns.slice(range[0], range[1] + 1) });
      if (result.error) window.alert(result.error);
      else router.refresh();
    });

  // Stretching sideways over more days (week view): it becomes a multi-day event.
  const [stretching, setStretching] = useState<[number, number] | null>(null);
  const d0 = week ? week.indexOf(day) : -1;
  const stretched =
    week && stretching
      ? { left: `calc(${(stretching[0] - d0) * 100}% + 4px)`, width: `calc(${(stretching[1] - stretching[0] + 1) * 100}% - 8px)`, zIndex: 30 }
      : null;
  const stretch = (range: [number, number]) =>
    startSaving(async () => {
      const result = await stretchEventDays({ eventId, occurrenceDate, daysBefore: d0 - range[0], daysAfter: range[1] - d0 });
      if (result.error) window.alert(result.error);
      else router.refresh();
    });

  return (
    <div
      {...drag.bodyHandlers}
      role="link"
      tabIndex={0}
      title={title}
      // Stop the browser's own picture-dragging from taking over.
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href, { scroll: false });
      }}
      className={`${className} quiet-handles cursor-grab touch-none select-none active:cursor-grabbing ${drag.dragging || widening || stretching ? "is-dragging" : ""} ${drag.dragging ? "z-30 shadow-lg ring-2 ring-ink" : ""} ${saving ? "opacity-70" : ""}`}
      style={{ ...style, ...drag.position, ...wide, ...stretched }}
    >
      {children}
      {people ? <SideHandles columns={people.columns} c0={c0} c1={c1} onPreview={setWidening} onDone={widen} /> : null}
      {week && d0 >= 0 ? <SideHandles byDay columns={week} c0={d0} c1={d0} onPreview={setStretching} onDone={stretch} /> : null}
      {drag.dragging ? (
        <span className="absolute right-1 bottom-5 rounded-md bg-ink px-1.5 text-sm font-bold text-board">{drag.label}</span>
      ) : null}
      <ResizeHandle handlers={drag.handleHandlers} />
    </div>
  );
}

/** The people a bubble covers after sliding it from one person's column to another's. */
function shiftRun(people: { columns: string[]; run: string[] }, from: string, to: string): { remove: string[]; add: string[] } {
  const { columns, run } = people;
  const c0 = columns.indexOf(run[0]);
  const delta = columns.indexOf(to) - columns.indexOf(from);
  const start = Math.min(Math.max(c0 + delta, 0), columns.length - run.length);
  return { remove: run, add: columns.slice(start, start + run.length) };
}
