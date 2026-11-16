"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { rescheduleEvent, stretchEventDays } from "@/app/calendar/actions";
import { SideHandles } from "./side-handles";
import { clock, useTimelineDrag } from "./timeline-drag";

/**
 * An event card on the Week hour grid you can drag (restored from main,
 * SPEC "Week event dragging restored — Connor, Nov 16 2026"): up and down
 * to change the time, sideways to another day, or by its bottom edge to
 * change how long it is. Pulling a side over more days makes it a
 * multi-day event. A tap (no movement) still opens it for editing.
 *
 * The day column it sits in is marked data-drop-day and is the whole day
 * (midnight to midnight) tall, so the drag maths (useTimelineDrag) works in
 * fractions of that column; the card itself is drawn in rem like the rest
 * of the grid: `hourRem` per hour, at least `minMinutes` tall, `gapRem`
 * clear of its neighbours.
 */
export function DraggableEvent({
  href,
  eventId,
  occurrenceDate,
  day,
  week,
  start,
  minutes,
  hourRem,
  minMinutes,
  gapRem,
  className,
  style,
  title,
  children,
}: {
  href: string;
  eventId: string;
  occurrenceDate: string | null;
  day: string;
  /** The days shown, in order, so the card's sides stretch it over more days. */
  week: string[];
  /** Minutes since midnight, and how long it really lasts. */
  start: number;
  minutes: number;
  hourRem: number;
  minMinutes: number;
  gapRem: number;
  className: string;
  /** Left, width and background (top and height follow the drag). */
  style: CSSProperties;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const drag = useTimelineDrag({
    first: 0,
    last: 24,
    placement: { start, minutes, day },
    onTap: () => router.push(href, { scroll: false }),
    onDrop: (p) =>
      startSaving(async () => {
        const result = await rescheduleEvent({ eventId, occurrenceDate, date: p.day, startTime: clock(p.start), minutes: p.minutes });
        if (result.error) {
          drag.clearPreview();
          window.alert(result.error);
        } else {
          router.refresh();
        }
      }),
  });

  // Stretching sideways over more days: it becomes a multi-day event.
  const [stretching, setStretching] = useState<[number, number] | null>(null);
  const d0 = week.indexOf(day);
  const stretched = stretching
    ? { left: `calc(${(stretching[0] - d0) * 100}% + 0.4rem)`, width: `calc(${(stretching[1] - stretching[0] + 1) * 100}% - 0.8rem)`, zIndex: 30 }
    : null;
  const stretch = (range: [number, number]) =>
    startSaving(async () => {
      const result = await stretchEventDays({ eventId, occurrenceDate, daysBefore: d0 - range[0], daysAfter: range[1] - d0 });
      if (result.error) window.alert(result.error);
      else router.refresh();
    });

  // Drawn in the grid's rem, at least one compact card tall.
  const { start: at, minutes: long } = drag.shown;
  const box: CSSProperties = {
    top: `${(at / 60) * hourRem + gapRem}rem`,
    height: `${(Math.max(long, minMinutes) / 60) * hourRem - 2 * gapRem}rem`,
    transform: drag.position.transform,
  };

  return (
    <div
      {...drag.bodyHandlers}
      role="link"
      tabIndex={0}
      title={title}
      aria-label={title}
      // Stop the browser's own picture-dragging from taking over.
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href, { scroll: false });
      }}
      className={`${className} quiet-handles cursor-grab touch-none select-none active:cursor-grabbing ${drag.dragging || stretching ? "is-dragging" : ""} ${
        drag.dragging ? "z-30 shadow-lg ring-2 ring-ink" : ""
      } ${stretching ? "ring-2 ring-ink" : ""} ${saving ? "opacity-70" : ""}`}
      style={{ ...style, ...box, ...stretched }}
    >
      {children}
      {d0 >= 0 ? <SideHandles byDay columns={week} c0={d0} c1={d0} onPreview={setStretching} onDone={stretch} /> : null}
      {drag.dragging ? (
        <span className="tabular pointer-events-none absolute right-[0.4rem] bottom-[1.4rem] z-20 rounded-[var(--radius-small)] bg-ink px-[0.4rem] text-[1.125rem] leading-[1.3] font-bold text-board">
          {drag.label}
        </span>
      ) : null}
      <ResizeHandle handlers={drag.handleHandlers} />
    </div>
  );
}

/** The strip along the bottom of a card that changes its length (main's pending-block ResizeHandle). */
function ResizeHandle({ handlers }: { handlers: React.HTMLAttributes<HTMLDivElement> }) {
  return (
    <div {...handlers} aria-hidden className="absolute inset-x-0 bottom-0 z-10 flex h-[1.25rem] cursor-ns-resize touch-none items-end justify-center pb-[0.25rem]">
      <span className="handle-mark h-[0.25rem] w-[2rem] rounded-full bg-ink/40" />
    </div>
  );
}
