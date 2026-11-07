import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, CaretLeft, CaretRight, ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Card, Emoji, IconLink, Panel, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { strong } from "@/lib/colours";
import type { HabitDay } from "@/lib/habits";
import { requireHousehold, type Household } from "@/lib/household";
import { addDays, localDateOf, type LocalDate } from "@/lib/time";
import { loadRoutines, type RoutineMember } from "../data";
import { loadHabitHistory, type HabitRow } from "../habits-data";

/**
 * The habit chart: like a paper habit tracker on the fridge. One row per
 * tracked step (with the whole routine above its steps), one column per
 * day for four weeks. Arrows step back through earlier weeks; rows page.
 * Nothing scrolls.
 */
export default function HabitsPage(props: PageProps<"/routines/habits">) {
  return (
    <AppFrame section="routines">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Habits searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

/** Four weeks on the chart at a time. */
const DAYS_SHOWN = 28;
const ROWS_PER_PAGE = 10;
/** Streaks and bests look back up to a year. */
const HISTORY_DAYS = 365;

async function Habits({ searchParams }: { searchParams: PageProps<"/routines/habits">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const data = await loadRoutines(today);
  const member = data.members.find((m) => m.id === firstParam(params.member)) ?? data.members[0] ?? null;
  const back = Math.max(0, Math.floor(Number(firstParam(params.back) ?? 0)) || 0);
  const page = Math.max(0, Math.floor(Number(firstParam(params.page) ?? 0)) || 0);

  const href = (changes: { member?: string; back?: number; page?: number }) => {
    const next = new URLSearchParams();
    const m = changes.member ?? member?.id;
    if (m) next.set("member", m);
    const b = changes.back ?? back;
    if (b) next.set("back", String(b));
    const p = changes.page ?? (changes.member ? 0 : page);
    if (p) next.set("page", String(p));
    const query = next.toString();
    return query ? `/routines/habits?${query}` : "/routines/habits";
  };

  // The chart shows 28 days, ending today or `back` four-week steps ago.
  const end = addDays(today, -back * DAYS_SHOWN);
  const start = addDays(end, -(DAYS_SHOWN - 1));
  const history = member ? await loadHabitHistory(data, member.id, addDays(today, -(HISTORY_DAYS - 1)), today, today) : null;
  const firstShown = history ? history.dates.indexOf(start) : -1;
  const lastShown = history ? history.dates.indexOf(end) : -1;
  const earliestSince = history?.routines.reduce<string | null>((min, r) => {
    const since = r.routine.template.habit_since;
    return since && (!min || since < min) ? since : min;
  }, null);
  const canGoBack = Boolean(earliestSince && earliestSince < start && firstShown > 0);

  const rows: HabitRow[] = (history?.routines ?? []).flatMap((r) => (r.steps.length > 1 ? [r.routine, ...r.steps] : r.steps));
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const shownPage = Math.min(page, pages - 1);
  const shownRows = rows.slice(shownPage * ROWS_PER_PAGE, shownPage * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const dates = history && firstShown >= 0 && lastShown >= 0 ? history.dates.slice(firstShown, lastShown + 1) : [];

  return (
    <>
      <ScreenHeader title="Habits">
        <div className="flex items-center gap-2">
          {canGoBack ? <IconLink href={href({ back: back + 1 })} label="Earlier weeks" icon={CaretLeft} /> : <span className="size-[var(--touch-target)]" />}
          <span className="min-w-56 text-center text-lg font-bold text-ink">{rangeLabel(start, end, household)}</span>
          {back > 0 ? <IconLink href={href({ back: back - 1 })} label="Later weeks" icon={CaretRight} /> : <span className="size-[var(--touch-target)]" />}
          {back > 0 ? <SoftLink href={href({ back: 0 })}>This week</SoftLink> : null}
        </div>
        <SoftLink href={member ? `/routines?member=${member.id}` : "/routines"} className="lg:ml-auto">
          <ArrowLeft size="1.5rem" aria-hidden />
          Back to checklists
        </SoftLink>
      </ScreenHeader>

      <nav aria-label="Whose habits" className="flex shrink-0 flex-wrap gap-2">
        {data.members.map((m) => (
          <Link
            key={m.id}
            href={href({ member: m.id })}
            aria-current={m.id === member?.id ? "page" : undefined}
            className={`flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-2xl px-3 text-lg font-bold text-ink ${m.id === member?.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-frame)]" : ""}`}
          >
            <Avatar name={m.name} colour={m.colour} icon={m.icon} size="sm" />
            {m.name}
          </Link>
        ))}
      </nav>

      {!member ? null : rows.length === 0 ? (
        <Panel>
          <p className="text-lg text-ink-muted">
            None of {member.name}&rsquo;s routines are tracked as habits yet. To track one, open{" "}
            <Link href="/routines/manage?tab=routines" className="font-bold text-accent">
              Set up routines
            </Link>
            , pick the routine, and switch on <strong className="text-ink">Track as a habit</strong>.
          </p>
        </Panel>
      ) : (
        <Card title={`${member.name}’s habits`} icon={ChartLineUp} tint={member.colour} aside={<Legend member={member} />} className="lg:flex-1">
          <Chart rows={shownRows} dates={dates} firstShown={firstShown} today={today} member={member} household={household} />
          {pages > 1 ? (
            <div className="mt-auto flex items-center gap-3 pt-3 text-base font-bold">
              {shownPage > 0 ? (
                <Link href={href({ page: shownPage - 1 })} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-ink">
                  ‹ Back
                </Link>
              ) : null}
              <span className="text-ink-muted">
                Rows {shownPage * ROWS_PER_PAGE + 1}–{Math.min(rows.length, (shownPage + 1) * ROWS_PER_PAGE)} of {rows.length}
              </span>
              {shownPage < pages - 1 ? (
                <Link href={href({ page: shownPage + 1 })} className="flex min-h-11 items-center rounded-xl bg-rail px-3.5 text-ink">
                  More ›
                </Link>
              ) : null}
            </div>
          ) : null}
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

const COLUMNS = `minmax(0,15rem) repeat(${DAYS_SHOWN}, minmax(0,1fr)) 5.5rem 5.5rem 6.5rem`;

function Chart({
  rows,
  dates,
  firstShown,
  today,
  member,
  household,
}: {
  rows: HabitRow[];
  dates: LocalDate[];
  firstShown: number;
  today: LocalDate;
  member: RoutineMember;
  household: Household;
}) {
  const { locale } = household.settings;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const noon = (d: LocalDate) => new Date(`${d}T12:00:00Z`);

  return (
    <div role="table" aria-label={`${member.name}’s habits`} className="mt-2 flex flex-col">
      <div role="row" className="grid items-end gap-x-1 border-b border-frame pb-1.5" style={{ gridTemplateColumns: COLUMNS }}>
        <span role="columnheader" className="text-sm font-bold text-ink-muted">
          Habit
        </span>
        {dates.map((d, i) => (
          <span
            key={d}
            role="columnheader"
            aria-label={d}
            className={`flex flex-col items-center rounded-lg py-0.5 leading-tight ${d === today ? "bg-[color-mix(in_srgb,var(--color-now)_12%,white)] text-now" : "text-ink-muted"}`}
          >
            <span className="text-xs font-semibold">{i === 0 || d.endsWith("-01") ? month.format(noon(d)) : weekday.format(noon(d))}</span>
            <span className="text-sm font-bold">{Number(d.slice(8))}</span>
          </span>
        ))}
        <span role="columnheader" className="text-center text-sm font-bold text-ink-muted">
          Streak
        </span>
        <span role="columnheader" className="text-center text-sm font-bold text-ink-muted">
          Best
        </span>
        <span role="columnheader" className="text-center text-sm font-bold text-ink-muted">
          4 weeks
        </span>
      </div>
      {rows.map((row) => {
        const shown = row.days.slice(firstShown, firstShown + dates.length);
        const done = shown.filter((d) => d === "done").length;
        const counted = done + shown.filter((d) => d === "missed").length;
        const isRoutine = row.step === null;
        return (
          <div
            key={row.step?.id ?? row.template.id}
            role="row"
            className={`grid min-h-14 items-center gap-x-1 border-b border-frame ${isRoutine ? "bg-rail" : ""}`}
            style={{ gridTemplateColumns: COLUMNS }}
          >
            <span role="rowheader" className={`flex min-w-0 items-center gap-2.5 ${isRoutine ? "pl-2" : "pl-5"}`}>
              {row.step ? <Emoji emoji={row.step.icon ?? "✅"} className="size-8" /> : null}
              <span className="flex min-w-0 flex-col">
                <span className={`truncate leading-tight text-ink ${isRoutine ? "text-lg font-extrabold" : "text-lg font-semibold"}`}>
                  {row.step ? row.step.text : row.template.name}
                </span>
                <span className="truncate text-xs font-bold text-ink-muted">{row.step ? row.template.name : "Every tracked step"}</span>
              </span>
            </span>
            {shown.map((day, i) => (
              <span key={dates[i]} role="cell" className="flex items-center justify-center" aria-label={`${dates[i]}: ${DAY_LABEL[day]}`}>
                <Dot day={day} colour={strong(member.colour)} />
              </span>
            ))}
            <span role="cell" className="flex items-center justify-center gap-1 text-lg font-bold text-ink">
              <Emoji emoji="🔥" className="size-5" faded={row.stats.streak === 0} />
              {row.stats.streak}
            </span>
            <span role="cell" className="text-center text-lg font-bold text-ink-soft">
              {row.stats.best}
            </span>
            <span role="cell" className="text-center text-lg font-bold text-ink-soft">
              {counted ? `${done}/${counted}` : "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const DAY_LABEL: Record<HabitDay, string> = {
  done: "done",
  missed: "missed",
  off: "not on",
  rest: "survival day",
  open: "not yet",
};

function Dot({ day, colour }: { day: HabitDay; colour: string }) {
  const size = "size-6";
  switch (day) {
    case "done":
      return <span className={`${size} rounded-full`} style={{ background: colour }} />;
    case "missed":
      return <span className={`${size} rounded-full border-[2.5px] border-check-border`} />;
    case "open":
      return <span className={`${size} rounded-full border-[2.5px] border-dashed`} style={{ borderColor: colour }} />;
    case "rest":
      return <span className="h-1 w-3 rounded-full bg-check-border" />;
    case "off":
      return <span className="size-1.5 rounded-full bg-grid" />;
  }
}

function Legend({ member }: { member: RoutineMember }) {
  const colour = strong(member.colour);
  const item = "flex items-center gap-1.5";
  return (
    <div className="hidden items-center gap-4 text-sm font-bold text-ink-muted md:flex">
      <span className={item}>
        <Dot day="done" colour={colour} /> Done
      </span>
      <span className={item}>
        <Dot day="missed" colour={colour} /> Missed
      </span>
      <span className={item}>
        <Dot day="open" colour={colour} /> Today, not yet
      </span>
      <span className={item}>
        <Dot day="rest" colour={colour} /> Survival day
      </span>
      <span className={item}>
        <Dot day="off" colour={colour} /> Not on
      </span>
    </div>
  );
}

function rangeLabel(start: LocalDate, end: LocalDate, household: Household): string {
  const format = new Intl.DateTimeFormat(household.settings.locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(`${start}T12:00:00Z`))} – ${format.format(new Date(`${end}T12:00:00Z`))}`;
}
