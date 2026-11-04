import Link from "next/link";
import { CHIP_CLASS } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { layoutDay, monthOf } from "@/lib/calendar-layout";
import { addDays, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import type { CalendarEvent, Layer } from "./types";

/** Height of one hour in the week grid. */
const HOUR_REM = 3;

type ViewProps = {
  household: Household;
  days: LocalDate[];
  today: LocalDate;
  events: CalendarEvent[];
  layerById: Map<string, Layer>;
  /** Builds a link back to this page with some settings changed. */
  href: (changes: Record<string, string | null>) => string;
};

function chipClass(layer: Layer | undefined): string {
  return CHIP_CLASS[layer?.colour ?? ""] ?? CHIP_CLASS["marker-black"];
}

function dayBounds(day: LocalDate, timeZone: string) {
  return { start: zonedToUtc(day, "00:00", timeZone), end: zonedToUtc(addDays(day, 1), "00:00", timeZone) };
}

function eventsOnDay(events: CalendarEvent[], day: LocalDate, timeZone: string) {
  const { start, end } = dayBounds(day, timeZone);
  return events.filter((e) => new Date(e.starts_at) < end && new Date(e.ends_at) > start);
}

/** All-day events, and timed events that run past midnight, go in the top row. */
function isAllDayStyle(event: CalendarEvent, timeZone: string): boolean {
  if (event.all_day) return true;
  return localDateOf(new Date(event.starts_at), timeZone) !== localDateOf(new Date(new Date(event.ends_at).getTime() - 1), timeZone);
}

function minutesIntoDay(instant: Date, timeZone: string): number {
  const [h, m] = localTimeOf(instant, timeZone).split(":").map(Number);
  return h * 60 + m;
}

function shortTime(instant: Date, household: Household): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" })
    .format(instant)
    .replace(":00", "")
    .replace(/\s?([ap])\.?m\.?/i, "$1");
}

function weekdayLabel(day: LocalDate, household: Household, style: "short" | "long" = "short"): string {
  const { locale, timeZone } = household.settings;
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: style }).format(zonedToUtc(day, "12:00", timeZone));
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

