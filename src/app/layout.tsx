import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { themeToCssVariables, whiteboardTheme } from "@/theme/tokens";
import { HouseholdTheme } from "@/theme/HouseholdTheme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Almanac",
  description: "Our family command centre",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The built-in whiteboard theme is applied straight away. Once we know
  // who's signed in, <HouseholdTheme> swaps in their active theme from the
  // database (which is the same whiteboard theme to begin with).
  const themeVariables = themeToCssVariables(whiteboardTheme) as CSSProperties;

  return (
    <html
      lang="en-CA"
      data-theme={whiteboardTheme.slug}
      style={themeVariables}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense>
          <HouseholdTheme />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
