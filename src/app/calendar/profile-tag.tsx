import type { DayProfileKind } from "@/lib/day-profile";

/** Marker colour for each kind of day. */
export const PROFILE_CLASS: Record<DayProfileKind, string> = {
  free: "border-marker-green text-marker-green",
  busy: "border-marker-red text-marker-red",
  busy_evening: "border-marker-blue text-marker-blue",
};

const SHORT_LABEL: Record<DayProfileKind, string> = {
  free: "Free",
  busy: "Busy",
  busy_evening: "Busy eve",
};

/** A small outlined tag, like "Free" or "Busy eve", for calendar day headings. */
export function ProfileTag({ kind }: { kind: DayProfileKind }) {
  return (
    <span className={`rounded-full border px-2 text-xs font-semibold leading-5 ${PROFILE_CLASS[kind]}`}>
      {SHORT_LABEL[kind]}
    </span>
  );
}