export function WeekView({ household, days, today, events, layerById, href }: ViewProps) {
  const { timeZone } = household.settings;

  // Show 6am–10pm, stretched to fit anything earlier or later this week.
  let firstHour = 6;
  let lastHour = 22;
  for (const day of days) {
    for (const e of eventsOnDay(events, day, timeZone)) {
      if (isAllDayStyle(e, timeZone)) continue;
      const startMin = minutesIntoDay(new Date(e.starts_at), timeZone);
      const endMin = minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60;
      firstHour = Math.min(firstHour, Math.floor(startMin / 60));
      lastHour = Math.max(lastHour, Math.ceil(endMin / 60));
    }
  }
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const gridTemplate = { gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" };

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border-2 border-frame bg-board">
      <div className="min-w-[56rem]">
        {/* Day headings */}
        <div className="grid border-b-2 border-frame" style={gridTemplate}>
          <div />
          {days.map((day) => (
            <Link
              key={day}
              href={href({ view: "week", date: day, add: day, edit: null })}
              className="flex flex-col items-center gap-0.5 border-l border-frame py-2 hover:bg-panel"
              title="Add an event on this day"
            >
              <span className="text-sm uppercase tracking-wide text-ink-muted">{weekdayLabel(day, household)}</span>
              <span
                className={`flex size-9 items-center justify-center rounded-full text-xl font-semibold ${
                  day === today ? "bg-marker-blue text-board" : "text-ink"
                }`}
              >
                {Number(day.slice(8))}
              </span>
            </Link>
          ))}
        </div>

        {/* All-day row */}
        <div className="grid border-b-2 border-frame" style={gridTemplate}>
          <div className="px-1 py-2 text-right text-xs text-ink-muted">all day</div>
          {days.map((day) => (
            <div key={day} className="flex min-h-10 flex-col gap-1 border-l border-frame p-1">
              {eventsOnDay(events, day, timeZone)
                .filter((e) => isAllDayStyle(e, timeZone))
                .map((e) => (
                  <Link
                    key={e.id}
                    href={href({ edit: e.id, add: null })}
                    className={`truncate rounded px-2 py-1 text-sm font-medium ${chipClass(layerById.get(e.layer_id))}`}
                  >
                    {e.title}
                  </Link>
                ))}
            </div>
          ))}
        </div>

        {/* Hour grid */}
        <div className="grid" style={gridTemplate}>
          <div>
            {hours.map((h) => (
              <div key={h} className="relative text-right text-xs text-ink-muted" style={{ height: `${HOUR_REM}rem` }}>
                <span className="absolute -top-2 right-1">{shortTime(zonedToUtc(today, `${String(h).padStart(2, "0")}:00`, timeZone), household)}</span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const blocks = eventsOnDay(events, day, timeZone)
              .filter((e) => !isAllDayStyle(e, timeZone))
              .map((e) => ({
                id: e.id,
                startMin: minutesIntoDay(new Date(e.starts_at), timeZone),
                endMin: minutesIntoDay(new Date(e.ends_at), timeZone) || 24 * 60,
              }));
            const placed = layoutDay(blocks);
            const byId = new Map(events.map((e) => [e.id, e]));
            return (
              <div key={day} className={`relative border-l border-frame ${day === today ? "bg-marker-blue/5" : ""}`}>
                {hours.map((h) => (
                  <div key={h} className="border-t border-frame/70" style={{ height: `${HOUR_REM}rem` }} />
                ))}
                {placed.map((block) => {
                  const event = byId.get(block.id);
                  if (!event) return null;
                  const top = ((block.startMin - firstHour * 60) / 60) * HOUR_REM;
                  const height = Math.max(((block.endMin - block.startMin) / 60) * HOUR_REM, 1.4);
                  return (
                    <Link
                      key={block.id}
                      href={href({ edit: event.id, add: null })}
                      className={`absolute overflow-hidden rounded px-1.5 py-1 text-xs leading-tight shadow-sm ring-1 ring-board ${chipClass(layerById.get(event.layer_id))}`}
                      style={{
                        top: `${top}rem`,
                        height: `${height}rem`,
                        left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / block.lanes}% - 4px)`,
                      }}
                    >
                      <span className="block truncate text-sm font-semibold">{event.title}</span>
                      <span className="block truncate opacity-90">
                        {shortTime(new Date(event.starts_at), household)}–{shortTime(new Date(event.ends_at), household)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

/** How many events a month cell lists before "+ N more". */
const MONTH_CELL_LIMIT = 3;

export function MonthView({ household, days, today, events, layerById, href, anchor }: ViewProps & { anchor: LocalDate }) {
  const { timeZone } = household.settings;
  const month = monthOf(anchor);

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border-2 border-frame bg-board">
      <div className="grid min-w-[42rem] grid-cols-7">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="border-b-2 border-frame py-2 text-center text-sm uppercase tracking-wide text-ink-muted">
            {weekdayLabel(day, household)}
          </div>
        ))}
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(events, day, timeZone).sort((a, b) => {
            const aAll = isAllDayStyle(a, timeZone) ? 0 : 1;
            const bAll = isAllDayStyle(b, timeZone) ? 0 : 1;
            return aAll - bAll || a.starts_at.localeCompare(b.starts_at);
          });
          const shown = dayEvents.slice(0, MONTH_CELL_LIMIT);
          const more = dayEvents.length - shown.length;
          const inMonth = monthOf(day) === month;
          return (
            <div
              key={day}
              className={`flex min-h-28 flex-col gap-1 border-frame p-1.5 ${i % 7 === 0 ? "" : "border-l"} ${
                i >= 7 ? "border-t" : ""
              } ${inMonth ? "" : "bg-panel/60"}`}
            >
              <Link
                href={href({ view: "week", date: day, edit: null, add: null })}
                className={`flex size-8 items-center justify-center self-start rounded-full text-base font-semibold ${
                  day === today ? "bg-marker-blue text-board" : inMonth ? "text-ink" : "text-ink-muted"
                }`}
                title="Open this week"
              >
                {Number(day.slice(8))}
              </Link>
              {shown.map((e) => {
                const allDay = isAllDayStyle(e, timeZone);
                const layer = layerById.get(e.layer_id);
                return allDay ? (
                  <Link key={e.id} href={href({ edit: e.id, add: null })} className={`truncate rounded px-1.5 py-0.5 text-xs font-medium ${chipClass(layer)}`}>
                    {e.title}
                  </Link>
                ) : (
                  <Link key={e.id} href={href({ edit: e.id, add: null })} className="flex items-center gap-1 truncate text-xs text-ink">
                    <span className={`size-2 shrink-0 rounded-full ${chipClass(layer).split(" ")[0]}`} />
                    <span className="text-ink-muted">{shortTime(new Date(e.starts_at), household)}</span>
                    <span className="truncate font-medium">{e.title}</span>
                  </Link>
                );
              })}
              {more > 0 ? (
                <Link href={href({ view: "week", date: day, edit: null, add: null })} className="text-xs text-marker-blue">
                  + {more} more
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { weekdayLabel };
