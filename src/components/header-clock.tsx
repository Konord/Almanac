import { Clock } from "./clock";
import { clockTime } from "@/lib/time-text";

/** The header clock, with the first time drawn on the server. */
export function HeaderClock({ locale, timeZone }: { locale: string; timeZone: string }) {
  const initial = clockTime(new Date(), locale, timeZone);
  return <Clock initial={initial} locale={locale} timeZone={timeZone} />;
}
