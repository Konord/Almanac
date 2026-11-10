import { Suspense } from "react";
import { AppFrame } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { loadHolidays } from "./data";
import { HolidayManager } from "./manager";

/**
 * Holidays and birthdays (2026-11-09): special all-day days that come back
 * every year. Holidays come from a public list (or your own); birthdays are
 * a name, a date and a birth year. One Save for the screen.
 */
export default function HolidaysPage() {
  return (
    <AppFrame section="calendar">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Holidays />
      </Suspense>
    </AppFrame>
  );
}

async function Holidays() {
  const household = await requireHousehold();
  const { locale, timeZone } = household.settings;
  const initial = await loadHolidays();
  return (
    <HolidayManager
      initial={initial}
      today={localDateOf(new Date(), timeZone)}
      locale={locale}
    />
  );
}
