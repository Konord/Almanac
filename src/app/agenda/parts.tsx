import Link from "next/link";
import { Check, MapPin } from "@phosphor-icons/react/dist/ssr";
import { Emoji } from "@/components/ui";
import { EVERYONE_COLOUR, hand, soft, strong } from "@/lib/colours";
import { SoonBadge } from "./fit";

/*
 * The pieces of the Glance agenda panel (docs/glance/SPEC.md, "Finalized
 * agenda" to "FINAL update"; values from mockups/glance/src/g-final-agenda.html).
 * The page works out what goes where; these only draw it.
 */

/** The people an event is for, as colours: one, two (a split bar), or everyone (orange). */
export function cardColours(colours: string[]): { tint: string; bar: string } {
  if (colours.length === 1) return { tint: soft(colours[0]), bar: strong(colours[0]) };
  if (colours.length === 2) {
    // Two people: the first person's tint, and a bar split top / bottom.
    return { tint: soft(colours[0]), bar: `linear-gradient(to bottom, ${strong(colours[0])} 50%, ${strong(colours[1])} 50%)` };
  }
  return { tint: soft(EVERYONE_COLOUR), bar: strong(EVERYONE_COLOUR) };
}

export type AgendaEvent = {
  key: string;
  title: string;
  emoji: string;
  /** "9 am" */
  start: string;
  /** "10" for "until 10"; null for a moment with no length. */
  until: string | null;
  /** Where (a plain place name), if the event has one. */
  place: string | null;
  colours: string[];
  href: string;
  past: boolean;
  /** The next thing coming up: it gets "IN 20 MIN" while that's 30 minutes away or less. */
  soon: { startsAt: string; minutes: number | null } | null;
};

/** A timed event at the original Glance A size: time column, picture, handwritten title. */
export function EventCard({ event }: { event: AgendaEvent }) {
  const { tint, bar } = cardColours(event.colours);
  return (
    <Link
      href={event.href}
      data-card
      {...(event.past ? { "data-past": "" } : {})}
      aria-label={`Edit event: ${event.title}`}
      className="relative grid min-h-24 shrink-0 grid-cols-[8.5rem_3.5rem_minmax(0,1fr)] items-center gap-5 overflow-hidden rounded-[var(--radius-card)] py-[0.9rem] pr-5 pl-7"
      style={{ background: tint }}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-2 ${event.past ? "opacity-40" : ""}`} style={{ background: bar }} />
      <span className={`tabular text-[1.75rem] leading-[1.05] ${event.past ? "font-bold text-ink-muted" : "font-extrabold text-ink"}`}>
        {event.soon ? <SoonBadge startsAt={event.soon.startsAt} initial={event.soon.minutes} /> : null}
        {event.start}
        {event.until ? <span className={`block text-[1.125rem] font-semibold ${event.past ? "text-ink-muted" : "text-ink-soft"}`}>until {event.until}</span> : null}
      </span>
      <Emoji emoji={event.emoji} className={`size-13 ${event.past ? "opacity-65" : ""}`} />
      <span className="min-w-0">
        <span className={`line-clamp-2 font-hand text-[1.625rem] leading-[1.15] ${event.past ? "text-ink-muted" : "text-ink"}`}>{event.title}</span>
        {event.place ? (
          // A small printed line (the place is typed on the event sheet, not handwritten).
          <span className={`mt-[0.15rem] flex min-w-0 items-center gap-[0.35rem] text-[1.125rem] font-semibold ${event.past ? "text-ink-muted" : "text-ink-soft"}`}>
            <MapPin size="1.125rem" weight="bold" aria-hidden className="shrink-0" />
            <span className="truncate">{event.place}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export type AgendaRoutine = {
  key: string;
  title: string;
  emoji: string;
  start: string;
  past: boolean;
  /** Each person on it: tap a name to open their checklist. */
  people: { name: string; colour: string; href: string; done: boolean; count: string }[];
};

/**
 * A routine at the time it starts: a slimmer, neutral card with the
 * people doing it. Tapping a name opens that person's checklist in the
 * right-hand column (where steps get ticked).
 */
export function RoutineCard({ routine }: { routine: AgendaRoutine }) {
  const allDone = routine.people.every((p) => p.done);
  return (
    <div
      data-card
      {...(routine.past || allDone ? { "data-past": "" } : {})}
      className="grid min-h-[4.25rem] shrink-0 grid-cols-[8.5rem_3.5rem_minmax(0,1fr)] items-center gap-5 rounded-[var(--radius-card)] bg-panel py-[0.4rem] pr-3 pl-7"
    >
      <span className={`tabular text-[1.25rem] font-extrabold ${routine.past || allDone ? "text-ink-muted" : "text-ink-soft"}`}>{routine.start}</span>
      <Emoji emoji={routine.emoji} className={`size-10 justify-self-center ${routine.past || allDone ? "opacity-65" : ""}`} />
      <span className="flex min-w-0 items-center gap-3">
        <span className={`min-w-0 flex-1 truncate font-hand text-[1.5rem] ${routine.past || allDone ? "text-ink-muted" : "text-ink"}`}>{routine.title}</span>
        {routine.people.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            scroll={false}
            aria-label={`${p.name}'s ${routine.title}, ${p.done ? "done" : `${p.count} done`}: open the checklist`}
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-board px-4 text-[1.25rem] font-bold"
            style={{ color: hand(p.colour) }}
          >
            {p.done ? <Check size="1.125rem" weight="bold" aria-hidden /> : <span aria-hidden className="size-3 rounded-full" style={{ background: strong(p.colour) }} />}
            {p.name}
          </Link>
        ))}
      </span>
    </div>
  );
}

