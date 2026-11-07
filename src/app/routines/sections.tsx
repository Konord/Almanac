import Link from "next/link";
import { ArrowDown, ArrowUp, ChartLineUp, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button, Emoji, Field, Input, Select } from "@/components/ui";
import type { DayType, WeekPlan } from "@/lib/day-types";
import type { Household } from "@/lib/household";
import { KIND_LABEL, KIND_ORDER, hhmm } from "@/lib/routines";
import { zonedToUtc } from "@/lib/time";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import {
  addStep,
  addWeekPlan,
  chooseWeekPlan,
  moveStep,
  removeDayType,
  removeRoutine,
  removeStep,
  removeWeekPlan,
  saveDayType,
  saveWeekPlan,
  setRoutineHabit,
  setStepHabit,
  updateRoutine,
  updateStep,
} from "./actions";
import type { RoutineData, RoutineMember, RoutineStep, RoutineTemplate } from "./data";

/* Pieces for the "Set up routines" page. Nothing here scrolls: long lists page. */

// ---------------------------------------------------------------------------
// Days: kinds of day and the week
// ---------------------------------------------------------------------------

/** Small tappable chips (radio or checkbox) for tight spaces. */
export function MiniChips({
  name,
  options,
  chosen,
  multiple = false,
  label,
}: {
  name: string;
  options: { value: string; label: string; icon?: string | null }[];
  chosen: ReadonlySet<string>;
  multiple?: boolean;
  label: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-wrap gap-1.5">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-2 border-frame bg-board px-3 text-base text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-accent"
        >
          <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={chosen.has(o.value)} className="sr-only" required={!multiple} />
          {o.icon ? <Emoji emoji={o.icon} className="size-6" /> : null}
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

/** One person's week: which kind of day each weekday is, and their week plans. */
export function WeekEditor({
  member,
  data,
  plan,
  household,
  today,
  returnTo,
  planHref,
}: {
  member: RoutineMember;
  data: RoutineData;
  plan: WeekPlan;
  household: Household;
  today: string;
  returnTo: string;
  planHref: (planId: string) => string;
}) {
  const plans = data.weekPlans.filter((p) => p.member_id === member.id);
  const types = data.dayTypes.filter((t) => t.member_id === member.id);
  const days = weekdayNames(household, "long");
  const isCurrent = !member.week_plans_rotate && (member.current_week_plan_id === plan.id || (!member.current_week_plan_id && plans[0]?.id === plan.id));
  const status = member.week_plans_rotate ? "The weeks take turns" : isCurrent ? "This is the week in use" : "Not in use";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {plans.length > 1
          ? plans.map((p) => (
              <Link
                key={p.id}
                href={planHref(p.id)}
                aria-current={p.id === plan.id ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-xl px-3.5 text-base font-bold ${p.id === plan.id ? "bg-ink text-board" : "bg-rail text-ink"}`}
              >
                {p.name}
              </Link>
            ))
          : null}
        <span className="text-base font-semibold text-ink-muted">{status}</span>
      </div>
      <form action={saveWeekPlan} className="flex min-h-0 flex-1 flex-col gap-2">
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-base font-bold text-ink">Name</span>
          <Input name="name" defaultValue={plan.name} maxLength={30} className="min-h-11 flex-1 text-base" />
        </div>
        {days.map(({ value, label }) => {
          const chosen = data.weekPlanDays.find((d) => d.week_plan_id === plan.id && d.weekday === value)?.day_type_id;
          return (
            <div key={value} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-base font-bold text-ink">{label}</span>
              <MiniChips
                name={`day${value}`}
                label={`${label} is a`}
                options={types.map((t) => ({ value: t.id, label: t.name, icon: t.icon }))}
                chosen={new Set(chosen ? [chosen] : [])}
              />
            </div>
          );
        })}
        <div>
          <Button className="min-h-11">Save the week</Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-t border-frame pt-3">
        {!isCurrent || member.week_plans_rotate ? (
          <form action={chooseWeekPlan}>
            <WeekPlanHidden member={member} plan={plan} returnTo={returnTo} today={today} />
            <Button variant="secondary" className="min-h-11 text-base">Use this week</Button>
          </form>
        ) : null}
        {plans.length > 1 && !member.week_plans_rotate ? (
          <form action={chooseWeekPlan}>
            <WeekPlanHidden member={member} plan={plan} returnTo={returnTo} today={today} />
            <input type="hidden" name="rotate" value="true" />
            <Button variant="secondary" className="min-h-11 text-base" title="This week uses the one shown; the others follow in turn.">
              Take turns each week
            </Button>
          </form>
        ) : null}
        {plans.length > 1 ? (
          <form action={removeWeekPlan}>
            <input type="hidden" name="id" value={plan.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button variant="danger" className="min-h-11 text-base">Remove</Button>
          </form>
        ) : null}
        <form action={addWeekPlan} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="memberId" value={member.id} />
          <input type="hidden" name="copyFrom" value={plan.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Input name="name" placeholder="e.g. Night shift week" maxLength={30} required className="min-h-11 w-56 text-base" />
          <Button variant="secondary" className="min-h-11 text-base">+ Week</Button>
        </form>
      </div>
    </div>
  );
}

function WeekPlanHidden({ member, plan, returnTo, today }: { member: RoutineMember; plan: WeekPlan; returnTo: string; today: string }) {
  return (
    <>
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="planId" value={plan.id} />
      <input type="hidden" name="today" value={today} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}

/** A kind of day: its name, wake-up and bedtime, and its routines. */
export function DayTypeForm({
  dayType,
  member,
  templates,
  chosen,
  canRemove,
  returnTo,
}: {
  dayType?: DayType;
  member: RoutineMember;
  templates: RoutineTemplate[];
  chosen: ReadonlySet<string>;
  canRemove: boolean;
  returnTo: string;
}) {
  const formId = `day-type-${dayType?.id ?? "new"}`;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-rail p-3">
      <form id={formId} action={saveDayType} className="grid grid-cols-[4.5rem_1fr_8.5rem_8.5rem] items-end gap-2">
        <input type="hidden" name="id" value={dayType?.id ?? ""} />
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field label="Picture">
          <Input name="icon" defaultValue={dayType?.icon ?? ""} maxLength={16} placeholder="🏫" className="min-h-11 px-2 text-base" />
        </Field>
        <Field label="Kind of day">
          <Input name="name" defaultValue={dayType?.name} required maxLength={30} placeholder="e.g. Night shift" className="min-h-11 text-base" />
        </Field>
        <Field label="Wake-up">
          <Input name="wake" type="time" defaultValue={hhmm(dayType?.wake_time ?? "07:00")} required className="min-h-11 px-2 text-base" />
        </Field>
        <Field label="Bedtime">
          <Input name="bed" type="time" defaultValue={hhmm(dayType?.bed_time ?? "21:30")} required className="min-h-11 px-2 text-base" />
        </Field>
      </form>
      <div className="flex items-start gap-2">
        <span className="mt-2.5 shrink-0 text-base font-bold text-ink">Routines</span>
        <div className="min-w-0 flex-1">
          {/* The chips belong to the form above (form= attribute), so one Save covers everything. */}
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Routines on this kind of day</legend>
            {templates.map((t) => (
              <label
                key={t.id}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-2 border-frame bg-board px-3 text-base text-ink select-none has-checked:border-ink has-checked:bg-board has-checked:font-bold"
              >
                <input type="checkbox" form={formId} name="templateIds" value={t.id} defaultChecked={chosen.has(t.id)} className="size-4 accent-accent" />
                {t.name}
              </label>
            ))}
          </fieldset>
        </div>
      </div>
      <div className="flex gap-2">
        <Button form={formId} className="min-h-11 text-base">
          {dayType ? "Save" : "Add this kind of day"}
        </Button>
        {dayType && canRemove ? (
          <form action={removeDayType}>
            <input type="hidden" name="id" value={dayType.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button variant="danger" className="min-h-11 text-base">
              Remove
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editing routines and steps
// ---------------------------------------------------------------------------

/** A routine's steps, a page at a time, each on one line. */
export function StepsEditor({
  template,
  steps,
  page,
  perPage,
  returnTo,
  pageHref,
}: {
  template: RoutineTemplate;
  steps: RoutineStep[];
  page: number;
  perPage: number;
  returnTo: string;
  pageHref: (page: number) => string;
}) {
  const shown = steps.slice(page * perPage, page * perPage + perPage);
  const pages = Math.max(1, Math.ceil(steps.length / perPage));
  return (
    <div className="flex flex-col gap-2">
      {template.habit_since ? (
        <p className="flex items-center gap-2 px-2 text-sm font-bold text-success">
          <ChartLineUp size="1.1rem" weight="bold" aria-hidden />
          Green steps are tracked on the habit chart. Tap one to leave it out.
        </p>
      ) : null}
      <div className="grid grid-cols-[4.5rem_1fr_8.5rem_auto] gap-2 px-2 text-sm font-bold text-ink-muted">
        <span>Picture</span>
        <span>Step</span>
        <span>Done by</span>
        <span />
      </div>
      {shown.map((step, i) => {
        const index = page * perPage + i;
        return (
          <div key={step.id} className="flex items-center gap-2 rounded-2xl bg-rail p-2">
            <form action={updateStep} className="grid min-w-0 flex-1 grid-cols-[4.5rem_1fr_8.5rem_auto] items-center gap-2">
              <input type="hidden" name="id" value={step.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <StepFields step={step} />
              <Button variant="secondary" className="min-h-11 bg-board px-3 text-base">
                Save
              </Button>
            </form>
            {template.habit_since ? <StepHabitButton step={step} returnTo={returnTo} /> : null}
            <StepButton action={moveStep} id={step.id} returnTo={returnTo} direction="up" disabled={index === 0} label={`Move ${step.text} up`}>
              <ArrowUp size="1.25rem" weight="bold" aria-hidden />
            </StepButton>
            <StepButton action={moveStep} id={step.id} returnTo={returnTo} direction="down" disabled={index === steps.length - 1} label={`Move ${step.text} down`}>
              <ArrowDown size="1.25rem" weight="bold" aria-hidden />
            </StepButton>
            <StepButton action={removeStep} id={step.id} returnTo={returnTo} label={`Remove ${step.text}`} danger>
              <Trash size="1.25rem" weight="bold" aria-hidden />
            </StepButton>
          </div>
        );
      })}
      <form action={addStep} className="grid grid-cols-[4.5rem_1fr_8.5rem_auto] items-center gap-2 rounded-2xl border-2 border-dashed border-frame p-2">
        <input type="hidden" name="templateId" value={template.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <StepFields />
        <Button className="min-h-11 px-3 text-base">Add step</Button>
      </form>
      {pages > 1 ? (
        <div className="flex items-center gap-3 text-base font-bold">
          {page > 0 ? (
            <Link href={pageHref(page - 1)} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-ink">
              ‹ Earlier steps
            </Link>
          ) : null}
          <span className="text-ink-muted">
            Steps {page * perPage + 1}–{Math.min(steps.length, page * perPage + perPage)} of {steps.length}
          </span>
          {page < pages - 1 ? (
            <Link href={pageHref(page + 1)} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-ink">
              More steps ›
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepButton({
  action,
  id,
  returnTo,
  direction,
  disabled,
  label,
  danger,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  returnTo: string;
  direction?: "up" | "down";
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {direction ? <input type="hidden" name="direction" value={direction} /> : null}
      <button
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`flex size-11 items-center justify-center rounded-xl bg-board disabled:opacity-30 ${danger ? "text-danger" : "text-ink"}`}
      >
        {children}
      </button>
    </form>
  );
}

/** On a tracked routine: whether this step gets a row on the habit chart. */
function StepHabitButton({ step, returnTo }: { step: RoutineStep; returnTo: string }) {
  const label = step.habit ? `Stop tracking ${step.text}` : `Track ${step.text} as a habit`;
  return (
    <form action={setStepHabit}>
      <input type="hidden" name="id" value={step.id} />
      <input type="hidden" name="on" value={step.habit ? "0" : "1"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        aria-pressed={step.habit}
        aria-label={label}
        title={label}
        className={`flex size-11 items-center justify-center rounded-xl ${step.habit ? "bg-success text-white" : "bg-board text-ink-muted"}`}
      >
        <ChartLineUp size="1.25rem" weight="bold" aria-hidden />
      </button>
    </form>
  );
}

/** The routine's "Track as a habit" switch. Off by default. */
export function HabitSwitch({ template, returnTo }: { template: RoutineTemplate; returnTo: string }) {
  const on = Boolean(template.habit_since);
  return (
    <form action={setRoutineHabit}>
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        role="switch"
        aria-checked={on}
        className={`flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-2xl px-3.5 text-base font-bold ${on ? "bg-[color-mix(in_srgb,var(--color-success)_12%,white)] text-success" : "bg-rail text-ink"}`}
        title={on ? "Tap to stop tracking (ticks are kept)" : "Tap to track this routine as a habit"}
      >
        <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${on ? "justify-end bg-success" : "justify-start bg-check-border"}`} aria-hidden>
          <span className="size-5 rounded-full bg-white" />
        </span>
        Track as a habit
      </button>
    </form>
  );
}

function StepFields({ step }: { step?: RoutineStep }) {
  return (
    <>
      <Input name="icon" defaultValue={step?.icon ?? ""} maxLength={16} placeholder="🪥" aria-label="Picture" className="min-h-11 bg-board px-2 text-base" />
      <Input name="text" defaultValue={step?.text} required maxLength={80} placeholder="e.g. Brush teeth" aria-label="Step" className="min-h-11 bg-board text-base" />
      <Input
        name="targetTime"
        type="time"
        defaultValue={step?.target_time ? hhmm(step.target_time) : ""}
        aria-label="Done by"
        className="min-h-11 bg-board px-2 text-base"
      />
    </>
  );
}

/** The routine's details form, including what it follows (its anchor). */
export function RoutineDetails({ template, mealTimes, returnTo }: { template: RoutineTemplate; mealTimes: { id: string; name: string }[]; returnTo: string }) {
  return (
    <>
      <form action={updateRoutine} className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <RoutineFields template={template} mealTimes={mealTimes} />
        <div className="col-span-full flex gap-2">
          <Button>Save details</Button>
        </div>
      </form>
      <form action={removeRoutine} className="mt-3">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="name" value={template.name} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button variant="danger" className="min-h-11 text-base">
          Remove {template.name}
        </Button>
      </form>
    </>
  );
}

export const ANCHOR_LABEL = {
  wake: "After wake-up",
  bed: "Ends by bedtime",
  meal: "After a meal",
  clock: "At a set time",
} as const;

export function RoutineFields({ template, mealTimes }: { template?: RoutineTemplate; mealTimes: { id: string; name: string }[] }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" defaultValue={template?.name} required maxLength={60} placeholder="e.g. Swim night" />
      </Field>
      <Field label="Part of the day">
        <Select name="kind" defaultValue={template?.kind ?? "morning"}>
          {KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="It follows">
        <Select name="anchor" defaultValue={template?.anchor ?? "wake"}>
          {(Object.keys(ANCHOR_LABEL) as (keyof typeof ANCHOR_LABEL)[]).map((a) => (
            <option key={a} value={a}>
              {ANCHOR_LABEL[a]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Which meal" hint="For “After a meal”.">
        <Select name="anchorMealTimeId" defaultValue={template?.anchor_meal_time_id ?? ""}>
          <option value="">—</option>
          {mealTimes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Gap (minutes)" hint="After wake-up or the meal; before bed.">
        <Input name="anchorOffset" type="number" min={0} max={240} defaultValue={template?.anchor_offset ?? 0} />
      </Field>
      <Field label="Set time" hint="For “At a set time”. Empty: its step times.">
        <Input name="usualStart" type="time" defaultValue={template?.usual_start?.slice(0, 5) ?? ""} />
      </Field>
      <Field label="About how many minutes" hint="Empty: from its step times.">
        <Input name="usualMinutes" type="number" min={5} max={240} defaultValue={template?.usual_minutes ?? ""} />
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
      <label className="col-span-full flex min-h-11 items-center gap-3 text-lg text-ink">
        <input type="checkbox" name="loose" defaultChecked={template?.loose ?? false} className="size-6 accent-accent" />
        <span>
          <strong>Loose:</strong> it can move anywhere later in the day when plans get in the way (otherwise up to an hour).
        </span>
      </label>
    </>
  );
}

/** "After wake-up", "After Dinner, +10 min", "7:30". */
export function anchorSummary(template: RoutineTemplate, mealTimes: { id: string; name: string }[], household: Household): string {
  const gap = template.anchor_offset ? `, ${template.anchor === "bed" ? "" : "+"}${template.anchor_offset} min` : "";
  switch (template.anchor) {
    case "wake":
      return `After wake-up${gap}`;
    case "bed":
      return template.anchor_offset ? `Ends ${template.anchor_offset} min before bed` : "Ends by bedtime";
    case "meal":
      return `After ${mealTimes.find((m) => m.id === template.anchor_meal_time_id)?.name ?? "a meal"}${gap}`;
    case "clock":
      return template.usual_start ? `At ${clock(template.usual_start, household)}` : "At its step times";
  }
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** "07:45:00" → "7:45 a.m." in the household's locale. */
export function clock(time: string, household: Household): string {
  const { locale, timeZone } = household.settings;
  const instant = zonedToUtc("2026-01-15", hhmm(time), timeZone);
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(instant).replace(":00", "");
}

/** Weekdays in the household's order (Sunday or Monday first). */
export function weekdayNames(household: Household, style: "short" | "long" = "short"): { value: number; label: string }[] {
  const { locale, weekStartsOn } = household.settings;
  const fmt = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" });
  // 2026-11-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const value = (weekStartsOn + i) % 7;
    return { value, label: fmt.format(new Date(Date.UTC(2026, 10, 1 + value))) };
  });
}
