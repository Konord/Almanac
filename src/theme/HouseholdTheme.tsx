import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { themeToCssVariables, whiteboardTheme, type Theme, type ThemeTokens } from "./tokens";

/**
 * Applies the household's active theme from the database by writing its
 * tokens as CSS variables. If anything is missing it quietly keeps the
 * built-in whiteboard theme that the layout already applied.
 */
export async function HouseholdTheme() {
  const household = await getHousehold();
  if (!household) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("themes")
    .select("slug, name, tokens")
    .eq("slug", household.settings.activeTheme)
    .maybeSingle();
  if (!data) return null;

  const theme: Theme = { slug: data.slug, name: data.name, tokens: mergeTokens(data.tokens) };
  const css = Object.entries(themeToCssVariables(theme))
    .filter(([, value]) => /^[#a-zA-Z0-9.(),% -]+$/.test(value)) // only plain colour/size values
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");

  return <style>{`:root { ${css} }`}</style>;
}

function mergeTokens(raw: unknown): ThemeTokens {
  const base = whiteboardTheme.tokens;
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<ThemeTokens>;
  return {
    colors: { ...base.colors, ...(typeof value.colors === "object" ? value.colors : {}) },
    radius: typeof value.radius === "string" ? value.radius : base.radius,
    touchTarget: typeof value.touchTarget === "string" ? value.touchTarget : base.touchTarget,
  };
}
