/**
 * Theme tokens: every colour, font and size the app uses comes from here.
 *
 * Components never hard-code a colour like "#2F6FB8". They use a token
 * such as "accent" (in Tailwind classes like `text-accent`) instead. That
 * way a seasonal theme can swap the whole look by swapping one object.
 *
 * The values are the "Glance A" look (docs/glance/SPEC.md, 2026-11-15):
 * a light grey rail behind white rounded panels, soft person tints with a
 * strong accent bar, darker "hand" inks for handwritten text, butter yellow
 * for meals, and a red Now line.
 *
 * This file is the one source of truth. The database's `themes` table only
 * holds a household's own changes on top of it (the built-in "bright" row
 * is empty since the Glance migration), so editing a value here changes
 * every household.
 */

export type ThemeTokens = {
  colors: {
    /** White panels and cards */
    board: string;
    /** The page background behind the panels (the "rail") */
    rail: string;
    /** Slightly darker fill: segmented switch track, chips, soft buttons */
    panel: string;
    /** Hairlines around cards and between rows */
    frame: string;
    /** Calendar grid lines and empty progress bars */
    grid: string;
    /** Main text */
    ink: string;
    /** Labels and secondary text */
    inkMuted: string;
    /** Secondary text a step darker (dates beside a title, times) */
    inkSoft: string;
    /** Empty check circles */
    checkBorder: string;
    /** The big page title and its secondary text, which sit on the rail */
    title: string;
    titleSoft: string;
    /** The main action (Add, New list): ink black, or a holiday colour */
    primary: string;
    primaryInk: string;
    /** The chosen tab in a segmented switch */
    tabOn: string;
    tabOnInk: string;
    /** Links and small highlights */
    accent: string;
    /** Errors and "remove" buttons */
    danger: string;
    /** Done ticks and success messages */
    success: string;
    /** The Now line on white */
    now: string;
    /** Now / "IN 20 MIN" on a person's tint (darker so it holds 4.5:1) */
    nowOnTint: string;
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
    /** The tray handle bar */
    handle: string;
    /** The art screen saver's mat board: white, cream and charcoal (src/components/screen-saver.tsx) */
    matWhite: string;
    matCream: string;
    matCharcoal: string;
    /**
     * One colour per person (see src/lib/colours.ts): strong (accent bars,
     * dots), soft (tints behind their things) and hand (their handwritten
     * text, darkened so it holds 4.5:1 on the soft tint). A holiday theme
     * never changes these.
     */
    personBlue: string;
    personBlueSoft: string;
    personBlueHand: string;
    personPink: string;
    personPinkSoft: string;
    personPinkHand: string;
    personTeal: string;
    personTealSoft: string;
    personTealHand: string;
    personPurple: string;
    personPurpleSoft: string;
    personPurpleHand: string;
    personOrange: string;
    personOrangeSoft: string;
    personOrangeHand: string;
    personGreen: string;
    personGreenSoft: string;
    personGreenHand: string;
    personSlate: string;
    personSlateSoft: string;
    personSlateHand: string;
  };
  /** Corner rounding for small chips */
  radiusSmall: string;
  /** Corner rounding for buttons and inputs */
  radius: string;
  /** Corner rounding for cards and panels */
  radiusCard: string;
  /** Corner rounding for sheets and dialogs */
  radiusDialog: string;
  /** The soft lift under cards and the chosen tab */
  shadowRaised: string;
  /** The deeper shadow under sheets, the tray and popovers */
  shadowDialog: string;
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
  // The slug stays "bright" so households' saved "activeTheme" still matches.
  slug: "bright",
  name: "Glance",
  tokens: {
    colors: {
      board: "#FFFFFF",
      rail: "#F6F7F9",
      panel: "#EEF0F3",
      frame: "#E3E6EA",
      grid: "#E3E6EA",
      ink: "#23262B",
      inkMuted: "#565B63",
      inkSoft: "#4E535B",
      checkBorder: "#8A9099",
      title: "#23262B",
      titleSoft: "#4E535B",
      primary: "#23262B",
      primaryInk: "#FFFFFF",
      tabOn: "#FFFFFF",
      tabOnInk: "#23262B",
      accent: "#2F6FB8",
      danger: "#C23B2B",
      success: "#166F77",
      now: "#CF3F29",
      nowOnTint: "#A3261A",
      meal: "#FBEDB5",
      mealInk: "#5E4806",
      met: "#3D8B37",
      metSoft: "#D8F0D2",
      missed: "#D9533F",
      missedSoft: "#F2A79A",
      alertSoft: "#FDECE8",
      handle: "#C5C8CE",
      matWhite: "#F7F6F2",
      matCream: "#ECE5D6",
      matCharcoal: "#36383C",
      personBlue: "#2F6FB8",
      personBlueSoft: "#CFE3F8",
      personBlueHand: "#2963A6",
      personPink: "#B83D69",
      personPinkSoft: "#F9D3DF",
      personPinkHand: "#A6375E",
      personTeal: "#16757D",
      personTealSoft: "#C8EEF0",
      personTealHand: "#157179",
      personPurple: "#8A4BBA",
      personPurpleSoft: "#E8D3F5",
      personPurpleHand: "#7D42A8",
      personOrange: "#AD540F",
      personOrangeSoft: "#FCDDBE",
      personOrangeHand: "#9C4B0C",
      personGreen: "#2F7A4A",
      personGreenSoft: "#CDE8D6",
      personGreenHand: "#2A6B3F",
      personSlate: "#5C6370",
      personSlateSoft: "#E3E6EA",
      personSlateHand: "#4E535B",
    },
    radiusSmall: "0.75rem",
    radius: "1.125rem",
    radiusCard: "1.375rem",
    radiusDialog: "1.875rem",
    shadowRaised: "0 1px 3px rgba(30,35,45,0.10)",
    shadowDialog: "0 0 2.5rem rgba(30,35,45,0.25)",
    touchTarget: "3.625rem",
  },
};

/** The non-colour tokens and the CSS variables they become. */
const SIZE_VARS = {
  radiusSmall: "--radius-small",
  radius: "--radius",
  radiusCard: "--radius-card",
  radiusDialog: "--radius-dialog",
  shadowRaised: "--shadow-raised",
  shadowDialog: "--shadow-dialog",
  touchTarget: "--touch-target",
} as const satisfies Record<Exclude<keyof ThemeTokens, "colors">, string>;

export const SIZE_TOKEN_KEYS = Object.keys(SIZE_VARS) as (keyof typeof SIZE_VARS)[];

/**
 * Turns a theme into CSS variables (e.g. --color-person-blue) that the
 * stylesheet and Tailwind classes read from.
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  return { ...colorVariables(theme.tokens.colors), ...sizeVariables(theme.tokens) };
}

/** Just the colour variables, for a partial set (a holiday theme's changes). */
export function colorVariables(colors: Partial<ThemeTokens["colors"]>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) if (value) vars[`--color-${toKebabCase(key)}`] = value;
  return vars;
}

function sizeVariables(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of SIZE_TOKEN_KEYS) vars[SIZE_VARS[key]] = tokens[key];
  return vars;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
