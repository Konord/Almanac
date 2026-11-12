import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, PencilSimple, X } from "@phosphor-icons/react/dist/ssr";
import { FitList } from "@/components/fit-list";
import { AppFrame, EmptyState, Emoji, firstParam, LoadingOutline, ScreenHeader, Segmented } from "@/components/ui";
import { strong } from "@/lib/colours";
import { emojiImage, eventEmoji } from "@/lib/emoji";
import { readingText } from "@/lib/health";
import { requireHousehold } from "@/lib/household";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { shortClockTime } from "@/lib/time-text";
import { deleteHealthLog, updateHealthLog } from "../actions";
import { choiceStatus, loadHealthLogs, loadLastDoses, loadTrackers, type HealthLog, type HealthTracker } from "../health-data";

/**
 * Health (2026-11-12): one person per page. A chart of the last three days
 * (a reading like temperature, with doses along the bottom and a dashed
 * ring where the next dose is allowed), each medicine's next time, and
 * today's entries. Tapping an entry fixes or removes it.
 *
 * ?member=<id>     whose page
 * ?end=YYYY-MM-DD  the last of the three days (today by default)
 * ?chart=<id>      which reading the chart shows, when there are several
 * ?entry=<id>      fix or remove an entry
 */
export default function HealthPage(props: PageProps<"/habits/health">) {
  return (
    <AppFrame section="habits">
      <Suspense fallback={<LoadingOutline />}>
        <Health searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

const DAYS = 3;

export const trackerEmoji = (t: Pick<HealthTracker, "icon" | "kind" | "name">) => t.icon || eventEmoji(null, t.name, t.kind === "medicine" ? "💊" : t.kind === "number" ? "🌡" : "🤒");

async function Health({ searchParams }: { searchParams: PageProps<"/habits/health">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone } = household.settings;
  const now = new Date();
  const today = localDateOf(now, timeZone);
  const askedEnd = firstParam(params.end) ?? "";
  const end = isLocalDate(askedEnd) && askedEnd < today ? askedEnd : today;
  const start = addDays(end, -(DAYS - 1));
  const { trackers, members } = await loadTrackers();
  const member = members.find((m) => m.id === firstParam(params.member)) ?? members[0];

  const state: Record<string, string | null> = { member: member && member.id !== members[0]?.id ? member.id : null, end: end === today ? null : end, chart: firstParam(params.chart) ?? null };
  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...changes })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/habits/health?${s}` : "/habits/health";
  };
  const fmtDay = (d: LocalDate, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const rangeTitle =
    start.slice(0, 7) === end.slice(0, 7)
      ? `${fmtDay(start, { month: "short", day: "numeric" })} – ${fmtDay(end, { day: "numeric" })}`
      : `${fmtDay(start, { month: "short", day: "numeric" })} – ${fmtDay(end, { month: "short", day: "numeric" })}`;
  const arrow = "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink";

  const header = (
    <ScreenHeader title="Habits">
      <Segmented
        label="Habits or health"
        options={[
          { href: "/habits", label: "Habits", active: false },
          { href: "/habits/health", label: "Health", active: true },
        ]}
      />
      <div className="flex items-center gap-2">
        <Link href={href({ end: addDays(end, -DAYS), entry: null })} aria-label="Earlier" className={arrow}>
          <CaretLeft size="1.5rem" weight="bold" aria-hidden />
        </Link>
        <span className="min-w-48 text-center text-2xl font-extrabold text-ink">{rangeTitle}</span>
        {end < today ? (
          <Link href={href({ end: addDays(end, DAYS) >= today ? null : addDays(end, DAYS), entry: null })} aria-label="Later" className={arrow}>
            <CaretRight size="1.5rem" weight="bold" aria-hidden />
          </Link>
        ) : (
          <span className={`${arrow} opacity-30`} aria-hidden>
            <CaretRight size="1.5rem" weight="bold" />
          </span>
        )}
      </div>
      <span className="flex-1" />
      <nav aria-label="Person" className="flex gap-2">
        {members.map((m) => (
          <Link
            key={m.id}
            href={href({ member: m.id === members[0].id ? null : m.id, chart: null, entry: null })}
            aria-current={m.id === member?.id ? "page" : undefined}
            className="flex min-h-[var(--touch-target)] items-center rounded-full px-5 text-lg font-bold"
            style={m.id === member?.id ? { background: strong(m.colour), color: "white" } : { background: "var(--color-rail)", color: "var(--color-ink)" }}
          >
            {m.name}
          </Link>
        ))}
      </nav>
      <Link href="/habits/manage?tab=health" aria-label="Habit Manager, health" title="Habit Manager" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-2xl bg-rail text-ink">
        <PencilSimple size="1.625rem" weight="bold" aria-hidden />
      </Link>
    </ScreenHeader>
  );

  if (!member) {
    return (
      <>
        {header}
        <EmptyState emoji="💊" title={<Link href="/habits/manage?tab=health">Add a tracker</Link>} />
      </>
    );
  }

  const mine = trackers.filter((t) => t.member_ids.includes(member.id));
  const windowStart = zonedToUtc(start, "00:00", timeZone);
  const windowEnd = zonedToUtc(addDays(end, 1), "00:00", timeZone);
  const dayStart = zonedToUtc(today, "00:00", timeZone);
  const medicines = mine.filter((t) => t.kind === "medicine");
  const choices = medicines.flatMap((t) => t.choices);
  const [logs, lastDoses] = await Promise.all([
    loadHealthLogs(windowStart < dayStart ? windowStart : dayStart, windowEnd > now ? windowEnd : new Date(now.getTime() + 60_000), member.id),
    loadLastDoses(choices.map((c) => c.id)),
  ]);
  const doses = [...logs, ...lastDoses.filter((l) => l.member_id === member.id && !logs.some((x) => x.id === l.id))];
  const time = (iso: string | Date) => shortClockTime(new Date(iso), locale, timeZone);
  const trackerOf = new Map(trackers.map((t) => [t.id, t]));

  // The chart: one reading tracker (the first, or the one picked).
  const numbers = mine.filter((t) => t.kind === "number");
  const chartTracker = numbers.find((t) => t.id === state.chart) ?? numbers[0] ?? null;
  const readings = chartTracker ? logs.filter((l) => l.tracker_id === chartTracker.id && l.value !== null && new Date(l.logged_at) >= windowStart && new Date(l.logged_at) < windowEnd) : [];
  const latest = chartTracker ? logs.find((l) => l.tracker_id === chartTracker.id && l.value !== null) : undefined;
  const windowDoses = logs.filter((l) => l.choice_id !== null || trackerOf.get(l.tracker_id)?.kind === "medicine").filter((l) => new Date(l.logged_at) >= windowStart && new Date(l.logged_at) < windowEnd);

  // Each medicine choice: when the next dose is allowed.
  const cards = choices.map((c) => {
    const s = choiceStatus(c, member.id, doses, now, dayStart);
    const last = s.last ? (localDateOf(s.last, timeZone) === today ? time(s.last) : `${new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(s.last)} ${time(s.last)}`) : null;
    const small = [last, `${s.today}${c.max_per_day ? ` of ${c.max_per_day}` : ""} today`].filter(Boolean).join(" · ");
    return { choice: c, status: s, small };
  });
  const nextRings = cards.filter((c) => c.status.next && c.status.next < windowEnd).map((c) => ({ at: c.status.next!, icon: c.choice.icon }));

  // Today's entries, newest first.
  const todayLogs = logs.filter((l) => new Date(l.logged_at) >= dayStart && new Date(l.logged_at) <= now);
  const editing = logs.find((l) => l.id === firstParam(params.entry)) ?? null;
  const here = href({});

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1 gap-5">
        <section aria-label={chartTracker?.name ?? "Doses"} className="flex min-w-0 flex-1 flex-col gap-1 rounded-[1.75rem] bg-rail px-7 py-5">
          <div className="flex items-center gap-4">
            {chartTracker ? <Emoji emoji={trackerEmoji(chartTracker)} className="size-12" /> : null}
            <span className="flex-1 text-3xl font-extrabold text-ink">{chartTracker?.name ?? ""}</span>
            {numbers.length > 1
              ? numbers.map((t) => (
                  <Link
                    key={t.id}
                    href={href({ chart: t.id })}
                    aria-current={t.id === chartTracker?.id ? "true" : undefined}
                    className={`flex min-h-11 items-center rounded-full px-4 text-base font-bold ${t.id === chartTracker?.id ? "bg-ink text-board" : "bg-board text-ink"}`}
                  >
                    {t.name}
                  </Link>
                ))
              : null}
            {latest && chartTracker ? (
              <>
                <span
                  className="text-5xl font-extrabold tabular-nums"
                  style={{ color: chartTracker.alert_above !== null && latest.value! > chartTracker.alert_above ? "var(--color-danger)" : "var(--color-ink)" }}
                >
                  {readingText(latest.value)}
                  {chartTracker.unit?.startsWith("°") ? "°" : ""}
                </span>
                <span className="text-xl font-bold text-ink-muted">{time(latest.logged_at)}</span>
              </>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1">
            <HealthChart
              start={windowStart}
              end={windowEnd}
              days={Array.from({ length: DAYS }, (_, i) => addDays(start, i))}
              today={today}
              now={now}
              locale={locale}
              timeZone={timeZone}
              tracker={chartTracker}
              readings={readings}
              doses={windowDoses.map((l) => ({ at: new Date(l.logged_at), icon: choices.find((c) => c.id === l.choice_id)?.icon ?? trackerEmoji(trackerOf.get(l.tracker_id)!) }))}
              nextRings={nextRings}
              colour={strong(member.colour)}
            />
          </div>
        </section>

        <aside className="flex w-[36rem] shrink-0 flex-col gap-3">
          {cards.slice(0, 3).map(({ choice, status, small }) => (
            <div key={choice.id} className={`flex items-center gap-4 rounded-[1.375rem] px-6 py-4 ${status.next ? "bg-rail" : "bg-[color-mix(in_srgb,var(--color-met)_12%,white)]"}`}>
              <Emoji emoji={choice.icon || "💊"} className="size-14" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-2xl font-extrabold text-ink">{choice.name}</span>
                <span className="truncate text-base font-bold text-ink-muted">{small}</span>
              </span>
              <span className={`text-4xl font-extrabold tabular-nums ${status.next ? "text-ink" : "text-met"}`}>{status.next ? time(status.next) : "Now"}</span>
            </div>
          ))}
          <section aria-label="Today" className="flex min-h-0 flex-1 flex-col rounded-[1.375rem] bg-rail px-4 py-3">
            <FitList
              heading="Today"
              fallback={5}
              className="gap-2"
              rows={todayLogs.map((l) => {
                const t = trackerOf.get(l.tracker_id);
                const what = l.choice_name ?? (l.value !== null ? `${readingText(l.value)}${t?.unit ? (t.unit.startsWith("°") ? "°" : ` ${t.unit}`) : ""}` : (l.note ?? ""));
                const icon = l.choice_id ? (choices.find((c) => c.id === l.choice_id)?.icon ?? "💊") : t ? trackerEmoji(t) : "💊";
                return (
                  <li key={l.id}>
                    <Link href={href({ entry: l.id })} scroll={false} className="flex min-h-16 items-center gap-3.5 rounded-2xl bg-board px-4">
                      <span className="w-24 shrink-0 text-lg font-extrabold text-ink tabular-nums">{time(l.logged_at)}</span>
                      <Emoji emoji={icon} className="size-9" />
                      <span className="min-w-0 flex-1 truncate text-xl font-bold text-ink">{what}</span>
                      {l.amount ? <span className="shrink-0 text-lg font-bold text-ink-muted">{l.amount}</span> : null}
                    </Link>
                  </li>
                );
              })}
            />
          </section>
        </aside>
      </div>
      {editing ? <EntryDialog log={editing} tracker={trackerOf.get(editing.tracker_id)} closeHref={here} returnTo={here} timeValue={localTimeOf(new Date(editing.logged_at), timeZone)} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

function HealthChart({
  start,
  end,
  days,
  today,
  now,
  locale,
  timeZone,
  tracker,
  readings,
  doses,
  nextRings,
  colour,
}: {
  start: Date;
  end: Date;
  days: LocalDate[];
  today: LocalDate;
  now: Date;
  locale: string;
  timeZone: string;
  tracker: HealthTracker | null;
  readings: HealthLog[];
  doses: { at: Date; icon: string }[];
  nextRings: { at: Date; icon: string | null }[];
  colour: string;
}) {
  const W = 780;
  const H = 470;
  const X0 = 44;
  const XW = W - X0;
  const Y0 = 40;
  const YH = 320;
  const DOSE_Y = 410;
  const span = end.getTime() - start.getTime();
  const x = (t: Date) => X0 + (XW * (t.getTime() - start.getTime())) / span;
  const values = readings.map((r) => r.value!).filter(Number.isFinite);
  const alert = tracker?.alert_above ?? null;
  // Room around the readings and the alert line, in whole numbers.
  const around = alert !== null ? [...values, alert - 1.5, alert + 1.5] : values.length ? [...values.map((v) => v - 1), ...values.map((v) => v + 1)] : [0, 10];
  const lo = Math.floor(Math.min(...around));
  const top = Math.max(Math.ceil(Math.max(...around)), lo + 1);
  const y = (v: number) => Y0 + (YH * (top - v)) / (top - lo);
  const gridStep = Math.max(1, Math.ceil((top - lo) / 5));
  const grid: number[] = [];
  for (let v = top; v >= lo; v -= gridStep) grid.push(v);
  const points = [...readings].reverse().map((r) => ({ x: x(new Date(r.logged_at)), y: y(r.value!), t: readingText(r.value) }));
  const dayLabel = (d: LocalDate) => (d === today ? "Today" : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)));
  const short = (t: Date) => shortClockTime(t, locale, timeZone).replace(/\s?[ap]m$/, "");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" role="img" aria-label={tracker ? `${tracker.name} and doses` : "Doses"}>
      {tracker && alert !== null && alert < top ? <rect x={X0} y={y(top)} width={XW} height={y(Math.max(alert, lo)) - y(top)} fill="var(--color-alert-soft)" /> : null}
      {tracker
        ? grid.map((v) => (
            <g key={v}>
              <line x1={X0} y1={y(v)} x2={W} y2={y(v)} stroke="var(--color-frame)" strokeWidth={1.5} />
              <text x={X0 - 10} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={14} fontWeight={700} fill="var(--color-ink-muted)">
                {v}
                {tracker.unit?.startsWith("°") ? "°" : ""}
              </text>
            </g>
          ))
        : null}
      {days.map((d, i) => {
        const dx = X0 + (XW * i) / days.length;
        return (
          <g key={d}>
            <line x1={dx} y1={10} x2={dx} y2={H - 10} stroke="var(--color-check-border)" strokeOpacity={0.6} strokeWidth={1.5} />
            <text x={dx + 8} y={22} fontSize={15} fontWeight={800} fill={d === today ? "var(--color-now)" : "var(--color-ink-soft)"}>
              {dayLabel(d)}
            </text>
          </g>
        );
      })}
      {now > start && now < end ? <line x1={x(now)} y1={10} x2={x(now)} y2={H - 10} stroke="var(--color-now)" strokeWidth={3} /> : null}
      {points.length > 1 ? <polyline points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={colour} strokeWidth={4} strokeLinejoin="round" /> : null}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={7} fill={colour} stroke="white" strokeWidth={2} />
          <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--color-ink)">
            {p.t}
          </text>
        </g>
      ))}
      <line x1={X0} y1={DOSE_Y + 2} x2={W} y2={DOSE_Y + 2} stroke="var(--color-frame)" strokeWidth={1.5} />
      {doses.map((d, i) => {
        const cx = x(d.at);
        const src = emojiImage(d.icon);
        return (
          <g key={i}>
            {src ? <image href={src} x={cx - 15} y={DOSE_Y - 34} width={30} height={30} /> : null}
            <text x={cx} y={DOSE_Y + 22} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--color-ink-soft)">
              {short(d.at)}
            </text>
          </g>
        );
      })}
      {nextRings.map((n, i) => (
        <circle key={i} cx={x(n.at)} cy={DOSE_Y - 19} r={16} fill="none" stroke={colour} strokeWidth={3} strokeDasharray="5 4" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Fixing or removing an entry
// ---------------------------------------------------------------------------

function EntryDialog({ log, tracker, closeHref, returnTo, timeValue }: { log: HealthLog; tracker: HealthTracker | undefined; closeHref: string; returnTo: string; timeValue: string }) {
  const field = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-xl text-ink outline-none focus:border-accent";
  const title = log.choice_name ?? tracker?.name ?? "Entry";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.35)]" />
      <form action={updateHealthLog} role="dialog" aria-label={title} className="relative flex w-[38rem] max-w-[92vw] flex-col gap-4 rounded-[var(--radius-card)] bg-board p-7 shadow-2xl">
        <input type="hidden" name="id" value={log.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex items-center gap-3">
          <h2 className="flex-1 truncate text-2xl font-extrabold text-ink">{title}</h2>
          <Link href={closeHref} scroll={false} aria-label="Close" className="flex size-12 items-center justify-center rounded-full bg-rail text-ink">
            <X size="1.25rem" weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-ink-muted">When</span>
            <input type="time" name="time" defaultValue={timeValue} className={`${field} w-44`} />
          </label>
          {log.choice_id !== null || log.amount !== null ? (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-ink-muted">Amount</span>
              <input name="amount" defaultValue={log.amount ?? ""} maxLength={20} className={`${field} w-40`} />
            </label>
          ) : null}
          {log.value !== null ? (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-ink-muted">{tracker?.name ?? "Reading"}</span>
              <input name="value" type="number" inputMode="decimal" step="0.1" defaultValue={log.value} className={`${field} w-36`} />
            </label>
          ) : null}
          {log.note !== null ? (
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-bold text-ink-muted">Note</span>
              <input name="note" defaultValue={log.note} maxLength={200} className={field} />
            </label>
          ) : null}
        </div>
        <div className="flex gap-2.5">
          <button className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-accent px-6 text-lg font-bold text-white">Save</button>
          <button formAction={deleteHealthLog} className="ml-auto flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-4 text-lg font-bold text-danger">
            Remove
          </button>
        </div>
      </form>
    </div>
  );
}
