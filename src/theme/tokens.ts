/**
 * Theme tokens: every colour, font and size the app uses comes from here.
 *
 * Components never hard-code a colour like "#1d4ed8". They use a token
 * such as "marker-blue" instead. That way a seasonal theme (pumpkins in
 * October, snow in winter) can swap the whole look by swapping one object.
 *
 * Later (Phase 1, step 2) themes move into the `themes` database table and
 * this file becomes the built-in default that gets seeded there.
 */

export type ThemeTokens = {
  colors: {
    /** The off-white whiteboard surface */
    board: string;
    /** Slightly darker panels sitting on the board */
    panel: string;
    /** Frame and divider lines */
    frame: string;
    /** Main text */
    ink: string;
    /** Secondary text */
    inkMuted: string;
    /** The four marker colours */
    markerBlack: string;
    markerBlue: string;
    markerRed: string;
    markerGreen: string;
  };
  /** Corner rounding for cards and buttons */
  radius: string;
  /** Minimum size of anything you tap; large for a wall touchscreen */
  touchTarget: string;
};

export type Theme = {
  /** Stable identifier, e.g. "whiteboard" or "autumn" */
  slug: string;
  name: string;
  tokens: ThemeTokens;
};

export const whiteboardTheme: Theme = {
  slug: "whiteboard",
  name: "Whiteboard",
  tokens: {
    colors: {
      board: "#f7f6f2",
      panel: "#efede6",
      frame: "#d6d3c9",
      ink: "#1f2328",
      inkMuted: "#5b6169",
      markerBlack: "#1f2328",
      markerBlue: "#1d5fc4",
      markerRed: "#c62f2f",
      markerGreen: "#24803f",
    },
    radius: "0.75rem",
    touchTarget: "3.5rem",
  },
};

/**
 * Turns a theme into CSS variables (e.g. --color-marker-blue) that the
 * stylesheet and Tailwind classes read from.
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.tokens.colors)) {
    vars[`--color-${toKebabCase(key)}`] = value;
  }
  vars["--radius"] = theme.tokens.radius;
  vars["--touch-target"] = theme.tokens.touchTarget;
  return vars;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
