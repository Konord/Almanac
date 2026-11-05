import { Clock } from "./clock";

/** The header clock, with the first time drawn on the server. */
export function HeaderClock({ locale, timeZone }: { locale: string; timeZone: string }) {
  const initial = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date());
  return <Clock initial={initial} locale={locale} timeZone={timeZone} />;
}
