import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { themeToCssVariables, whiteboardTheme } from "@/theme/tokens";
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
  // For now there is one built-in theme. Later the active theme comes from
  // the household's settings in the database.
  const themeVariables = themeToCssVariables(whiteboardTheme) as CSSProperties;

  return (
    <html
      lang="en-CA"
      data-theme={whiteboardTheme.slug}
      style={themeVariables}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
