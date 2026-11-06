import { Suspense } from "react";
import Link from "next/link";
import { Alarm, ArrowLeft, CalendarCheck, SunHorizon } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Emoji, Notice, ScreenHeader, Segmented, SoftLink, firstParam } from "@/components/ui";
import { weekPlanFor } from "@/lib/day-types";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { addRoutine } from "../actions";
import { loadRoutines } from "../data";
import { DayTypeForm, RoutineDetails, RoutineFields, StepsEditor, WeekEditor, anchorSummary } from "../sections";

/**
 * The routine planner. Two tabs, neither of which scrolls:
 * - Days: each person's kinds of day (wake-up, bedtime, routines) and their week.
 * - Routines: the routines themselves, their steps and what they follow.
 */
export default function ManageRoutinesPage(props: PageProps<"/routines/manage">) {
  return (
    <AppFrame section="routines">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Manage searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

const TYPES_PER_PAGE = 2;
const ROUTINES_PER_PAGE = 7;
const STEPS_PER_PAGE = 6;

async function Manage({ searchParams }: { searchParams: PageProps<"/routines/manage">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const [data, mealTimesResult] = await Promise.all([
    loadRoutines(today),
    supabase.from("meal_times").select("id, name").order("sort_order").order("name"),
  ]);
  const mealTimes = mealTimesResult.data ?? [];
  const tab = firstParam(params.tab) === "routines" ? "routines" : "days";
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  const state: Record<string, string | undefined> = {
    tab,
    member: firstParam(params.member),
    plan: firstParam(params.plan),
    types: firstParam(params.types),
    routine: firstParam(params.routine),
    list: firstParam(params.list),
    part: firstParam(params.part),
    steps: firstParam(params.steps),
    newType: firstParam(params.newType),
  };
  const href = (changes: Record<string, string | undefined | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...state, ...changes })) if (value) next.set(key, value);
    return `/routines/manage?${next.toString()}`;
  };
  const returnTo = href({});

  return (
    <>
      <ScreenHeader title="Set up routines">
        <Segmented
          label="What to set up"
          options={[
            { href: href({ tab: "days" }), label: "Days", active: tab === "days" },
            { href: href({ tab: "routines" }), label: "Routines", active: tab === "routines" },
          ]}
        />
        <SoftLink href="/routines" className="lg:ml-auto">
          <ArrowLeft size="1.5rem" aria-hidden />
          Back to checklists
        </SoftLink>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {tab === "days" ? (
        <DaysTab data={data} state={state} href={href} returnTo={returnTo} today={today} household={household} />
      ) : (
        <RoutinesTab data={data} state={state} href={href} returnTo={returnTo} household={household} mealTimes={mealTimes} />
      )}
    </>
  );
}

type TabProps = {
  data: Awaited<ReturnType<typeof loadRoutines>>;
  state: Record<string, string | undefined>;
  href: (changes: Record<string, string | undefined | null>) => string;
  returnTo: string;
  household: Awaited<ReturnType<typeof requireHousehold>>;
};

