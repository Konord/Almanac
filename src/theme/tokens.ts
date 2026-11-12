/**
 * Theme tokens: every colour, font and size the app uses comes from here.
 *
 * Components never hard-code a colour like "#2F74C0". They use a token
 * such as "accent" (in Tailwind classes like `text-accent`) instead. That
 * way a seasonal theme can swap the whole look by swapping one object.
 *
 * The values follow the locked "bright" style guide: a white board, a light
 * grey icon rail, one colour per person, and butter yellow for meals.
 * The database keeps a copy per household (the `themes` table); this file
 * is the built-in default, and anything missing there falls back to it.
 */

export type ThemeTokens = {
  colors: {
    /** The white page surface */
    board: string;
    /** The left icon rail and soft fills (weather pill, chips) */
    rail: string;
    /** Slightly darker fill: segmented switch track, hover */
    panel: string;
    /** Hairlines around cards and between rows */
    frame: string;
    /** Calendar grid lines and empty progress bars */
    grid: string;
    /** Main text */
    ink: string;
    /** Secondary text */
    inkMuted: string;
    /** Text on pastel event blocks (times) */
    inkSoft: string;
    /** Empty check boxes and circles */
    checkBorder: string;
    /** Links and small highlights */
    accent: string;
    /** Errors and "remove" buttons */
    danger: string;
    /** Done ticks and success messages */
    success: string;
    /** The "now" line and today's date badge */
    now: string;
    /** Meal chips and the dinner card */
    meal: string;
    mealInk: string;
    /** Habits: a met day (green tick), and the short bars on a count chart */
    met: string;
    metSoft: string;
    /** Habits: a missed day (red cross), and bars short of the goal */
    missed: string;
    missedSoft: string;
    /** Health: the shaded band on a reading above its line (a fever) */
    alertSoft: string;
    /** One strong + one pastel colour per person (see src/lib/colours.ts) */
    personBlue: string;
    personBlueSoft: string;
    personPink: string;
    personPinkSoft: string;
    personTeal: string;
    personTealSoft: string;
    personPurple: string;
    personPurpleSoft: string;
    personOrange: string;
    personOrangeSoft: string;
    personGreen: string;
    personGreenSoft: string;
    personSlate: string;
    personSlateSoft: string;
  };
  /** Corner rounding for buttons and inputs */
  radius: string;
  /** Corner rounding for cards */
  radiusCard: string;
  /** Minimum size of anything you tap; large for a wall touchscreen */
  touchTarget: string;
};

export type Theme = {
  /** Stable identifier, e.g. "bright" or "autumn" */
  slug: string;
  name: string;
  tokens: ThemeTokens;
};

export const brightTheme: Theme = {
  slug: "bright",
  name: "Bright",
  tokens: {
    colors: {
      board: "#FFFFFF",
      rail: "#F6F7F9",
      panel: "#F1F2F5",
      frame: "#ECEEF1",
      grid: "#EEF0F3",
      ink: "#23262B",
      inkMuted: "#6B7078",
      inkSoft: "#4E535B",
      checkBorder: "#B9BEC6",
      accent: "#2F74C0",
      danger: "#C23B2B",
      success: "#1B8790",
      now: "#E5533D",
      meal: "#FBEDB5",
      mealInk: "#5E4806",
      met: "#3D8B37",
      metSoft: "#D8F0D2",
      missed: "#D9533F",
      missedSoft: "#F2A79A",
      alertSoft: "#FDECE8",
      personBlue: "#2F74C0",
      personBlueSoft: "#CFE3F8",
      personPink: "#CC4A78",
      personPinkSoft: "#F9D3DF",
      personTeal: "#1B8790",
      personTealSoft: "#C8EEF0",
      personPurple: "#9150C2",
      personPurpleSoft: "#E8D3F5",
      personOrange: "#C9661C",
      personOrangeSoft: "#FCDDBE",
      personGreen: "#3D8B37",
      personGreenSoft: "#D5EDCC",
      personSlate: "#5B6472",
      personSlateSoft: "#E1E4E9",
    },
    radius: "1.125rem",
    radiusCard: "1.375rem",
    touchTarget: "3.625rem",
  },
};

/**
 * Turns a theme into CSS variables (e.g. --color-person-blue) that the
 * stylesheet and Tailwind classes read from.
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.tokens.colors)) {
    vars[`--color-${toKebabCase(key)}`] = value;
  }
  vars["--radius"] = theme.tokens.radius;
  vars["--radius-card"] = theme.tokens.radiusCard;
  vars["--touch-target"] = theme.tokens.touchTarget;
  return vars;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
