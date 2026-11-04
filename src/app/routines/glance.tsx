import Link from "next/link";
import { MEMBER_COLOUR_CLASS } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { glanceRoutine, hhmm, isLate, kindForTime } from "@/lib/routines";
import { localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { dayRoutinesFor, type RoutineData } from "./data";
import { ProgressBar } from "./progress-bar";

/**
 * The Today screen's routines: each person's next step and progress.
 * Tapping a person opens their full checklist.
 */
export function RoutinesGlance({ data, date, household }: { data: RoutineData; date: LocalDate; household: Household }) {
  const { timeZone, locale } = household.settings;
  const now = localTimeOf(new Date(), timeZone);
  const people = data.members
    .map((member) => ({ member, routines: dayRoutinesFor(data, member.id, date) }))
    .filter((p) => p.routines.length > 0);

  return (
    <div className="rounded-[var(--radius)] border-2 border-frame bg-board p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-ink">Routines</h2>
        <Link href="/routines" className="text-lg text-marker-blue underline">
          All routines
        </Link>
      </div>
      {people.length === 0 ? (
        <p className="py-2 text-lg text-ink-muted">
          Nobody has a routine today.{" "}
          <Link href="/routines" className="text-marker-blue underline">
            Give someone one
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map(({ member, routines }) => {
            const current = glanceRoutine(
              routines.map((r) => ({ ...r, kind: r.template.kind, complete: r.progress.complete })),
              kindForTime(now, household.settings.dayProfile.eveningStarts),
            )!;
            const next = current.progress.next;
            const late = next ? isLate(next, now) : false;
            return (
              <li key={member.id}>
                <Link
                  href={`/routines?member=${member.id}`}
                  className="flex flex-col gap-2 rounded-[var(--radius)] border-2 border-frame p-4 hover:bg-panel"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xl font-semibold text-ink">
                      <span className={`size-4 rounded-full ${MEMBER_COLOUR_CLASS[member.colour] ?? "bg-marker-black"}`} />
                      {member.name}
                    </span>
                    <span className="text-base text-ink-muted">
                      {current.template.name} · {current.progress.done}/{current.progress.total}
                    </span>
                  </span>
                  <ProgressBar done={current.progress.done} total={current.progress.total} />
                  {next ? (
                    <span className="flex items-center gap-3">
                      <span className="text-3xl" aria-hidden>
                        {next.icon}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-lg text-ink">Next: {next.text}</span>
                        {next.target_time ? (
                          <span className={`text-base ${late ? "font-semibold text-marker-red" : "text-ink-muted"}`}>
                            by{" "}
                            {new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" })
                              .format(zonedToUtc(date, hhmm(next.target_time), timeZone))
                              .replace(":00", "")}
                            {late ? " · running late" : ""}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <span className="text-lg font-semibold text-marker-green">All done ✓</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
