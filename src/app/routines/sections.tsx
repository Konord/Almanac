import Link from "next/link";
import { Button, Emoji, Field, Input } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import type { DayType, WeekPlan } from "@/lib/day-types";
import type { Household } from "@/lib/household";
import { hhmm } from "@/lib/routines";
import { zonedToUtc } from "@/lib/time";
import {
  addWeekPlan,
  chooseWeekPlan,
  removeDayType,
  removeWeekPlan,
  saveDayType,
  saveWeekPlan,
} from "./actions";
import type { RoutineData, RoutineMember, RoutineTemplate } from "./data";

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
          <EmojiPicker initial={dayType?.icon ?? ""} nameField="name" className="size-11! self-start!" fullScreen />
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
