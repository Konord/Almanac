import type { Metadata } from "next";
import { Suspense } from "react";
// Fonts are local files in public/fonts, set up in globals.css (no Google
// Fonts call): Atkinson Hyperlegible Next with Figtree digits for printed
// text, and Shantell Sans for things the family wrote (Glance, 2026-11-15).
import { brightTheme, themeToCssVariables } from "@/theme/tokens";
import { HouseholdTheme } from "@/theme/HouseholdTheme";
import { ScreenSaver } from "@/components/screen-saver";
import "./globals.css";

export const metadata: Metadata = {
  title: "Almanac",
  description: "Our family command centre",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The built-in bright theme is applied straight away. Once we know who's
  // signed in, <HouseholdTheme> swaps in their active theme from the
  // database (which is the same bright theme to begin with).
  // A <style> rule rather than an inline style on <html>, so the household
  // theme (and a holiday's colours) written after it can override it.
  const themeRule = `:root { ${Object.entries(themeToCssVariables(brightTheme))
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ")} }`;

  return (
    <html lang="en-CA" data-theme={brightTheme.slug} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <style>{themeRule}</style>
        <Suspense>
          <HouseholdTheme />
        </Suspense>
        {children}
        {/* The art screen saver covers every screen when it comes on (kitchen screen only). */}
        <ScreenSaver />
      </body>
    </html>
  );
}
