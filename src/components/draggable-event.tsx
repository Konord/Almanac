"use client";

import { useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { rescheduleEvent } from "@/app/calendar/actions";
import { ResizeHandle } from "./pending-block";
import { clock, useTimelineDrag } from "./timeline-drag";

/**
 * An event block you can drag: up and down to change the time, sideways
 * to another day (or, on Today, another person), or by its bottom edge to
 * change how long it is. A tap still opens it for editing.
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
}: {
  href: string;
  eventId: string;
  occurrenceDate: string | null;
  day: string;
  /**
   * On Today: every person's column in order, and the run of them this
   * bubble covers. Dragging it sideways moves it to the people it lands on.
   */
  people?: { columns: string[]; run: string[] };
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
      className={`${className} cursor-grab touch-none select-none active:cursor-grabbing ${drag.dragging ? "z-30 shadow-lg ring-2 ring-ink" : ""} ${saving ? "opacity-70" : ""}`}
      style={{ ...style, ...drag.position }}
    >
      {children}
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
