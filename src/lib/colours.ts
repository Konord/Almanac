/**
 * One colour per person. Each has a strong shade (avatars, progress bars)
 * and a pastel shade (event blocks). The shades themselves are theme
 * tokens, so a seasonal theme can tweak them; here we only name them.
 */
export const PERSON_COLOURS = [
  { value: "blue", label: "Blue" },
  { value: "pink", label: "Pink" },
  { value: "teal", label: "Teal" },
  { value: "purple", label: "Purple" },
  { value: "orange", label: "Orange" },
  { value: "green", label: "Green" },
  { value: "slate", label: "Slate" },
] as const;

export type PersonColour = (typeof PERSON_COLOURS)[number]["value"];

/** Things for everyone (no one person) use orange, as in the style guide. */
export const EVERYONE_COLOUR: PersonColour = "orange";

export function isPersonColour(value: string): value is PersonColour {
  return PERSON_COLOURS.some((c) => c.value === value);
}

/** The strong shade, as a CSS value, e.g. for an avatar background. */
export function strong(colour: string | null | undefined): string {
  return `var(--color-person-${isPersonColour(colour ?? "") ? colour : EVERYONE_COLOUR})`;
}

/** The pastel shade, as a CSS value, e.g. for an event block. */
export function soft(colour: string | null | undefined): string {
  return `var(--color-person-${isPersonColour(colour ?? "") ? colour : EVERYONE_COLOUR}-soft)`;
}
