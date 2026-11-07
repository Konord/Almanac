import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, SunHorizon } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Emoji, Notice, ScreenHeader, Segmented, SoftLink, firstParam } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { setDay, setOneDate } from "../actions";
import { weekPlanFor } from "@/lib/day-types";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { loadRoutines } from "../data";
import { DayTypeForm, WeekEditor } from "../sections";

/**
 * Set days: each person's kinds of day (wake-up, bedtime, routines) and
 * their week. Opened from the Routine Manager. Nothing scrolls.
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

async function Manage({ searchParams }: { searchParams: PageProps<"/routines/manage">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const [data, upcoming] = await Promise.all([
    loadRoutines(today),
    supabase.from("day_overrides").select("member_id, date, day_type_id, wake_time, bed_time").gte("date", today).order("date").limit(200),
  ]);
  if (upcoming.error) throw upcoming.error;
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  const state: Record<string, string | undefined> = {
    member: firstParam(params.member),
    plan: firstParam(params.plan),
    types: firstParam(params.types),
    newType: firstParam(params.newType),
    week: firstParam(params.week),
  };
  const href = (changes: Record<string, string | undefined | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...state, ...changes })) if (value) next.set(key, value);
    return `/routines/manage?${next.toString()}`;
  };
  const returnTo = href({});

  return (
    <>
      <ScreenHeader title="Set days">
        <p className="hidden text-lg text-ink-muted xl:block">Each person&rsquo;s kinds of day: wake-up, bedtime and routines.</p>
        <SoftLink href="/routines" className="lg:ml-auto">
          <ArrowLeft size="1.5rem" aria-hidden />
          Back to Routine Manager
        </SoftLink>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <DaysTab data={data} state={state} href={href} returnTo={returnTo} today={today} household={household} upcoming={upcoming.data ?? []} />
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

type OneDate = { member_id: string; date: string; day_type_id: string | null; wake_time: string | null; bed_time: string | null };

function DaysTab({ data, state, href, returnTo, today, household, upcoming }: TabProps & { today: string; upcoming: OneDate[] }) {
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
        <Card
          title={`${member.name}'s week`}
          icon={CalendarCheck}
          tint={member.colour}
          aside={
            <Segmented
              label="Every week or one date"
              options={[
                { href: href({ week: null }), label: "Every week", active: state.week !== "date" },
                { href: href({ week: "date" }), label: "One date", active: state.week === "date" },
              ]}
            />
          }
        >
          {state.week === "date" ? (
            <OneDateEditor
              member={member}
              types={types}
              upcoming={upcoming.filter((o) => o.member_id === member.id)}
              today={today}
              household={household}
              returnTo={returnTo}
            />
          ) : plan ? (
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

const ONE_DATES_SHOWN = 4;

/** One date that isn't like the usual week: a holiday, a sick day, a late night. */
function OneDateEditor({
  member,
  types,
  upcoming,
  today,
  household,
  returnTo,
}: {
  member: TabProps["data"]["members"][number];
  types: TabProps["data"]["dayTypes"];
  upcoming: OneDate[];
  today: string;
  household: TabProps["household"];
  returnTo: string;
}) {
  const { locale } = household.settings;
  const dateLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const time = (t: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(`2026-01-01T${t.slice(0, 5)}:00Z`));
  const shown = upcoming.slice(0, ONE_DATES_SHOWN);
  return (
    <div className="mt-1 flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-base text-ink-muted">Make one date a different kind of day, like a holiday on a weekday. Leave the times empty to use that kind of day&rsquo;s usual times.</p>
      <form action={setOneDate} className="flex flex-col gap-2.5 rounded-2xl bg-rail p-3">
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-sm font-bold text-ink-muted">
            Date
            <input name="date" type="date" min={today} defaultValue={today} required className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink-muted">
            Up
            <input name="wake" type="time" className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink-muted">
            Bed
            <input name="bed" type="time" className="min-h-11 rounded-xl border-2 border-frame bg-board px-2 text-base text-ink" />
          </label>
        </div>
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Kind of day</legend>
          <span className="mr-1 text-sm font-bold text-ink-muted">Kind of day</span>
          {types.map((t, i) => (
            <label
              key={t.id}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-2 border-frame bg-board px-3 text-base text-ink select-none has-checked:border-ink has-checked:font-bold"
            >
              <input type="radio" name="dayTypeId" value={t.id} defaultChecked={i === 0} className="size-4 accent-accent" />
              {t.icon ? <Emoji emoji={t.icon} className="size-5" /> : null}
              {t.name}
            </label>
          ))}
        </fieldset>
        <Button className="min-h-11 self-start text-base">Set this date</Button>
      </form>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-ink-muted">Coming up</span>
        {shown.length === 0 ? <p className="text-base text-ink-muted">No dates changed.</p> : null}
        {shown.map((o) => {
          const type = types.find((t) => t.id === o.day_type_id);
          const times = [o.wake_time ? `up ${time(o.wake_time)}` : null, o.bed_time ? `bed ${time(o.bed_time)}` : null].filter(Boolean).join(", ");
          return (
            <div key={o.date} className="flex min-h-11 items-center gap-2.5 rounded-xl bg-rail px-3">
              <span className="w-28 shrink-0 text-base font-bold text-ink">{dateLabel(o.date)}</span>
              <span className="min-w-0 flex-1 truncate text-base text-ink">
                {type?.name ?? "Usual day"}
                {times ? <span className="text-ink-muted"> · {times}</span> : null}
              </span>
              <form action={setDay}>
                <input type="hidden" name="memberId" value={member.id} />
                <input type="hidden" name="date" value={o.date} />
                <input type="hidden" name="reset" value="true" />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="flex min-h-10 items-center rounded-lg px-2 text-base font-bold text-accent">Back to usual</button>
              </form>
            </div>
          );
        })}
        {upcoming.length > ONE_DATES_SHOWN ? <span className="text-sm font-bold text-ink-muted">+{upcoming.length - ONE_DATES_SHOWN} more later</span> : null}
      </div>
    </div>
  );
}
