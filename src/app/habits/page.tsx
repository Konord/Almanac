import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { Pager } from "@/components/pager";
import { AppFrame, EmptyState, firstParam, LoadingOutline, ScreenHeader, Segmented } from "@/components/ui";
import { strong } from "@/lib/colours";
import { monthDates, shiftMonth } from "@/lib/habits";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { loadHabitRows } from "./data";
import { LinesView, RINGS_PER_PAGE, RingsView, YearPopup } from "./views";

/**
 * The Habits page (2026-11-12): habits from routines and the Habit
 * Manager, drawn as Lines (the whole family) or Rings (one person), as
 * picked in Settings. Tapping a habit's name opens its last 12 months.
 *
 * ?month=YYYY-MM  which month (this month by default)
 * ?page=N         Lines: which page of habits; Rings: which page of rings
 * ?member=<id>    Rings: whose rings
 * ?chart=<key>    Rings: which count habit the bar chart shows
 * ?habit=<key>    the 12-month popup; &bars=1 shows it as bars
 */
export default function HabitsPage(props: PageProps<"/habits">) {
  return (
    <AppFrame section="habits">
      <Suspense fallback={<LoadingOutline />}>
        <Habits searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

/** Habit rows on a page of Lines; they fit 1280×720 and 1920×1080 alike. */
const LINES_PER_PAGE = 8;

async function Habits({ searchParams }: { searchParams: PageProps<"/habits">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone, habitsView } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const thisMonth = today.slice(0, 7);
  const asked = firstParam(params.month) ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const dates = monthDates(month);
  const { members, rows } = await loadHabitRows(dates[0], dates[dates.length - 1], today);

  const state: Record<string, string | null> = {
    month: month === thisMonth ? null : month,
    page: firstParam(params.page) ?? null,
    member: firstParam(params.member) ?? null,
    chart: firstParam(params.chart) ?? null,
  };
  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...changes })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/habits?${s}` : "/habits";
  };
  const popupHref = (key: string) => href({ habit: key });
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  const page = Math.max(0, Number(state.page) || 0);

  // Rings: one person at a time (their own habits only).
  const withHabits = members.filter((m) => rows.some((r) => r.member.id === m.id));
  const member = withHabits.find((m) => m.id === state.member) ?? withHabits[0];
  const mine = member ? rows.filter((r) => r.member.id === member.id) : [];
  const dailyMine = mine.filter((r) => r.rule.frequency !== "week" && r.rule.frequency !== "month");
  const ringPages = Math.max(1, Math.ceil(dailyMine.length / RINGS_PER_PAGE));
  const ringPage = Math.min(page, ringPages - 1);
  const linePages = Math.max(1, Math.ceil(rows.length / LINES_PER_PAGE));
  const linePage = Math.min(page, linePages - 1);
  const rings = habitsView === "rings";

  // The popup: the habit's last 12 months, ending with the month on screen.
  const popupKey = firstParam(params.habit);
  let popup = null;
  if (popupKey) {
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
    const year = await loadHabitRows(`${months[0]}-01`, dates[dates.length - 1], today, popupKey);
    const row = year.rows[0];
    if (row) {
      popup = (
        <YearPopup
          row={row}
          months={months}
          today={today}
          locale={locale}
          bars={firstParam(params.bars) === "1"}
          closeHref={href({})}
          modeHref={(bars) => href({ habit: popupKey, bars: bars ? "1" : null })}
        />
      );
    }
  }

  const arrow = "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink";
  return (
    <>
      <ScreenHeader title="Habits">
        <Segmented
          label="Habits or health"
          options={[
            { href: "/habits", label: "Habits", active: true },
            { href: "/habits/health", label: "Health", active: false },
          ]}
        />
        <div className="flex items-center gap-2">
          <Link href={href({ month: shiftMonth(month, -1), page: null })} aria-label={monthLabel(shiftMonth(month, -1))} className={arrow}>
            <CaretLeft size="1.5rem" weight="bold" aria-hidden />
          </Link>
          <span className="min-w-56 text-center text-2xl font-extrabold text-ink">{monthTitle}</span>
          {month < thisMonth ? (
            <Link href={href({ month: shiftMonth(month, 1), page: null })} aria-label={monthLabel(shiftMonth(month, 1))} className={arrow}>
              <CaretRight size="1.5rem" weight="bold" aria-hidden />
            </Link>
          ) : (
            <span className={`${arrow} opacity-30`} aria-hidden>
              <CaretRight size="1.5rem" weight="bold" />
            </span>
          )}
        </div>
        <span className="flex-1" />
        {rings ? (
          <>
            <Pager page={ringPage} pages={ringPages} href={(p) => href({ page: p ? String(p) : null })} />
            <nav aria-label="Person" className="flex gap-2">
              {withHabits.map((m) => (
                <Link
                  key={m.id}
                  href={href({ member: m.id, page: null, chart: null })}
                  aria-current={m.id === member?.id ? "page" : undefined}
                  className="flex min-h-[var(--touch-target)] items-center rounded-full px-5 text-lg font-bold"
                  style={m.id === member?.id ? { background: strong(m.colour), color: "white" } : { background: "var(--color-rail)", color: "var(--color-ink)" }}
                >
                  {m.name}
                </Link>
              ))}
            </nav>
          </>
        ) : (
          <Pager page={linePage} pages={linePages} href={(p) => href({ page: p ? String(p) : null })} />
        )}
        <Link href="/habits/manage" aria-label="Habit Manager" title="Habit Manager" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-2xl bg-rail text-ink">
          <PencilSimple size="1.625rem" weight="bold" aria-hidden />
        </Link>
      </ScreenHeader>

      {rows.length === 0 ? (
        <EmptyState emoji="✅" title={<Link href="/habits/manage">Make a habit</Link>} />
      ) : rings && member ? (
        <RingsView
          member={member}
          rows={[...dailyMine.slice(ringPage * RINGS_PER_PAGE, (ringPage + 1) * RINGS_PER_PAGE), ...mine.filter((r) => !dailyMine.includes(r))]}
          month={month}
          today={today}
          locale={locale}
          href={popupHref}
          chartKey={state.chart}
          chartHref={(key) => href({ chart: key })}
        />
      ) : (
        <LinesView rows={rows.slice(linePage * LINES_PER_PAGE, (linePage + 1) * LINES_PER_PAGE)} month={month} today={today} locale={locale} href={popupHref} />
      )}
      {popup}
    </>
  );
}
