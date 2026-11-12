"use client";

import { useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { moveMealThisDay } from "@/app/meals/actions";
import { clock, useTimelineDrag } from "./timeline-drag";

/**
 * A planned meal on the calendar (Today and the week view) that you can
 * drag (Connor, 2026-11-11): up or down for another time, or sideways to
 * another day on the week view. It moves only this one meal; the meal's
 * usual time stays as set in the Routine Manager. A tap still opens it.
 */
export function DraggableMeal({
  mealId,
  href,
  day,
  start,
  minutes,
  first,
  last,
  className,
  style,
  title,
  children,
}: {
  mealId: string;
  href: string;
  day: string;
  start: number;
  minutes: number;
  first: number;
  last: number;
  className: string;
  /** Left, width and the like (top and height come from the drag). */
  style: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const drag = useTimelineDrag({
    first,
    last,
    placement: { start, minutes, day },
    onTap: () => router.push(href, { scroll: false }),
    onDrop: (p) =>
      startSaving(async () => {
        const result = await moveMealThisDay({ mealId, date: p.day, time: clock(p.start) });
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
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href, { scroll: false });
      }}
      className={`${className} cursor-grab touch-none select-none active:cursor-grabbing ${drag.dragging ? "z-30 shadow-lg ring-2 ring-ink" : ""} ${saving ? "opacity-70" : ""}`}
      style={{ ...style, ...drag.position, height: `max(${drag.position.height}, 2.25rem)` }}
    >
      {children}
      {drag.dragging ? <span className="absolute right-1 bottom-1 rounded-md bg-ink px-1.5 text-sm font-bold text-board">{clock(drag.shown.start)}</span> : null}
    </div>
  );
}
