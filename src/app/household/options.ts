/** The marker colours a member can be shown in (theme token names). */
export const MEMBER_COLOURS = [
  { value: "marker-blue", label: "Blue" },
  { value: "marker-red", label: "Red" },
  { value: "marker-green", label: "Green" },
  { value: "marker-black", label: "Black" },
] as const;

export type MemberColour = (typeof MEMBER_COLOURS)[number]["value"];

/** Tailwind needs whole class names written out, so map colour to class. */
export const MEMBER_COLOUR_CLASS: Record<string, string> = {
  "marker-blue": "bg-marker-blue",
  "marker-red": "bg-marker-red",
  "marker-green": "bg-marker-green",
  "marker-black": "bg-marker-black",
};