function DaysTab({ data, state, href, returnTo, today, household }: TabProps & { today: string }) {
  const member = data.members.find((m) => m.id === state.member) ?? data.members[0];
  if (!member) {
    return (
      <Notice tone="error">
        Add the people in your household first, on{" "}
        <Link href="/household" className="font-bold underline">
          Household &amp; people
        </Link>
        .
      </Notice>
    );
  }
  const plans = data.weekPlans.filter((p) => p.member_id === member.id);
  const plan = plans.find((p) => p.id === state.plan) ?? weekPlanFor(member, data.weekPlans, today) ?? plans[0];
  const types = data.dayTypes.filter((t) => t.member_id === member.id);
  const page = Math.max(0, Number(state.types ?? 0) || 0);
  const pages = Math.max(1, Math.ceil(types.length / TYPES_PER_PAGE));
  const shown = types.slice(page * TYPES_PER_PAGE, page * TYPES_PER_PAGE + TYPES_PER_PAGE);
  const adding = state.newType === "1";
  const chosenFor = (dayTypeId: string) => new Set(data.assignments.filter((a) => a.day_type_id === dayTypeId).map((a) => a.template_id));

  return (
    <>
      <nav aria-label="Whose days" className="flex shrink-0 flex-wrap gap-2">
        {data.members.map((m) => (
          <Link
            key={m.id}
            href={href({ member: m.id, plan: null, types: null, newType: null })}
            aria-current={m.id === member.id ? "page" : undefined}
            className={`flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-2xl px-3 text-lg font-bold text-ink ${m.id === member.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-frame)]" : ""}`}
          >
            <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" />
            {m.name}
          </Link>
        ))}
      </nav>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card title={`${member.name}'s week`} icon={CalendarCheck} tint={member.colour}>
          {plan ? (
            <WeekEditor
              member={member}
              data={data}
              plan={plan}
              household={household}
              today={today}
              returnTo={returnTo}
              planHref={(id) => href({ plan: id })}
            />
          ) : null}
        </Card>
        <Card
          title="Kinds of day"
          icon={SunHorizon}
          tint={member.colour}
          aside={
            adding ? null : (
              <Link href={href({ newType: "1" })} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-base font-bold text-ink">
                + Kind of day
              </Link>
            )
          }
        >
          <p className="mb-2 text-base text-ink-muted">
            Each kind of day has its own wake-up, bedtime and routines. Morning routines follow wake-up; bedtime routines end by bedtime.
          </p>
          <div className="flex flex-col gap-3">
            {adding ? (
              <>
                <DayTypeForm member={member} templates={data.templates} chosen={new Set()} canRemove={false} returnTo={href({ newType: null })} />
                <Link href={href({ newType: null })} className="text-base font-bold text-accent">
                  Cancel
                </Link>
              </>
            ) : (
              shown.map((t) => (
                <DayTypeForm key={t.id} dayType={t} member={member} templates={data.templates} chosen={chosenFor(t.id)} canRemove={types.length > 1} returnTo={returnTo} />
              ))
            )}
          </div>
          {!adding && pages > 1 ? (
            <div className="mt-auto flex items-center gap-3 pt-3 text-base font-bold">
              {page > 0 ? (
                <Link href={href({ types: String(page - 1) })} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-ink">
                  ‹ Back
                </Link>
              ) : null}
              <span className="text-ink-muted">
                {page * TYPES_PER_PAGE + 1}–{Math.min(types.length, (page + 1) * TYPES_PER_PAGE)} of {types.length}
              </span>
              {page < pages - 1 ? (
                <Link href={href({ types: String(page + 1) })} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-ink">
                  More ›
                </Link>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function RoutinesTab({ data, state, href, returnTo, household, mealTimes }: TabProps & { mealTimes: { id: string; name: string }[] }) {
  const listPage = Math.max(0, Number(state.list ?? 0) || 0);
  const listPages = Math.max(1, Math.ceil((data.templates.length + 1) / ROUTINES_PER_PAGE));
  const listed = data.templates.slice(listPage * ROUTINES_PER_PAGE, listPage * ROUTINES_PER_PAGE + ROUTINES_PER_PAGE);
  const creating = state.routine === "new";
  const routine = creating ? null : (data.templates.find((t) => t.id === state.routine) ?? data.templates[0] ?? null);
  const steps = routine ? data.steps.filter((s) => s.template_id === routine.id) : [];
  const part = state.part === "details" ? "details" : "steps";
  const stepPage = Math.max(0, Math.min(Number(state.steps ?? 0) || 0, Math.max(0, Math.ceil(steps.length / STEPS_PER_PAGE) - 1)));

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
      <Card title="Routines" icon={Alarm} tint="teal">
        <ul className="mt-1 flex flex-col gap-1.5">
          {listed.map((t) => {
            const first = data.steps.find((s) => s.template_id === t.id);
            return (
              <li key={t.id}>
                <Link
                  href={href({ routine: t.id, part: null, steps: null })}
                  aria-current={routine?.id === t.id ? "page" : undefined}
                  className={`flex min-h-15 items-center gap-3 rounded-2xl px-3 ${routine?.id === t.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-frame)]" : ""}`}
                >
                  <Emoji emoji={first?.icon ?? "✅"} className="size-9" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-lg leading-tight font-bold text-ink">{t.name}</span>
                    <span className="truncate text-sm font-semibold text-ink-muted">{anchorSummary(t, mealTimes, household)}{t.loose ? " · loose" : ""}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <Link href={href({ routine: "new" })} className="flex min-h-11 items-center rounded-xl bg-ink px-3.5 text-base font-bold text-board">
            + New routine
          </Link>
          {listPages > 1 ? (
            <>
              {listPage > 0 ? (
                <Link href={href({ list: String(listPage - 1) })} className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-base font-bold text-ink">
                  ‹
                </Link>
              ) : null}
              {listPage < listPages - 1 ? (
                <Link href={href({ list: String(listPage + 1) })} className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-base font-bold text-ink">
                  More ›
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>

      {creating ? (
        <Card title="New routine" icon={Alarm} tint="teal">
          <form action={addRoutine} className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
            <input type="hidden" name="returnTo" value={href({ routine: null })} />
            <RoutineFields mealTimes={mealTimes} />
            <div className="col-span-full">
              <Button>Make routine</Button>
            </div>
          </form>
        </Card>
      ) : routine ? (
        <Card
          title={routine.name}
          icon={Alarm}
          tint="teal"
          aside={
            <Segmented
              label="Steps or details"
              options={[
                { href: href({ part: "steps" }), label: `Steps (${steps.length})`, active: part === "steps" },
                { href: href({ part: "details" }), label: "Details", active: part === "details" },
              ]}
            />
          }
        >
          <div className="mt-2">
            {part === "steps" ? (
              <StepsEditor
                template={routine}
                steps={steps}
                page={stepPage}
                perPage={STEPS_PER_PAGE}
                returnTo={returnTo}
                pageHref={(p) => href({ steps: String(p) })}
              />
            ) : (
              <RoutineDetails template={routine} mealTimes={mealTimes} returnTo={returnTo} />
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
