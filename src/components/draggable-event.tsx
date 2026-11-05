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
  member,
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
  /** The Today column it sits in; moving to another column changes who it's for. */
  member?: string;
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
    placement: { start, minutes, day, member },
    onTap: () => router.push(href, { scroll: false }),
    onDrop: (p) =>
      startSaving(async () => {
        const result = await rescheduleEvent({
          eventId,
          occurrenceDate,
          date: p.day,
          startTime: clock(p.start),
          minutes: p.minutes,
          ...(member !== undefined && p.member !== member
            ? { swapMember: { from: member === "everyone" ? null : member, to: p.member === "everyone" ? null : (p.member ?? null) } }
            : {}),
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
