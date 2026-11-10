"use client";

import { useState } from "react";
import { memberRuns, spanBox } from "@/lib/calendar-layout";
import { SideHandles } from "./side-handles";
import { updatePending, usePending, type PendingEvent } from "./pending-store";
import { useTimelineDrag, type Placement } from "./timeline-drag";

/**
 * The dashed outline of the event you're adding (week view: one per day
 * column). Drag it to move it, or drag its bottom edge to change the
 * length; the card follows along.
 */
export function PendingBlock({ day, first, last }: { day: string; first: number; last: number }) {
  const pending = usePending();
  if (pending === null || pending.allDay || pending.start === null || pending.date !== day) return null;
  return (
    <Outline
      first={first}
      last={last}
      placement={{ start: pending.start, minutes: pending.minutes, day }}
      onDrop={(p) => updatePending({ date: p.day, start: p.start, minutes: p.minutes })}
    />
  );
}

/**
 * On Today: the outline across the chosen people's columns (the whole row
 * when it's for everyone). Sliding it sideways moves it to other people.
 */
export function PendingSpans({ day, columns, first, last, gap }: { day: string; columns: string[]; first: number; last: number; gap: string }) {
  const pending = usePending();
  if (pending === null || pending.allDay || pending.start === null || pending.date !== day) return null;
  const runs = memberRuns(pending.members, columns);
  return (
    <>
      {runs.map(([c0, c1]) => {
        const run = columns.slice(c0, c1 + 1);
        return (
          <Outline
            key={`${c0}-${c1}`}
            first={first}
            last={last}
            placement={{ start: pending.start!, minutes: pending.minutes, day, member: run[0] }}
            style={spanBox(c0, c1, columns.length, gap)}
            sides={{
              columns,
              c0,
              c1,
              gap,
              // Everyone is the whole row; otherwise swap this run's people for the new ones.
              onDone: ([a, b]) => {
                const next = [...new Set([...pending.members.filter((m) => !run.includes(m)), ...columns.slice(a, b + 1)])];
                updatePending({ members: columns.every((id) => next.includes(id)) ? [] : next });
              },
            }}
            onDrop={(p, from) => {
              const changes: Partial<PendingEvent> = { start: p.start, minutes: p.minutes };
              if (from && p.member && p.member !== from) {
                const shift = columns.indexOf(p.member) - columns.indexOf(from);
                const start = Math.min(Math.max(c0 + shift, 0), columns.length - run.length);
                const moved = columns.slice(start, start + run.length);
                // For everyone, the outline already covers the row; otherwise swap this run's people.
                if (pending.members.length > 0) changes.members = [...pending.members.filter((m) => !run.includes(m)), ...moved];
              }
              updatePending(changes);
            }}
          />
        );
      })}
    </>
  );
}

function Outline({
  first,
  last,
  placement,
  style,
  onDrop,
  sides,
}: {
  first: number;
  last: number;
  placement: Placement;
  style?: React.CSSProperties;
  onDrop: (p: Placement, fromMember?: string) => void;
  /** On Today: stretch it sideways over more people. */
  sides?: { columns: string[]; c0: number; c1: number; gap: string; onDone: (range: [number, number]) => void };
}) {
  const drag = useTimelineDrag({ first, last, placement, onDrop });
  const [widening, setWidening] = useState<[number, number] | null>(null);
  const wide = sides && widening ? spanBox(widening[0], widening[1], sides.columns.length, sides.gap) : null;
  return (
    <div
      {...drag.bodyHandlers}
      aria-label={`New event, ${drag.label}. Drag to move it.`}
      className={`absolute z-30 flex cursor-grab touch-none flex-col rounded-[0.875rem] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] px-2 py-1 select-none active:cursor-grabbing ${style ? "" : "inset-x-1"}`}
      style={{ ...style, ...drag.position, ...wide }}
    >
      <span className="text-sm font-bold text-ink">{drag.label}</span>
      {sides ? <SideHandles columns={sides.columns} c0={sides.c0} c1={sides.c1} onPreview={setWidening} onDone={sides.onDone} /> : null}
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
      <span className="handle-mark h-1 w-8 rounded-full bg-ink/40" />
    </div>
  );
}
