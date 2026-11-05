import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { brightTheme, themeToCssVariables, type Theme, type ThemeTokens } from "./tokens";

/**
 * Applies the household's active theme from the database by writing its
 * tokens as CSS variables, plus the handwriting setting. If anything is
 * missing it quietly keeps the built-in bright theme the layout applied.
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
    rules.push(
      ...Object.entries(themeToCssVariables(theme))
        .filter(([, value]) => /^[#a-zA-Z0-9.(),% -]+$/.test(value)) // only plain colour/size values
        .map(([name, value]) => `${name}: ${value};`),
    );
  }
  // Handwriting off: family-written things use the normal font too.
  if (!household.settings.handwriting) rules.push("--almanac-font-hand: var(--font-sans);");

  return rules.length ? <style>{`:root { ${rules.join(" ")} }`}</style> : null;
}

function mergeTokens(raw: unknown): ThemeTokens {
  const base = brightTheme.tokens;
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<ThemeTokens>;
  return {
    colors: { ...base.colors, ...(typeof value.colors === "object" ? value.colors : {}) },
    radius: typeof value.radius === "string" ? value.radius : base.radius,
    radiusCard: typeof value.radiusCard === "string" ? value.radiusCard : base.radiusCard,
    touchTarget: typeof value.touchTarget === "string" ? value.touchTarget : base.touchTarget,
  };
}
