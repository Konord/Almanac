import Link from "next/link";
import { X } from "@phosphor-icons/react/dist/ssr";
import { Avatar, Emoji } from "@/components/ui";
import { soft, strong } from "@/lib/colours";
import { emojiImage, eventEmoji } from "@/lib/emoji";
import { chartTop, dayMet, monthDates, weekdayOf, type HabitPeriod } from "@/lib/habits";
import type { LocalDate } from "@/lib/time";
import { habitSub, type HabitCell, type HabitMember, type HabitRowData } from "./data";

/*
 * The Habits page's two views (Connor picks one in Settings) and the
 * 12-month popup. All drawn on the server: every tap is a link.
 *
 * Lines: one row per habit and person, a circle per day of the month. A
 * count habit's circle fills like a glass; a week or month habit shows one
 * pill per week or month.
 * Rings: one person, a ring per daily habit (days 1–31 clockwise) with its
 * name in a band at the top left that bends into the ring, like Connor's
 * paper tracker. Week and month habits and a count chart sit beside it.
 */

export const habitPicture = (row: Pick<HabitRowData, "icon" | "name">) => eventEmoji(row.icon, row.name, "✅");
const periodic = (row: HabitRowData) => row.rule.frequency === "week" || row.rule.frequency === "month";

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/** Day cells: 2.125rem circles with a 0.45rem gap. */
const CELL = 2.125;
const GAP = 0.45;

