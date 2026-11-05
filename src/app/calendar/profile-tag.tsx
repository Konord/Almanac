import type { DayProfileKind } from "@/lib/day-profile";

/** Colour for each kind of day (theme tokens). */
export const PROFILE_COLOUR: Record<DayProfileKind, string> = {
  free: "var(--color-success)",
  busy: "var(--color-now)",
  busy_evening: "var(--color-person-purple)",
};

const SHORT_LABEL: Record<DayProfileKind, string> = {
  free: "Free",
  busy: "Busy",
  busy_evening: "Busy eve",
};

/** A small soft tag, like "Free" or "Busy eve", for calendar day headings. */
export function ProfileTag({ kind }: { kind: DayProfileKind }) {
  const colour = PROFILE_COLOUR[kind];
  return (
    <span
      className="shrink-0 rounded-full px-2.5 text-sm leading-7 font-bold whitespace-nowrap"
      style={{ color: colour, background: `color-mix(in srgb, ${colour} 12%, white)` }}
    >
      {SHORT_LABEL[kind]}
    </span>
  );
}
