import { Check } from "@phosphor-icons/react/dist/ssr";
import { Emoji, ProgressBar } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import type { Household } from "@/lib/household";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import { endRoutine, setDay, toggleStep } from "./actions";
import { dayRoutinesFor, personDay, type RoutineData, type RoutineMember } from "./data";

/**
 * A routine's checklist, opened by tapping its block on the calendar.
 * Tick steps off here. It also shows what kind of day it is for the person
 * (and their wake-up and bedtime), which can be changed for just this date.
 */
export function ChecklistSheet({
  data,
  memberId,
  templateId,
  date,
  today,
  household,
  closeHref,
  returnTo,
}: {
  data: RoutineData;
  memberId: string;
  templateId: string;
  date: LocalDate;
  today: LocalDate;
  household: Household;
  /** Where Close goes. */
  closeHref: string;
  /** This screen with the sheet open, so ticking keeps it open. */
  returnTo: string;
}) {
  const member = data.members.find((m) => m.id === memberId);
  const routine = member ? dayRoutinesFor(data, member.id, date).find((r) => r.template.id === templateId) : undefined;
  if (!member || !routine) {
    return (
      <Sheet title="Routine" closeHref={closeHref} narrow>
        <p className="text-lg text-ink-muted">That routine isn&rsquo;t on today any more.</p>
      </Sheet>
    );
  }
  const { template, steps, doneIds, progress } = routine;
  const ended = data.ended.has(`${member.id}:${template.id}`);
  const missedAll = date < today || ended;
  const dayTitle = new Intl.DateTimeFormat(household.settings.locale, { timeZone: household.settings.timeZone, weekday: "long" }).format(
    zonedToUtc(date, "12:00", household.settings.timeZone),
  );

  return (
    <Sheet title={`${member.name}: ${template.name}`} closeHref={closeHref} narrow>
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ProgressBar done={progress.done} total={progress.total} colour={member.colour} thick />
          </div>
          <span className={`text-lg font-bold ${progress.complete ? "text-success" : "text-ink-muted"}`}>
            {progress.complete ? "All done ✓" : `${progress.done}/${progress.total}`}
          </span>
          {date === today && !progress.complete ? (
            <form action={endRoutine}>
              <input type="hidden" name="memberId" value={member.id} />
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="returnTo" value={returnTo} />
              {ended ? <input type="hidden" name="reopen" value="true" /> : null}
              <button className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-base font-bold text-ink" title={ended ? "Carry on with it" : "Finish it now; anything unticked counts as missed"}>
                {ended ? "Reopen" : "End"}
              </button>
            </form>
          ) : null}
        </div>
        <ul className="grid min-h-0 grid-cols-1 gap-x-6 sm:grid-cols-2">
          {steps.map((step) => {
            const done = doneIds.has(step.id);
            return (
              <li key={step.id}>
                <form action={toggleStep}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <input type="hidden" name="stepId" value={step.id} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button aria-pressed={done} className="flex min-h-16 w-full items-center gap-3.5 py-1 text-left" title={done ? "Tap to untick" : "Tap when done"}>
                    {step.icon ? <Emoji emoji={step.icon} className="size-10" faded={done} /> : <span className="size-10 shrink-0" aria-hidden />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`text-xl leading-[1.1] font-semibold ${done || missedAll ? "text-ink-muted" : "text-ink"}`}>{step.text}</span>
                      {missedAll && !done ? <span className="text-sm font-bold text-ink-muted">Missed · tap if it got done</span> : null}
                    </span>
                    <span
                      className={`flex size-8.5 shrink-0 items-center justify-center rounded-full text-white ${done ? "bg-success" : "border-[2.5px] border-check-border"}`}
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
        <div className="mt-auto border-t border-frame pt-3">
          <DayBar data={data} member={member} date={date} dayTitle={dayTitle} returnTo={returnTo} />
        </div>
      </div>
    </Sheet>
  );
}

/** What kind of day it is for this person, with their wake-up and bedtime. Tap a kind of day to switch just this date. */
function DayBar({ data, member, date, dayTitle, returnTo }: { data: RoutineData; member: RoutineMember; date: LocalDate; dayTitle: string; returnTo: string }) {
  const day = personDay(data, member.id, date);
  const types = data.dayTypes.filter((t) => t.member_id === member.id);
  const override = data.overrides.find((o) => o.member_id === member.id && o.date === date);
  const hidden = (
    <>
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
  return (
    <div className="flex flex-col gap-2.5" aria-label="Kind of day">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-lg font-bold text-ink">
          {member.name}&rsquo;s {dayTitle} is a
        </span>
        {types.map((t) => {
          const active = t.id === day.dayType?.id;
          return (
            <form key={t.id} action={setDay}>
              {hidden}
              <input type="hidden" name="dayTypeId" value={t.id} />
              <button
                aria-pressed={active}
                className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-base ${active ? "border-ink bg-rail font-bold text-ink" : "border-frame bg-board text-ink"}`}
              >
                {t.icon ? <Emoji emoji={t.icon} className="size-6" /> : null}
                {t.name}
              </button>
            </form>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={setDay} className="flex items-center gap-2">
          {hidden}
          <label className="flex items-center gap-1.5 text-base font-bold text-ink">
            Up
            <input name="wake" type="time" defaultValue={day.wake} className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base" />
          </label>
          <label className="flex items-center gap-1.5 text-base font-bold text-ink">
            Bed
            <input name="bed" type="time" defaultValue={day.bed} className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base" />
          </label>
          <button className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-base font-bold text-ink">Set for this day</button>
        </form>
        {override ? (
          <form action={setDay}>
            {hidden}
            <input type="hidden" name="reset" value="true" />
            <button className="flex min-h-11 items-center rounded-xl px-2 text-base font-bold text-accent">Back to usual</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