export type AllDayChip = {
  key: string;
  label: string;
  emoji: string | null;
  /** Things the family added are handwritten; official days (a kind of day, a holiday) are printed. */
  printed: boolean;
  /** Whose it is (their tint, bar and ink); empty: nobody in particular. */
  colours: string[];
  href: string | null;
};

/** The all-day strip across the top of the event column: one row, then "+N". */
export function AllDayStrip({ chips }: { chips: AllDayChip[] }) {
  if (chips.length === 0) return null;
  return (
    // The strip is the chips' height (46px at 1440, as mocked). It clips sideways
    // only, so each chip's tap area can reach above and below it (48px+).
    <div data-strip aria-label="All day" className="flex min-w-0 shrink-0 flex-nowrap items-center gap-[0.45rem] overflow-x-clip overflow-y-visible">
      {chips.map((c) => {
        const owned = c.colours.length > 0;
        const { tint, bar } = owned ? cardColours(c.colours) : { tint: "var(--color-panel)", bar: "" };
        const look = `relative flex h-[2.15rem] shrink-0 items-center gap-[0.3rem] overflow-hidden rounded-[var(--radius-small)] pr-[0.7rem] text-[1.15rem] font-bold whitespace-nowrap ${
          owned ? "pl-[0.7rem]" : "pl-[0.55rem]"
        } ${c.printed ? "" : "font-hand"}`;
        const body = (
          <>
            {owned ? <span aria-hidden className="absolute inset-y-0 left-0 w-[0.28rem]" style={{ background: bar }} /> : null}
            {c.emoji ? <Emoji emoji={c.emoji} className="size-6" /> : null}
            {c.label}
          </>
        );
        const style = { background: tint, color: owned ? hand(c.colours[0]) : "var(--color-ink)" };
        // The chip is small (46px at 1440); a link's tap area reaches above
        // and below it (64px) without making the strip any taller.
        return c.href ? (
          <Link key={c.key} href={c.href} data-chip className="-my-[0.43rem] flex shrink-0 py-[0.43rem]">
            <span className={look} style={style}>
              {body}
            </span>
          </Link>
        ) : (
          <span key={c.key} data-chip className={look} style={style}>
            {body}
          </span>
        );
      })}
      <span data-more-chip hidden className="flex h-[2.15rem] shrink-0 items-center rounded-[var(--radius-small)] bg-panel px-[0.55rem] text-[1.15rem] font-extrabold text-ink-muted" />
    </div>
  );
}

export type ComingUpItem = { key: string; title: string; emoji: string; when: string; href: string };

/** The next few things after today, at the bottom of the panel when there's room. */
export function ComingUp({ items }: { items: ComingUpItem[] }) {
  if (items.length === 0) return null;
  return (
    <section data-coming aria-label="Coming up" className="mt-auto shrink-0">
      <h2 className="mb-3 text-[1.25rem] leading-[1.25] font-bold text-ink-muted">Coming up</h2>
      <div className="grid grid-cols-3 gap-4">
        {items.map((e) => (
          <Link key={e.key} href={e.href} className="flex min-h-18 min-w-0 items-center gap-[0.9rem] rounded-[var(--radius)] bg-panel px-[1.1rem] py-[0.9rem]">
            <Emoji emoji={e.emoji} className="size-10" />
            <span className="min-w-0">
              <b className="block truncate font-hand text-[1.25rem] leading-[1.25] text-ink">{e.title}</b>
              <span className="tabular block truncate text-[1.125rem] leading-[1.25] font-semibold text-ink-soft">{e.when}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
