import { Suspense } from "react";
import Link from "next/link";
import { Button, Field, Input, Notice, Panel, Select, firstParam } from "@/components/ui";
import { MEMBER_COLOUR_CLASS } from "@/lib/colours";
import { requireHousehold, type Household } from "@/lib/household";
import { KIND_LABEL, KIND_ORDER, hhmm, isLate } from "@/lib/routines";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import {
  addAssignment,
  addRoutine,
  addStep,
  moveStep,
  removeAssignment,
  removeRoutine,
  removeStep,
  setAssignmentActive,
  toggleStep,
  updateRoutine,
  updateStep,
} from "./actions";
import { ProgressBar } from "./progress-bar";
import { dayRoutinesFor, loadRoutines, type DayRoutine, type RoutineMember, type RoutineStep, type RoutineTemplate } from "./data";

/**
 * Routines: checklists for each person (morning, after school, bedtime).
 * The top of the page is the checklist itself; below are the settings for
 * who does which routine on which days, and the routines' steps.
 */
export default function RoutinesPage(props: PageProps<"/routines">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Routines searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Routines({ searchParams }: { searchParams: PageProps<"/routines">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { timeZone, locale } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);
  const dateParam = firstParam(params.date);
  const date = dateParam && isLocalDate(dateParam) ? dateParam : today;
  const data = await loadRoutines(date);
  const memberParam = firstParam(params.member);
  const member = data.members.find((m) => m.id === memberParam) ?? null;
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  const here = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | null> = { member: member?.id ?? null, date: date === today ? null : date, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/routines?${query}` : "/routines";
  };
  const returnTo = here({});
  const dayTitle = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric" }).format(
    zonedToUtc(date, "12:00", timeZone),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-marker-blue pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <NavButton href="/">Home</NavButton>
          <NavButton href={here({ date: addDays(date, -1) })} label="Previous day">
            ‹
          </NavButton>
          <NavButton href={here({ date: null })}>Today</NavButton>
          <NavButton href={here({ date: addDays(date, 1) })} label="Next day">
            ›
          </NavButton>
          <h1 className="w-full text-3xl font-semibold tracking-tight text-ink sm:ml-2 sm:w-auto">Routines · {dayTitle}</h1>
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {data.members.length === 0 ? (
        <Notice tone="error">
          Add the people in your household first, on{" "}
          <Link href="/household" className="underline">
            Household &amp; people
          </Link>
          .
        </Notice>
      ) : null}

      {/* Whose checklist */}
      <div className="flex flex-wrap gap-2" aria-label="Whose routines">
        {data.members.map((m) => {
          const routines = dayRoutinesFor(data, m.id, date);
          const done = routines.reduce((n, r) => n + r.progress.done, 0);
          const total = routines.reduce((n, r) => n + r.progress.total, 0);
          const active = member?.id === m.id;
          return (
            <Link
              key={m.id}
              href={here({ member: active ? null : m.id })}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[var(--touch-target)] items-center gap-3 rounded-full border-2 px-4 text-lg ${
                active ? "border-marker-blue bg-marker-blue text-board" : "border-frame bg-board text-ink"
              }`}
            >
              <span className={`size-4 rounded-full ring-2 ring-board ${MEMBER_COLOUR_CLASS[m.colour] ?? "bg-marker-black"}`} />
              {m.name}
              <span className={active ? "text-board/80" : "text-ink-muted"}>{total ? `${done}/${total}` : "none"}</span>
            </Link>
          );
        })}
      </div>

      {member ? (
        <Checklist
          member={member}
          routines={dayRoutinesFor(data, member.id, date)}
          date={date}
          isToday={date === today}
          now={localTimeOf(now, timeZone)}
          household={household}
          returnTo={returnTo}
        />
      ) : data.members.length > 0 ? (
        <p className="text-lg text-ink-muted">Tap someone to open their checklist.</p>
      ) : null}

      <Assignments data={data} household={household} date={date} returnTo={returnTo} />

      <details className="rounded-[var(--radius)] border-2 border-frame bg-panel/60 p-5">
        <summary className="cursor-pointer text-xl font-semibold text-ink">Edit routines and steps</summary>
        <p className="mt-3 mb-4 text-base text-ink-muted">
          The ready-made routines are a starting point. Change the steps to suit your family. Essential steps are the
          ones kept on low-energy days.
        </p>
        <div className="flex flex-col gap-4">
          {data.templates.map((t) => (
            <TemplateEditor
              key={t.id}
              template={t}
              steps={data.steps.filter((s) => s.template_id === t.id)}
              returnTo={returnTo}
              household={household}
            />
          ))}
        </div>
        <h3 className="mt-6 mb-3 text-xl font-semibold text-ink">Make a new routine</h3>
        <form action={addRoutine} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          <RoutineFields />
          <div className="sm:col-span-2">
            <Button>Make routine</Button>
          </div>
        </form>
      </details>
    </>
  );
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

