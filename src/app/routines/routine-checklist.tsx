import { Pager } from "@/components/pager";
import Link from "next/link";
import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { Avatar, Emoji, ProgressBar } from "@/components/ui";
import type { LocalDate } from "@/lib/time";
import { endRoutine, toggleStep } from "./actions";
import { dayRoutinesFor, type RoutineData } from "./data";

/** Steps shown at a time, so the panel never scrolls. */
const PER_PAGE = 6;

/**
 * A routine's checklist, shown in the Today panel's working part when its
 * block on the calendar is tapped. Tick steps off here.
 */
export function RoutineChecklist({
  data,
  memberId,
  templateId,
  date,
  today,
  page,
  closeHref,
  hereHref,
}: {
  data: RoutineData;
  memberId: string;
  templateId: string;
  date: LocalDate;
  today: LocalDate;
  page: number;
  /** Where the close button goes (back to the list). */
  closeHref: string;
  /** This screen with the checklist open on a page, for coming back after a tick. */
  hereHref: (page: number) => string;
}) {
  const member = data.members.find((m) => m.id === memberId);
  const routine = member ? dayRoutinesFor(data, member.id, date).find((r) => r.template.id === templateId) : undefined;
  if (!member || !routine) {
    return (
      <div className="flex flex-1 flex-col gap-3 py-3">
        <p className="text-lg text-ink-muted">That routine isn&rsquo;t on today any more.</p>
        <Link href={closeHref} className="mt-auto flex min-h-11 items-center text-lg font-bold text-accent">
          Back to the list
        </Link>
      </div>
    );
  }
  const { template, steps, doneIds, progress } = routine;
  const ended = data.ended.has(`${member.id}:${template.id}`);
  const over = date < today || ended;
  const pages = Math.max(1, Math.ceil(steps.length / PER_PAGE));
  const shownPage = Math.min(Math.max(0, page), pages - 1);
  const returnTo = hereHref(shownPage);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 pt-1">
        <Avatar name={member.name} colour={member.colour} icon={member.icon} size="sm" />
        <h2 className="min-w-0 flex-1 truncate text-xl font-extrabold text-ink">{template.name}</h2>
        <Link href={closeHref} aria-label="Close the routine" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rail text-ink">
          <X size="1.25rem" weight="bold" aria-hidden />
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <ProgressBar done={progress.done} total={progress.total} colour={member.colour} />
        </div>
        <span className={`text-base font-bold ${progress.complete ? "text-success" : "text-ink-muted"}`}>
          {progress.complete ? "All done ✓" : `${progress.done}/${progress.total}`}
        </span>
      </div>
      <ul className="mt-1 flex flex-col">
        {steps.slice(shownPage * PER_PAGE, shownPage * PER_PAGE + PER_PAGE).map((step) => {
          const done = doneIds.has(step.id);
          return (
            <li key={step.id} className="border-b border-panel last:border-0">
              <form action={toggleStep}>
                <input type="hidden" name="memberId" value={member.id} />
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button aria-pressed={done} className="flex min-h-14 w-full items-center gap-3 text-left" title={done ? "Tap to untick" : "Tap when done"}>
                  {step.icon ? <Emoji emoji={step.icon} className="size-8" faded={done} /> : <span className="size-8 shrink-0" aria-hidden />}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-xl leading-[1.1] font-semibold ${done || over ? "text-ink-muted" : "text-ink"}`}>{step.text}</span>
                    {over && !done ? <span className="text-sm font-bold text-ink-muted">Missed · tap if it got done</span> : null}
                  </span>
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${done ? "bg-success" : "border-[2.5px] border-check-border"}`}
                    aria-hidden
                  >
                    {done ? <Check size="1.125rem" weight="bold" /> : null}
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center gap-2 pt-1 text-base font-bold">
        <Pager page={shownPage} pages={pages} href={hereHref} />
        {date === today && !progress.complete ? (
          <form action={endRoutine} className="ml-auto">
            <input type="hidden" name="memberId" value={member.id} />
            <input type="hidden" name="templateId" value={template.id} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="returnTo" value={returnTo} />
            {ended ? <input type="hidden" name="reopen" value="true" /> : null}
            <button className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-ink">
              {ended ? "Reopen" : "End"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
