import Link from "next/link";
import { Alarm } from "@phosphor-icons/react/dist/ssr";
import { Avatar, Card, Emoji, ProgressBar } from "@/components/ui";
import type { Household } from "@/lib/household";
import { glanceRoutine, hhmm, isLate, kindForTime } from "@/lib/routines";
import { localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { dayRoutinesFor, type RoutineData } from "./data";

/**
 * The Today screen's routines card: each person's current routine, their
 * next step and progress. Tapping a person opens their full checklist.
 */
export function RoutinesGlance({ data, date, household, className = "" }: { data: RoutineData; date: LocalDate; household: Household; className?: string }) {
  const { timeZone, locale } = household.settings;
  const now = localTimeOf(new Date(), timeZone);
  const people = data.members
    .map((member) => ({ member, routines: dayRoutinesFor(data, member.id, date) }))
    .filter((p) => p.routines.length > 0);

  return (
    <Card
      title="Routines"
      icon={Alarm}
      tint="teal"
      className={className}
      aside={
        <Link href="/routines" className="flex min-h-[var(--touch-target)] items-center text-lg font-bold text-accent">
          Checklists
        </Link>
      }
    >
      {people.length === 0 ? (
        <p className="py-2 text-xl text-ink-muted">
          Nobody has a routine today.{" "}
          <Link href="/routines/manage" className="font-bold text-accent">
            Give someone one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {people.map(({ member, routines }) => {
            const current = glanceRoutine(
              routines.map((r) => ({ ...r, kind: r.template.kind, complete: r.progress.complete })),
              kindForTime(now, household.settings.dayProfile.eveningStarts),
            )!;
            const next = current.progress.next;
            const late = next ? isLate(next, now) : false;
            return (
              <li key={member.id} className="border-b border-panel last:border-0">
                <Link href={`/routines?member=${member.id}`} className="flex flex-col gap-2.5 py-3.5">
                  <span className="flex items-center gap-3">
                    <Avatar name={member.name} colour={member.colour} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex justify-between gap-2 text-lg font-bold text-ink">
                        <span className="truncate">
                          {member.name} · {current.template.name}
                        </span>
                        <span className="shrink-0 font-semibold text-ink-muted">
                          {current.progress.done}/{current.progress.total}
                        </span>
                      </span>
                      <ProgressBar done={current.progress.done} total={current.progress.total} colour={member.colour} />
                    </span>
                  </span>
                  {next ? (
                    <span className="flex items-center gap-3.5 pl-14">
                      <Emoji emoji={next.icon} className="size-10" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-xl font-semibold text-ink">Next: {next.text}</span>
                        {next.target_time ? (
                          <span className={`text-sm font-bold ${late ? "text-now" : "text-ink-muted"}`}>
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
                    <span className="pl-14 text-xl font-bold text-success">All done ✓</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