export function LinesView({ rows, month, today, locale, href }: { rows: HabitRowData[]; month: string; today: LocalDate; locale: string; href: (key: string) => string }) {
  const dates = monthDates(month);
  return (
    <section aria-label="Habits this month" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-frame">
        <span className="w-[25rem] shrink-0" />
        <div className="flex" style={{ gap: `${GAP}rem` }}>
          {dates.map((d) => {
            const weekend = weekdayOf(d) === 0 || weekdayOf(d) === 6;
            return (
              <span key={d} className={`text-center text-sm font-bold tabular-nums ${d === today ? "text-now" : weekend ? "text-check-border" : "text-ink-soft"}`} style={{ width: `${CELL}rem` }}>
                {Number(d.slice(8))}
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {rows.map((row, i) => {
          const nextPerson = rows[i + 1] && rows[i + 1].member.id !== row.member.id;
          const sub = [row.member.name, habitSub(row, locale)].filter(Boolean).join(" · ");
          return (
            <div key={row.key} className={`flex max-h-24 min-h-0 flex-1 items-center ${nextPerson ? "border-b border-frame" : ""}`}>
              <Link href={href(row.key)} scroll={false} className="flex w-[25rem] shrink-0 items-center gap-3 pr-3">
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: strong(row.member.colour) }} aria-hidden />
                <Emoji emoji={habitPicture(row)} className="size-9" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-xl font-bold text-ink">{row.name}</span>
                  <span className="truncate text-sm text-ink-muted">{sub}</span>
                </span>
              </Link>
              {periodic(row) ? (
                <div className="flex" style={{ gap: `${GAP}rem` }}>
                  {row.periods.map((p) => (
                    <PeriodPill key={p.from} period={p} row={row} dates={dates} />
                  ))}
                </div>
              ) : (
                <div className="flex" style={{ gap: `${GAP}rem` }}>
                  {dates.map((d) => (
                    <DayCircle key={d} cell={row.cells.get(d) ?? { day: "future", amount: 0 }} row={row} />
                  ))}
                </div>
              )}
              <span className="flex-1 text-right text-2xl font-extrabold tabular-nums" style={{ color: strong(row.member.colour) }} title="In a row">
                {row.stats.streak}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DayCircle({ cell, row }: { cell: HabitCell; row: HabitRowData }) {
  const colour = strong(row.member.colour);
  const size = { width: `${CELL}rem`, height: `${CELL}rem` };
  const base = "shrink-0 rounded-full border-2";
  if (cell.day === "off" || cell.day === "rest" || cell.day === "blank") {
    return (
      <span className="flex shrink-0 items-center justify-center" style={size}>
        <span className="size-2.5 rounded-full bg-frame" />
      </span>
    );
  }
  if (cell.day === "future") return <span className={`${base} border-grid`} style={size} />;
  const fill = row.rule.measure === "count" ? Math.min(1, cell.amount / row.rule.goal) : cell.day === "done" ? 1 : 0;
  const border = cell.day === "open" ? "var(--color-now)" : fill > 0 ? colour : "var(--color-check-border)";
  return (
    <span
      className={base}
      style={{ ...size, borderColor: border, background: fill > 0 ? `linear-gradient(to top, ${colour} ${fill * 100}%, white ${fill * 100}%)` : "white" }}
      title={row.rule.measure === "count" ? `${cell.amount}` : undefined}
    />
  );
}

function PeriodPill({ period, row, dates }: { period: HabitPeriod; row: HabitRowData; dates: LocalDate[] }) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const from = period.from < first ? first : period.from;
  const to = period.to > last ? last : period.to;
  const n = dates.filter((d) => d >= from && d <= to).length;
  if (n === 0) return null;
  const width = `${n * CELL + (n - 1) * GAP}rem`;
  const colour = strong(row.member.colour);
  const look =
    period.status === "done"
      ? { background: colour, color: "white", borderColor: colour }
      : period.status === "open"
        ? { borderColor: "var(--color-now)", color: "var(--color-now)" }
        : period.status === "missed"
          ? { borderColor: "var(--color-check-border)" }
          : { borderColor: "var(--color-grid)" };
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold tabular-nums" style={{ width, height: `${CELL}rem`, ...look }}>
      {period.status === "open" && row.rule.times > 1 && n >= 2 ? `${period.met}/${row.rule.times}` : ""}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------

/** The pastel for each ring, from the outside in. */
const RING_TINTS = ["pink", "orange", "meal", "green", "blue"];
const tint = (i: number) => (RING_TINTS[i % RING_TINTS.length] === "meal" ? "var(--color-meal)" : soft(RING_TINTS[i % RING_TINTS.length]));
export const RINGS_PER_PAGE = 5;

export function RingsView({
  member,
  rows,
  month,
  today,
  locale,
  href,
  chartKey,
  chartHref,
}: {
  member: HabitMember;
  rows: HabitRowData[];
  month: string;
  today: LocalDate;
  locale: string;
  href: (key: string) => string;
  chartKey: string | null;
  chartHref: (key: string) => string;
}) {
  const dates = monthDates(month);
  const daily = rows.filter((r) => !periodic(r)).slice(0, RINGS_PER_PAGE);
  const weekly = rows.filter((r) => r.rule.frequency === "week");
  const monthly = rows.filter((r) => r.rule.frequency === "month");
  const counted = rows.filter((r) => r.rule.measure === "count");
  const chart = counted.find((r) => r.key === chartKey) ?? counted[0];
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const weeks = weekly[0]?.periods ?? [];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,64fr)_minmax(0,36fr)] gap-6">
      <div className="relative min-h-0 min-w-0">
        <Rings member={member} rows={daily} dates={dates} today={today} href={href} />
      </div>
      <aside className="flex min-h-0 min-w-0 flex-col gap-4 pt-3">
        {weekly.length ? (
          <section className="flex flex-col gap-2.5 rounded-[1.375rem] bg-rail px-5 py-4">
            <div className="flex items-center">
              <span className="flex-1 text-lg font-extrabold text-ink">Weekly</span>
              <span className="flex gap-2 text-sm font-bold text-ink-muted">
                {weeks.map((_, i) => (
                  <span key={i} className="w-10 text-center">
                    W{i + 1}
                  </span>
                ))}
              </span>
            </div>
            {weekly.slice(0, 3).map((r) => (
              <Link key={r.key} href={href(r.key)} scroll={false} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{r.name}</span>
                <span className="flex gap-2">
                  {r.periods.map((p) => (
                    <PeriodMark key={p.from} period={p} times={r.rule.times} />
                  ))}
                </span>
              </Link>
            ))}
          </section>
        ) : null}
        {monthly.length ? (
          <section className="flex flex-col gap-2.5 rounded-[1.375rem] bg-rail px-5 py-4">
            <span className="text-lg font-extrabold text-ink">Monthly</span>
            {monthly.slice(0, 3).map((r) => (
              <Link key={r.key} href={href(r.key)} scroll={false} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{r.name}</span>
                {r.periods.slice(-1).map((p) => (
                  <PeriodMark key={p.from} period={p} times={r.rule.times} />
                ))}
              </Link>
            ))}
          </section>
        ) : null}
        {chart ? (
          <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-[1.375rem] bg-rail px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-lg font-extrabold text-ink">{monthName}</span>
              {counted.slice(0, 3).map((r) => (
                <Link
                  key={r.key}
                  href={chartHref(r.key)}
                  scroll={false}
                  aria-current={r.key === chart.key ? "true" : undefined}
                  className="flex min-h-11 items-center rounded-full px-4 text-base font-bold"
                  style={r.key === chart.key ? { background: strong(member.colour), color: "white" } : { background: "var(--color-board)", color: "var(--color-ink)" }}
                >
                  {r.name}
                </Link>
              ))}
            </div>
            <CountBars dates={dates} row={chart} />
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function PeriodMark({ period, times }: { period: HabitPeriod; times: number }) {
  const base = "flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-extrabold";
  if (period.status === "done") return <span className={`${base} bg-met-soft text-met`}>✓</span>;
  if (period.status === "missed") return <span className={`${base} bg-[color-mix(in_srgb,var(--color-missed)_22%,white)] text-missed`}>✕</span>;
  if (period.status === "open")
    return <span className={`${base} border-2 border-now text-sm text-now`}>{times > 1 && period.met > 0 ? `${period.met}/${times}` : ""}</span>;
  return <span className={`${base} border-2 border-frame`} />;
}

function Rings({ member, rows, dates, today, href }: { member: HabitMember; rows: HabitRowData[]; dates: LocalDate[]; today: LocalDate; href: (key: string) => string }) {
  const CX = 470;
  const CY = 318;
  const OUT = 280;
  const W = Math.min(40, Math.floor(150 / Math.max(rows.length, 1)));
  const LEFT = 16;
  const SWEEP = (250 * Math.PI) / 180;
  const step = SWEEP / dates.length;
  const pt = (r: number, a: number): [number, number] => [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  const f = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const sector = (r0: number, r1: number, a0: number, a1: number) =>
    `M${f(pt(r1, a0))} A${r1} ${r1} 0 0 1 ${f(pt(r1, a1))} L${f(pt(r0, a1))} A${r0} ${r0} 0 0 0 ${f(pt(r0, a0))} Z`;
  const todayIndex = dates.indexOf(today);
  const inner = OUT - rows.length * W;

  return (
    <svg viewBox="0 0 820 630" className="absolute inset-0 h-full w-full" role="img" aria-label={`${member.name}'s daily habits, one ring each`}>
      {rows.map((row, i) => {
        const r1 = OUT - i * W;
        const r0 = r1 - W;
        const fillTint = tint(i);
        const icon = emojiImage(habitPicture(row));
        return (
          <g key={row.key}>
            <rect x={LEFT} y={CY - r1} width={CX - LEFT} height={W} fill={fillTint} stroke="white" strokeWidth={2} />
            {dates.map((d, n) => {
              const cell = row.cells.get(d) ?? { day: "future" as const, amount: 0 };
              const a0 = n * step;
              const a1 = (n + 1) * step;
              const off = cell.day === "off" || cell.day === "rest";
              const fill = d === today && cell.day !== "done" ? "white" : off && d <= today ? "var(--color-frame)" : fillTint;
              const c = pt((r0 + r1) / 2, (a0 + a1) / 2);
              let mark: { t: string; colour: string; size: number } | null = null;
              if (cell.day === "done") mark = { t: "✓", colour: "var(--color-met)", size: W * 0.5 };
              else if (cell.day === "missed") {
                mark = row.rule.measure === "count" && cell.amount > 0 ? { t: String(cell.amount), colour: "var(--color-ink-soft)", size: W * 0.38 } : { t: "✕", colour: "var(--color-missed)", size: W * 0.45 };
              } else if (cell.day === "open" && row.rule.measure === "count" && cell.amount > 0) mark = { t: String(cell.amount), colour: "var(--color-ink-soft)", size: W * 0.38 };
              return (
                <g key={d}>
                  <path d={sector(r0, r1, a0, a1)} fill={fill} stroke="white" strokeWidth={1.5} />
                  {mark ? (
                    <text x={c[0].toFixed(1)} y={c[1].toFixed(1)} textAnchor="middle" dominantBaseline="central" fontSize={mark.size} fontWeight={800} fill={mark.colour}>
                      {mark.t}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <Link href={href(row.key)} scroll={false}>
              {icon ? <image href={icon} x={LEFT + 10} y={CY - r1 + (W - 22) / 2} width={22} height={22} /> : null}
              <text x={LEFT + 40} y={CY - r1 + W / 2} dominantBaseline="central" fontSize={Math.min(16, W * 0.5)} fontWeight={800} fill="var(--color-ink)">
                {row.name}
              </text>
              <text x={CX - 14} y={CY - r1 + W / 2} textAnchor="end" dominantBaseline="central" fontSize={Math.min(13, W * 0.4)} fontWeight={700} fill="var(--color-ink-soft)">
                {row.rule.measure === "count" ? `${row.rule.goal}${row.unit ? ` ${row.unit}` : ""}` : ""}
              </text>
            </Link>
          </g>
        );
      })}
      {todayIndex >= 0 && rows.length ? (
        <path d={sector(inner, OUT, todayIndex * step, (todayIndex + 1) * step)} fill="color-mix(in srgb, var(--color-now) 10%, transparent)" stroke="var(--color-now)" strokeWidth={2} />
      ) : null}
      {dates.map((d, n) => {
        const p = pt(OUT + 16, (n + 0.5) * step);
        return (
          <text key={d} x={p[0].toFixed(1)} y={p[1].toFixed(1)} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={800} fill={d === today ? "var(--color-now)" : "var(--color-ink-soft)"}>
            {Number(d.slice(8))}
          </text>
        );
      })}
      <foreignObject x={CX - 100} y={CY - 52} width={200} height={110}>
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <Avatar name={member.name} colour={member.colour} icon={member.icon} size="lg" />
          <span className="text-[24px] font-extrabold text-ink">{member.name}</span>
        </div>
      </foreignObject>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// A count habit's bars, one per day
// ---------------------------------------------------------------------------

export function CountBars({ dates, row, small = false }: { dates: LocalDate[]; row: HabitRowData; small?: boolean }) {
  const amounts = dates.map((d) => row.cells.get(d)?.amount ?? 0);
  const top = chartTop(row.rule.goal, Math.max(0, ...amounts));
  const label = small ? "text-xs" : "text-sm";
  return (
    <div className="flex min-h-0 flex-1 gap-1">
      <div className={`flex w-8 flex-col items-end justify-between pb-5 font-bold text-ink-muted tabular-nums ${label}`}>
        <span>{top}</span>
        <span>{top / 2}</span>
        <span>0</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 items-end gap-[2px] border-b-2 border-l-2 border-check-border pl-[2px]">
          <span className="absolute inset-x-0 border-t-2 border-dashed border-met opacity-60" style={{ bottom: `${(100 * row.rule.goal) / top}%` }} aria-hidden />
          {amounts.map((a, i) => (
            <span
              key={dates[i]}
              className="flex-1 rounded-t-[2px]"
              style={{ height: a ? `${Math.max(3, (100 * Math.min(a, top)) / top)}%` : 0, background: dayMet(row.rule, a) ? "var(--color-met)" : "var(--color-missed-soft)" }}
              title={`${Number(dates[i].slice(8))}: ${a}`}
            />
          ))}
        </div>
        <div className={`flex h-5 items-end justify-between pl-1 font-bold text-ink-muted ${label}`}>
          <span>1</span>
          <span>10</span>
          <span>20</span>
          <span>{dates.length}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The 12-month popup
// ---------------------------------------------------------------------------

export function YearPopup({
  row,
  months,
  today,
  locale,
  bars,
  closeHref,
  modeHref,
}: {
  row: HabitRowData;
  /** Twelve "YYYY-MM", oldest first. */
  months: string[];
  today: LocalDate;
  locale: string;
  bars: boolean;
  closeHref: string;
  modeHref: (bars: boolean) => string;
}) {
  const count = row.rule.measure === "count";
  const showBars = bars && count;
  const monthName = (m: string, withYear: boolean) =>
    new Intl.DateTimeFormat(locale, { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  const total = months.flatMap(monthDates).reduce((sum, d) => sum + (row.cells.get(d)?.amount ?? 0), 0);
  const per = row.rule.frequency === "week" ? "weeks" : row.rule.frequency === "month" ? "months" : "days";
  const stats = [
    { v: String(row.stats.streak), l: "in a row" },
    { v: `${row.stats.done}/${row.stats.counted}`, l: per },
    ...(count ? [{ v: total.toLocaleString(locale), l: row.unit || "total" }] : []),
  ];
  const sub = habitSub(row, locale);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.35)]" />
      <section role="dialog" aria-label={`${row.member.name} · ${row.name}, last 12 months`} className="relative flex h-full max-h-[63rem] w-full max-w-[113rem] flex-col gap-4 rounded-[2.25rem] bg-board px-10 py-7 shadow-2xl">
        <div className="flex items-center gap-4">
          <Emoji emoji={habitPicture(row)} className="size-16" />
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-3xl font-extrabold text-ink">
              {row.member.name} · {row.name}
            </h2>
            {sub ? <span className="text-base text-ink-muted">{sub}</span> : null}
          </div>
          <span className="flex-1" />
          <div className="mr-3 flex gap-9">
            {stats.map((s) => (
              <div key={s.l} className="flex flex-col items-center">
                <span className="text-4xl leading-none font-extrabold text-ink tabular-nums">{s.v}</span>
                <span className="text-sm text-ink-muted">{s.l}</span>
              </div>
            ))}
          </div>
          {count ? (
            <nav aria-label="Show as" className="flex gap-1 rounded-2xl bg-panel p-1.25">
              {[false, true].map((b) => (
                <Link
                  key={String(b)}
                  href={modeHref(b)}
                  scroll={false}
                  aria-current={showBars === b ? "page" : undefined}
                  className={`flex min-h-12 items-center rounded-xl px-5 text-base font-bold ${showBars === b ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
                >
                  {b ? "Bars" : "Months"}
                </Link>
              ))}
            </nav>
          ) : null}
          <Link href={closeHref} scroll={false} aria-label="Close" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink">
            <X size="1.5rem" weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-x-12 gap-y-4">
          {months.map((m, i) => (
            <div key={m} className="flex min-h-0 flex-col gap-1.5">
              <div className="flex items-baseline">
                <span className="flex-1 text-lg font-extrabold text-ink">{monthName(m, i === 0 || m.endsWith("-01"))}</span>
                {showBars ? (
                  <span className="text-sm font-bold text-ink-muted tabular-nums">{monthDates(m).reduce((s, d) => s + (row.cells.get(d)?.amount ?? 0), 0)}</span>
                ) : null}
              </div>
              {showBars ? <CountBars dates={monthDates(m)} row={row} small /> : <MiniMonth month={m} row={row} today={today} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniMonth({ month, row, today }: { month: string; row: HabitRowData; today: LocalDate }) {
  const dates = monthDates(month);
  const lead = (weekdayOf(dates[0]) + 6) % 7; // weeks start on Monday
  return (
    <div className="grid w-fit grid-cols-7 justify-items-center gap-x-2 gap-y-1">
      {Array.from({ length: lead }, (_, i) => (
        <span key={`lead${i}`} className="size-[1.95rem]" />
      ))}
      {dates.map((d) => {
        const cell = row.cells.get(d) ?? { day: "future" as const, amount: 0 };
        const base = "flex size-[1.95rem] items-center justify-center rounded-full text-sm font-extrabold text-white";
        if (d === today && cell.day !== "done") return <span key={d} className={`${base} border-2 border-now`} />;
        if (cell.day === "done") return <span key={d} className={`${base} bg-met`}>✓</span>;
        if (cell.day === "missed") return <span key={d} className={`${base} bg-missed`}>✕</span>;
        if (cell.day === "off" || cell.day === "rest")
          return (
            <span
              key={d}
              className={`${base} bg-grid`}
              style={{ backgroundImage: "linear-gradient(135deg, transparent 45%, var(--color-check-border) 45%, var(--color-check-border) 55%, transparent 55%)" }}
            />
          );
        return <span key={d} className={`${base} border-2 border-frame`} />;
      })}
    </div>
  );
}
