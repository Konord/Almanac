/*
 * Holiday themes (Glance spec, "Holiday theme system", 2026-11-15).
 *
 * On a named holiday the big weekday title on Today is replaced by the
 * holiday's name and a large emoji beside it; the weekday moves into the
 * date line ("Friday, December 25"). Christmas and Halloween also change
 * the page colours: the rail, the panels, the Add button, the chosen tab
 * and the Now line. Any other holiday keeps the normal colours.
 *
 * Person colours are never part of a holiday theme, so everyone's things
 * look the same whatever the day.
 *
 * Kept free of other imports so `node --test` can run the tests.
 */

/** The colour tokens a holiday may change (see src/theme/tokens.ts). Nothing else. */
export type HolidayColours = {
  rail: string;
  board: string;
  panel: string;
  frame: string;
  title: string;
  titleSoft: string;
  primary: string;
  primaryInk: string;
  tabOn: string;
  tabOnInk: string;
  now: string;
  nowOnTint: string;
};

export type HolidayThemeName = "christmas" | "halloween";

export const HOLIDAY_THEMES: Record<HolidayThemeName, { emoji: string; colours: HolidayColours }> = {
  christmas: {
    emoji: "🎄",
    colours: {
      rail: "#1A3C2E", // deep pine
      board: "#FBF6EE",
      panel: "#EFE6D6",
      frame: "#E0D4C2",
      title: "#F7F1E4",
      titleSoft: "#E8E0D0",
      primary: "#A31D2B",
      primaryInk: "#FFFFFF",
      tabOn: "#A31D2B",
      tabOnInk: "#FFFFFF",
      now: "#A31D2B",
      nowOnTint: "#A31D2B",
    },
  },
  halloween: {
    emoji: "🎃",
    colours: {
      rail: "#1C1524", // purple-black
      board: "#F7F4F0",
      panel: "#EDE7E0",
      frame: "#DDD5CC",
      title: "#F7F1E4",
      titleSoft: "#E8D6B0",
      primary: "#B34800",
      primaryInk: "#FFFFFF",
      tabOn: "#B34800",
      tabOnInk: "#FFFFFF",
      // Darker than the button so the label still holds 4.5:1 on person tints.
      now: "#9B3A00",
      nowOnTint: "#9B3A00",
    },
  },
};

/** A holiday on today's date, as the holidays list gives it. */
export type HolidayToday = { kind: "holiday" | "birthday"; name: string; icon: string | null };

export type HolidayHero = {
  /** The holiday's name, shown in place of the weekday. */
  title: string;
  /** The big picture beside the title. */
  emoji: string | null;
  /** Christmas or Halloween colours, or null to keep the normal look. */
  theme: HolidayThemeName | null;
};

/** Which shipped colour theme a holiday's name asks for, if any. */
export function themeFor(name: string): HolidayThemeName | null {
  const n = name.toLowerCase();
  if (/\bchristmas\b/.test(n) && !/\beve\b/.test(n)) return "christmas";
  if (/\bhalloween\b/.test(n)) return "halloween";
  return null;
}

/**
 * Today's hero: the first holiday today (birthdays don't count), or null.
 * With holiday themes switched off in Settings there is no hero at all.
 */
export function holidayHero(specials: readonly HolidayToday[], enabled: boolean): HolidayHero | null {
  if (!enabled) return null;
  const holiday = specials.find((s) => s.kind === "holiday");
  if (!holiday) return null;
  const theme = themeFor(holiday.name);
  return { title: holiday.name, emoji: holiday.icon ?? (theme ? HOLIDAY_THEMES[theme].emoji : null), theme };
}
