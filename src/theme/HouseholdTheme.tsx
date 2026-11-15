import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { HOLIDAY_THEMES, holidayHero } from "@/lib/holiday-theme";
import { loadSpecialDays } from "@/app/holidays/data";
import { brightTheme, colorVariables, SIZE_TOKEN_KEYS, themeToCssVariables, type Theme, type ThemeTokens } from "./tokens";

/**
 * Holiday colours repaint the page background (the rail) dark. Screens
 * whose content still sits straight on the rail (Today, Week, Month until
 * their Glance redesign) can't be read on it, so the colours stay off
 * until those screens put their content on white panels. The holiday
 * title and picture on Today already show.
 * TODO(glance): set to true once Agenda, Week and Month are redesigned.
 */
const HOLIDAY_COLOURS_READY = false;

/**
 * Applies the household's active theme by writing its tokens as CSS
 * variables, plus the handwriting setting and, on Christmas or Halloween
 * (when holiday themes are on), that holiday's colours. If anything is
 * missing it quietly keeps the built-in theme the layout applied.
 */
export async function HouseholdTheme() {
  const household = await getHousehold();
  if (!household) return null;

  const rules: string[] = [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("themes")
    .select("slug, name, tokens")
    .eq("slug", household.settings.activeTheme)
    .maybeSingle();
  if (data) {
    const theme: Theme = { slug: data.slug, name: data.name, tokens: mergeTokens(data.tokens) };
    rules.push(...cssRules(themeToCssVariables(theme)));
  }

  // A themed holiday today changes the page colours (never the person colours).
  const today = localDateOf(new Date(), household.settings.timeZone);
  const specials = (await loadSpecialDays(today, today)).get(today) ?? [];
  const hero = holidayHero(specials, household.settings.holidayThemes);
  if (HOLIDAY_COLOURS_READY && hero?.theme) rules.push(...cssRules(colorVariables(HOLIDAY_THEMES[hero.theme].colours)));

  // Handwriting off: family-written things use the normal font too.
  if (!household.settings.handwriting) rules.push("--almanac-font-hand: var(--font-sans);");

  return rules.length ? <style>{`:root { ${rules.join(" ")} }`}</style> : null;
}

/** Plain colour/size values only, so a stored theme can't inject other CSS. */
function cssRules(vars: Record<string, string>): string[] {
  return Object.entries(vars)
    .filter(([, value]) => /^[#a-zA-Z0-9.(),% -]+$/.test(value))
    .map(([name, value]) => `${name}: ${value};`);
}

/** The built-in theme with a household's own changes (if any) on top. */
function mergeTokens(raw: unknown): ThemeTokens {
  const base = brightTheme.tokens;
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<ThemeTokens>;
  const merged: ThemeTokens = {
    ...base,
    colors: { ...base.colors, ...(value.colors && typeof value.colors === "object" ? value.colors : {}) },
  };
  for (const key of SIZE_TOKEN_KEYS) {
    const v = value[key];
    if (typeof v === "string") merged[key] = v;
  }
  return merged;
}
