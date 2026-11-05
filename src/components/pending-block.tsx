"use client";

import { updatePending, usePending } from "./pending-store";
import { useTimelineDrag } from "./timeline-drag";

/**
 * The dashed outline of the event you're adding. Drag it to move it, or
 * drag its bottom edge to change the length; the card follows along.
 */
export function PendingBlock({ day, member, first, last }: { day: string; member?: string; first: number; last: number }) {
  const pending = usePending();
  const show =
    pending !== null && !pending.allDay && pending.start !== null && pending.date === day && (member === undefined || pending.member === member);
  if (!show) return null;
  return <Outline first={first} last={last} placement={{ start: pending.start!, minutes: pending.minutes, day, member }} />;
}

function Outline({ first, last, placement }: { first: number; last: number; placement: { start: number; minutes: number; day: string; member?: string } }) {
  const drag = useTimelineDrag({
    first,
    last,
    placement,
    onDrop: (p) => updatePending({ date: p.day, start: p.start, minutes: p.minutes, ...(p.member ? { member: p.member } : {}) }),
  });
  return (
    <div
      {...drag.bodyHandlers}
      aria-label={`New event, ${drag.label}. Drag to move it.`}
      className="absolute inset-x-1 z-30 flex cursor-grab touch-none flex-col rounded-[0.875rem] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] px-2 py-1 select-none active:cursor-grabbing"
      style={drag.position}
    >
      <span className="text-sm font-bold text-ink">{drag.label}</span>
      <ResizeHandle handlers={drag.handleHandlers} />
    </div>
  );
}

/** The strip along the bottom of a block that changes its length. */
export function ResizeHandle({ handlers }: { handlers: React.HTMLAttributes<HTMLDivElement> }) {
  return (
    <div
      {...handlers}
      aria-hidden
      className="absolute inset-x-0 bottom-0 flex h-5 cursor-ns-resize touch-none items-end justify-center pb-1"
    >
      <span className="h-1 w-8 rounded-full bg-ink/40" />
    </div>
  );
}
