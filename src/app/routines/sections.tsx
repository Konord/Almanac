import Link from "next/link";
import { Button, Field, Input, Select } from "@/components/ui";
import { MEMBER_COLOUR_CLASS } from "@/lib/colours";
import type { Household } from "@/lib/household";
import { KIND_LABEL, KIND_ORDER, hhmm } from "@/lib/routines";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import {
  addAssignment,
  moveStep,
  removeAssignment,
  removeRoutine,
  removeStep,
  setAssignmentActive,
  updateRoutine,
  addStep,
  updateStep,
} from "./actions";
import type { RoutineData, RoutineStep, RoutineTemplate } from "./data";

/* Pieces shared by the routines checklist and the "Set up routines" page. */

// ---------------------------------------------------------------------------
// Who does what
// ---------------------------------------------------------------------------

export function Assignments({
  data,
  household,
  date,
  returnTo,
}: {
  data: RoutineData;
  household: Household;
  date: LocalDate;
  returnTo: string;
}) {
  const templateById = new Map(data.templates.map((t) => [t.id, t]));
  const days = weekdayNames(household);

  return (
    <div className="rounded-[var(--radius)] border-2 border-frame bg-panel/60 p-5">
      <div className="flex flex-col gap-4">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editing routines and steps
// ---------------------------------------------------------------------------

export function TemplateEditor({
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

export function RoutineFields({ template }: { template?: RoutineTemplate }) {
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

export function NavButton({ href, children, label }: { href: string; children: React.ReactNode; label?: string }) {
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
export function clock(time: string, household: Household): string {
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