function Checklist({
  member,
  routines,
  date,
  isToday,
  now,
  household,
  returnTo,
}: {
  member: RoutineMember;
  routines: DayRoutine[];
  date: LocalDate;
  isToday: boolean;
  now: string;
  household: Household;
  returnTo: string;
}) {
  if (routines.length === 0) {
    return (
      <Panel>
        <p className="text-lg text-ink-muted">{member.name} has no routines on this day. Give them one below.</p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {routines.map(({ template, steps, progress, doneIds }) => (
        <section key={template.id} className="rounded-[var(--radius)] border-2 border-frame bg-board p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold text-ink">
              {template.name}
              {progress.complete ? " ✓" : ""}
            </h2>
            <span className="text-lg text-ink-muted">
              {progress.done} of {progress.total}
            </span>
          </div>
          <ProgressBar done={progress.done} total={progress.total} />
          <ul className="mt-3 flex flex-col">
            {steps.map((step) => {
              const done = doneIds.has(step.id);
              return (
                <StepRow
                  key={step.id}
                  step={step}
                  done={done}
                  late={isToday && !done && isLate(step, now)}
                  memberId={member.id}
                  templateId={template.id}
                  date={date}
                  household={household}
                  returnTo={returnTo}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StepRow({
  step,
  done,
  late,
  memberId,
  templateId,
  date,
  household,
  returnTo,
}: {
  step: RoutineStep;
  done: boolean;
  late: boolean;
  memberId: string;
  templateId: string;
  date: LocalDate;
  household: Household;
  returnTo: string;
}) {
  return (
    <li className="border-t border-frame/70 first:border-t-0">
      <form action={toggleStep}>
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-pressed={done}
          className="flex min-h-16 w-full items-center gap-4 py-2 text-left"
          title={done ? "Tap to untick" : "Tap when done"}
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-xl ${
              done ? "border-marker-green bg-marker-green text-board" : "border-frame bg-board"
            }`}
            aria-hidden
          >
            {done ? "✓" : ""}
          </span>
          <span className="w-10 shrink-0 text-center text-3xl" aria-hidden>
            {step.icon}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`text-xl ${done ? "text-ink-muted line-through" : "font-semibold text-ink"}`}>{step.text}</span>
            {step.target_time ? (
              <span className={`text-base ${late ? "font-semibold text-marker-red" : "text-ink-muted"}`}>
                by {clock(step.target_time, household)}
                {late ? " · running late" : ""}
              </span>
            ) : null}
          </span>
          {step.essential ? <span className="text-sm text-ink-muted">essential</span> : null}
        </button>
      </form>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Who does what
// ---------------------------------------------------------------------------

function Assignments({
  data,
  household,
  date,
  returnTo,
}: {
  data: Awaited<ReturnType<typeof loadRoutines>>;
  household: Household;
  date: LocalDate;
  returnTo: string;
}) {
  const templateById = new Map(data.templates.map((t) => [t.id, t]));
  const days = weekdayNames(household);

  return (
    <details className="rounded-[var(--radius)] border-2 border-frame bg-panel/60 p-5">
      <summary className="cursor-pointer text-xl font-semibold text-ink">Who does which routine, when</summary>
      <div className="mt-4 flex flex-col gap-4">
        {data.members.map((m) => {
          const mine = data.assignments.filter((a) => a.member_id === m.id);
          return (
            <div key={m.id} className="rounded-[var(--radius)] border-2 border-frame bg-board p-4">
              <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-ink">
                <span className={`size-4 rounded-full ${MEMBER_COLOUR_CLASS[m.colour] ?? "bg-marker-black"}`} />
                {m.name}
              </h3>
              {mine.length === 0 ? (
                <p className="text-base text-ink-muted">No routines yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3">
                      <span className={`text-base ${a.active ? "text-ink" : "text-ink-muted line-through"}`}>
                        <strong>{templateById.get(a.template_id)?.name ?? "?"}</strong> ·{" "}
                        {a.on_date ? `just on ${a.on_date}` : describeWeekdays(a.weekdays ?? [], days)}
                      </span>
                      <form action={setAssignmentActive}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="active" value={String(!a.active)} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Button variant="secondary" className="min-h-10 px-3 text-base">
                          {a.active ? "Pause" : "Resume"}
                        </Button>
                      </form>
                      <form action={removeAssignment}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Button variant="danger" className="min-h-10 px-3 text-base">
                          Remove
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 mb-1 text-xl font-semibold text-ink">Give someone a routine</h3>
      <p className="mb-4 text-base text-ink-muted">
        Pick days of the week, or one date to swap a routine in for just that day (it replaces their usual routine of the
        same kind, e.g. a weekend morning on a snow day).
      </p>
      <form action={addAssignment} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field label="Routine">
          <Select name="templateId" required>
            {KIND_ORDER.map((kind) => (
              <optgroup key={kind} label={KIND_LABEL[kind]}>
                {data.templates
                  .filter((t) => t.kind === kind)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-base font-medium text-ink">Who</legend>
          <div className="flex flex-wrap gap-2">
            {data.members.map((m) => (
              <CheckChip key={m.id} name="memberIds" value={m.id} label={m.name} />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-base font-medium text-ink">When</legend>
          <label className="flex items-center gap-3 text-lg text-ink">
            <input type="radio" name="when" value="weekdays" defaultChecked className="size-5 accent-marker-blue" />
            Every week on
          </label>
          <div className="flex flex-wrap gap-2 pl-8">
            {days.map(({ value, label }) => (
              <CheckChip key={value} name="weekdays" value={String(value)} label={label} />
            ))}
          </div>
          <label className="mt-2 flex flex-wrap items-center gap-3 text-lg text-ink">
            <input type="radio" name="when" value="date" className="size-5 accent-marker-blue" />
            Just on
            <Input name="onDate" type="date" defaultValue={date} />
          </label>
        </fieldset>
        <div className="sm:col-span-2">
          <Button>Give routine</Button>
        </div>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Editing routines and steps
// ---------------------------------------------------------------------------

function TemplateEditor({
  template,
  steps,
  returnTo,
  household,
}: {
  template: RoutineTemplate;
  steps: RoutineStep[];
  returnTo: string;
  household: Household;
}) {
  return (
    <details className="rounded-[var(--radius)] border-2 border-frame bg-board p-4">
      <summary className="cursor-pointer text-lg text-ink">
        <span className="font-semibold">{template.name}</span>{" "}
        <span className="text-ink-muted">
          · {KIND_LABEL[template.kind]} · {audienceLabel(template.audience)} · {steps.length} steps
        </span>
      </summary>
      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.id} className="rounded-[var(--radius)] border border-frame p-3">
            <form action={updateStep} className="grid items-end gap-3 sm:grid-cols-[5rem_1fr_9rem_auto_auto]">
              <input type="hidden" name="id" value={step.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <StepFields step={step} />
              <Button variant="secondary">Save</Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-2">
              <form action={moveStep}>
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="direction" value="up" />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="secondary" className="min-h-10 px-3 text-base" disabled={i === 0} aria-label={`Move ${step.text} up`}>
                  ↑
                </Button>
              </form>
              <form action={moveStep}>
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="direction" value="down" />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button
                  variant="secondary"
                  className="min-h-10 px-3 text-base"
                  disabled={i === steps.length - 1}
                  aria-label={`Move ${step.text} down`}
                >
                  ↓
                </Button>
              </form>
              <form action={removeStep}>
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="danger" className="min-h-10 px-3 text-base">
                  Remove step
                </Button>
              </form>
              {step.target_time ? (
                <span className="self-center text-sm text-ink-muted">by {clock(step.target_time, household)}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <h4 className="mt-5 mb-2 text-lg font-semibold text-ink">Add a step</h4>
      <form action={addStep} className="grid items-end gap-3 sm:grid-cols-[5rem_1fr_9rem_auto_auto]">
        <input type="hidden" name="templateId" value={template.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <StepFields />
        <Button>Add step</Button>
      </form>

      <h4 className="mt-6 mb-2 text-lg font-semibold text-ink">Routine details</h4>
      <form action={updateRoutine} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <RoutineFields template={template} />
        <div className="sm:col-span-2">
          <Button variant="secondary">Save details</Button>
        </div>
      </form>
      <form action={removeRoutine} className="mt-4">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="name" value={template.name} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button variant="danger">Remove {template.name}</Button>
      </form>
    </details>
  );
}

function StepFields({ step }: { step?: RoutineStep }) {
  return (
    <>
      <Field label="Picture">
        <Input name="icon" defaultValue={step?.icon ?? ""} maxLength={16} placeholder="🪥" />
      </Field>
      <Field label="Step">
        <Input name="text" defaultValue={step?.text} required maxLength={80} />
      </Field>
      <Field label="Done by">
        <Input name="targetTime" type="time" defaultValue={step?.target_time ? hhmm(step.target_time) : ""} />
      </Field>
      <label className="flex min-h-[var(--touch-target)] items-center gap-2 text-base text-ink">
        <input type="checkbox" name="essential" defaultChecked={step?.essential} className="size-5 accent-marker-blue" />
        Essential
      </label>
    </>
  );
}

function RoutineFields({ template }: { template?: RoutineTemplate }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" defaultValue={template?.name} required maxLength={60} placeholder="e.g. Swim night" />
      </Field>
      <Field label="When">
        <Select name="kind" defaultValue={template?.kind ?? "morning"}>
          {KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Written for">
        <Select name="audience" defaultValue={template?.audience ?? "everyone"}>
          <option value="everyone">Anyone</option>
          <option value="kid">Kids (big pictures)</option>
          <option value="adult">Adults</option>
        </Select>
      </Field>
      <Field label="Who can see it">
        <Select name="visibility" defaultValue={template?.visibility ?? "everyone"}>
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function CheckChip({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-base text-ink">
      <input type="checkbox" name={name} value={value} className="size-5 accent-marker-blue" />
      {label}
    </label>
  );
}

function NavButton({ href, children, label }: { href: string; children: React.ReactNode; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink"
    >
      {children}
    </Link>
  );
}

/** "07:45:00" → "7:45 a.m." in the household's locale. */
function clock(time: string, household: Household): string {
  const { locale, timeZone } = household.settings;
  const instant = zonedToUtc("2026-01-15", hhmm(time), timeZone);
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(instant).replace(":00", "");
}

/** Weekdays in the household's order (Sunday or Monday first). */
function weekdayNames(household: Household): { value: number; label: string }[] {
  const { locale, weekStartsOn } = household.settings;
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2026-11-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const value = (weekStartsOn + i) % 7;
    return { value, label: fmt.format(new Date(Date.UTC(2026, 10, 1 + value))) };
  });
}

function describeWeekdays(weekdays: number[], names: { value: number; label: string }[]): string {
  const set = new Set(weekdays);
  if (set.size === 7) return "every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "weekends";
  return names
    .filter((n) => set.has(n.value))
    .map((n) => n.label)
    .join(", ");
}

function audienceLabel(audience: string): string {
  return audience === "kid" ? "for kids" : audience === "adult" ? "for adults" : "for anyone";
}
