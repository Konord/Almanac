import Link from "next/link";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import type { BlockDay } from "@/lib/chore-blocks";
import { strong } from "@/lib/colours";
import type { Placement } from "@/lib/routine-placement";
import type { PlannedTodo } from "./blocks";

/**
 * A chore block on Today's timeline: a dashed block (it floats, like a
 * routine) with a broom stripe. Tapping it opens the Chores screen, where
 * its chores can be ticked off or swapped.
 */
export function ChoreBlockOnTimeline({
  day,
  placement,
  colour,
  first,
  last,
  clock,
}: {
  day: BlockDay<PlannedTodo>;
  placement: Placement;
  colour: string;
  first: number;
  last: number;
  /** Formats minutes since midnight, e.g. "10 a.m.". */
  clock: (minutes: number) => string;
}) {
  const span = (last - first) * 60;
  const shownMinutes = Math.max(placement.endMin - placement.startMin, 35);
  const top = ((placement.startMin - first * 60) / span) * 100;
  const height = (shownMinutes / span) * 100;
  const { block, items } = day;
  const flagged = Boolean(placement.movedFor || placement.clash);
  const when = placement.clash
    ? "No free time for it"
    : placement.movedFor
      ? `Moved for ${placement.movedFor}`
      : `${clock(placement.startMin)}–${clock(placement.endMin)}`;
  const what = block.kind === "closed" ? when : `${items.length} chore${items.length === 1 ? "" : "s"} · ${when}`;
  const short = shownMinutes < 55;
  return (
    <Link
      href={`/chores?date=${day.date}`}
      className={`absolute z-[1] flex gap-1.5 overflow-hidden rounded-xl border-2 border-dashed px-2 text-ink ${short ? "items-center" : "items-start py-1"}`}
      style={{
        top: `calc(${top}% + 2px)`,
        height: `calc(${height}% - 4px)`,
        left: "4px",
        right: "4px",
        borderColor: strong(colour),
        background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${strong(colour)} 9%, white) 0 0.5rem, white 0.5rem 1rem)`,
      }}
      title={`${block.name}: ${what}.`}
    >
      <Emoji emoji={block.icon ?? "🧹"} className="size-6" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base leading-[1.15] font-bold">{block.name}</span>
        {short ? null : (
          <span className={`truncate text-sm leading-[1.15] font-semibold ${flagged ? "" : "text-ink-soft"}`} style={flagged ? { color: strong(colour) } : undefined}>
            {flagged ? <ArrowsClockwise size="0.875rem" weight="bold" className="mr-0.5 inline" aria-label="Moved" /> : null}
            {what}
          </span>
        )}
      </span>
    </Link>
  );
}
