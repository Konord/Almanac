import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
// Fonts are bundled with the app (no Google Fonts call): Atkinson Hyperlegible
// Next for everything, and Kalam handwriting for family-written things.
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource/kalam/400.css";
import "@fontsource/kalam/700.css";
import { brightTheme, themeToCssVariables } from "@/theme/tokens";
import { HouseholdTheme } from "@/theme/HouseholdTheme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Almanac",
  description: "Our family command centre",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The built-in bright theme is applied straight away. Once we know who's
  // signed in, <HouseholdTheme> swaps in their active theme from the
  // database (which is the same bright theme to begin with).
  const themeVariables = themeToCssVariables(brightTheme) as CSSProperties;

  return (
    <html lang="en-CA" data-theme={brightTheme.slug} style={themeVariables} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Suspense>
          <HouseholdTheme />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
