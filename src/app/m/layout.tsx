import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { PhoneNav, PhoneNavHere } from "./phone-ui";

/*
 * The phone version (Connor, 2026-11-21): its own pages under /m, for
 * adding things on the go, the grocery list, and checking the calendar
 * when making plans. The kitchen screens don't change.
 *
 * Unlike the wall screen, these pages scroll up and down like any phone
 * app (no scrollbar shows on a phone). The tabs sit along the bottom,
 * where a thumb reaches them.
 */

export const metadata: Metadata = {
  title: "Almanac",
  appleWebApp: { capable: true, title: "Almanac", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f7f9",
};

export default function PhoneLayout({ children }: LayoutProps<"/m">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-rail pt-[env(safe-area-inset-top)]">
      {/* Room at the bottom so the last row clears the tabs. */}
      <div className="flex flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
      <Suspense fallback={<PhoneNav path="" />}>
        <PhoneNavHere />
      </Suspense>
    </div>
  );
}
