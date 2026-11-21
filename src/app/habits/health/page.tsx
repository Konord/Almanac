import { Suspense } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, GearSix, X } from "@phosphor-icons/react/dist/ssr";
import { Sheet } from "@/components/sheet";
import { TimeField } from "@/components/touch-pickers";
import { FitList } from "@/components/fit-list";
import {
  ActionLink,
  AppFrame,
  EmptyState,
  Emoji,
  editorInputClass,
  fieldLabelClass,
  firstParam,
  LoadingOutline,
  primaryActionClass,
  ScreenHeader,
  Segmented,
  secondaryActionClass,
} from "@/components/ui";
import { soft, strong } from "@/lib/colours";
import { emojiImage } from "@/lib/emoji";
import { readingText } from "@/lib/health";
import { requireHousehold } from "@/lib/household";
import { addDays, isLocalDate, localDateOf, localTimeOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { shortClockTime } from "@/lib/time-text";
import { deleteHealthLog, updateHealthLog } from "../actions";
import { choiceStatus, loadHealthLogs, loadLastDoses, loadTrackers, type HealthLog, type HealthTracker } from "../health-data";
import { HealthLogSheet } from "./log-sheet";
import { trackerEmoji } from "./tracker-emoji";

/**
 * Health (2026-11-12; Glance look 2026-11-15, g-final-health): one person
 * per page, paged with the header arrows. Three cards: the last three days
 * (a reading like temperature with its alert shading and the doses along
 * the bottom, or a medicine's daily check-in), the medicines with "Log it",
 * and today's entries (tap one to fix or remove it). Nothing here
 * diagnoses: it only shows what was logged.
 *
 * ?member=<id>     whose page
 * ?end=YYYY-MM-DD  the last of the three days (today by default)
 * ?chart=<id>      what the chart shows: a reading tracker or a medicine choice
 * ?entry=<id>      fix or remove an entry
 * ?log=new|<id>    the log sheet (new = pick a tracker first); &choice=<id>
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

/** The mock's `.card` and `.h2`. */
const cardClass = "flex min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised lg:min-h-0";
const roundArrow = "flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink";

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
  const index = Math.max(
    0,
    members.findIndex((m) => m.id === firstParam(params.member)),
  );
  const member = members[index];

  const state: Record<string, string | null> = {
    member: member && index > 0 ? member.id : null,
    end: end === today ? null : end,
    chart: firstParam(params.chart) ?? null,
  };
  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...changes })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/habits/health?${s}` : "/habits/health";
  };
  const personHref = (i: number) => href({ member: i > 0 ? members[i].id : null, chart: null });
  const prev = members[index - 1];
  const next = members[index + 1];

  const header = (
    <ScreenHeader
      title="Habits"
      sub={member?.name}
      nav={
        members.length > 1 ? (
          <>
            {prev ? (
              <Link href={personHref(index - 1)} aria-label={`Previous person: ${prev.name}`} title={prev.name} className={roundArrow}>
                <CaretLeft size="1.5rem" weight="bold" aria-hidden />
              </Link>
            ) : (
              <span className={`${roundArrow} opacity-30`} aria-hidden>
                <CaretLeft size="1.5rem" weight="bold" />
              </span>
            )}
            {next ? (
              <Link href={personHref(index + 1)} aria-label={`Next person: ${next.name}`} title={next.name} className={roundArrow}>
                <CaretRight size="1.5rem" weight="bold" aria-hidden />
              </Link>
            ) : (
              <span className={`${roundArrow} opacity-30`} aria-hidden>
                <CaretRight size="1.5rem" weight="bold" />
              </span>
            )}
          </>
        ) : null
      }
      tabs={
        <Segmented
          label="Habits or health"
          options={[
            { href: "/habits", label: "Habits", active: false },
            { href: "/habits/health", label: "Health", active: true },
          ]}
        />
      }
      action={
        <>
          <Link href="/habits/manage?tab=health" aria-label="Habit Manager, health trackers" className={secondaryActionClass}>
            <GearSix size="1.5rem" weight="bold" aria-hidden />
            Manage
          </Link>
          {member ? (
            <ActionLink href={href({ log: "new" })} scroll={false}>
              Add an entry
            </ActionLink>
          ) : null}
        </>
      }
    />
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
  const inWindow = (l: HealthLog) => new Date(l.logged_at) >= windowStart && new Date(l.logged_at) < windowEnd;
  const dayName = (d: LocalDate) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const whenText = (d: Date) => (localDateOf(d, timeZone) === today ? time(d) : `${new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(d)} ${time(d)}`);

  // What the chart shows: a reading tracker, or one medicine's daily check-in.
  // By default the first reading with entries in these days, then the first
  // medicine taken in these days, then whatever there is.
  const numbers = mine.filter((t) => t.kind === "number");
  const options: { id: string; name: string; icon: string }[] = [
    ...numbers.map((t) => ({ id: t.id, name: t.name, icon: trackerEmoji(t) })),
    ...choices.map((c) => ({ id: c.id, name: c.name, icon: c.icon || "💊" })),
  ];
  const picked =
    options.find((o) => o.id === state.chart)?.id ??
    numbers.find((t) => logs.some((l) => l.tracker_id === t.id && l.value !== null && inWindow(l)))?.id ??
    choices.find((c) => logs.some((l) => l.choice_id === c.id && inWindow(l)))?.id ??
    options[0]?.id ??
    null;
  const chartTracker = numbers.find((t) => t.id === picked) ?? null;
  const chartChoice = choices.find((c) => c.id === picked) ?? null;
  const readings = chartTracker ? logs.filter((l) => l.tracker_id === chartTracker.id && l.value !== null && inWindow(l)) : [];
  const latest = chartTracker ? logs.find((l) => l.tracker_id === chartTracker.id && l.value !== null) : undefined;
  const windowDoses = logs.filter((l) => l.choice_id !== null || trackerOf.get(l.tracker_id)?.kind === "medicine").filter(inWindow);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));

  // Each medicine choice: when it was last taken and when the next dose is allowed.
  const cards = choices.map((c) => {
    const s = choiceStatus(c, member.id, doses, now, dayStart);
    const small = [s.last ? `last ${whenText(s.last)}` : "not taken yet", c.max_per_day ? `${s.today}/${c.max_per_day} today` : null].filter(Boolean).join(" · ");
    return {
      choice: c,
      tracker: medicines.find((t) => t.choices.includes(c))!,
      status: s,
      small,
    };
  });
  const nextRings = cards.filter((c) => c.status.next && c.status.next < windowEnd).map((c) => ({ at: c.status.next!, icon: c.choice.icon }));

  // Today's entries, newest first.
  const todayLogs = logs.filter((l) => new Date(l.logged_at) >= dayStart && new Date(l.logged_at) <= now);
  const editing = logs.find((l) => l.id === firstParam(params.entry)) ?? null;
  const here = href({});
  const logParam = firstParam(params.log);

  const rangeTitle =
    start.slice(0, 7) === end.slice(0, 7)
      ? `${fmt(start, locale, { month: "short", day: "numeric" })} – ${fmt(end, locale, { day: "numeric" })}`
      : `${fmt(start, locale, { month: "short", day: "numeric" })} – ${fmt(end, locale, { month: "short", day: "numeric" })}`;
  const laterEnd = addDays(end, DAYS) >= today ? null : addDays(end, DAYS);

  return (
    <>
      {header}
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* The last three days */}
        <section aria-label="Last three days" className={`${cardClass} gap-3`}>
          <div className="flex min-h-[var(--touch-target)] shrink-0 items-center gap-3">
            <h2 className="flex min-w-0 flex-1 items-baseline gap-3 text-[1.75rem] font-bold text-ink">
              <span className="shrink-0">{end === today ? "Last three days" : "Three days"}</span>
              <span className="truncate text-[1.25rem] font-semibold text-ink-muted">{chartTracker ? chartTracker.name : chartChoice ? `${chartChoice.name} check-in` : ""}</span>
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {options.length > 1 ? (
              <nav aria-label="Show on the chart" className="flex min-w-0 flex-1 gap-2">
                {options.slice(0, 6).map((o) => (
                  <Link
                    key={o.id}
                    href={href({ chart: o.id })}
                    scroll={false}
                    aria-label={`Show ${o.name}`}
                    title={o.name}
                    aria-current={o.id === picked ? "true" : undefined}
                    className={`flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full border-2 ${o.id === picked ? "border-ink bg-board" : "border-transparent bg-panel"}`}
                  >
                    <Emoji emoji={o.icon} className="size-[1.75rem]" />
                  </Link>
                ))}
              </nav>
            ) : (
              <span className="flex-1" />
            )}
            <Link href={href({ end: addDays(end, -DAYS), entry: null })} scroll={false} aria-label="Three days earlier" className={roundArrow}>
              <CaretLeft size="1.5rem" weight="bold" aria-hidden />
            </Link>
            <span className="tabular min-w-[8.5rem] text-center text-[1.25rem] font-bold text-ink">{rangeTitle}</span>
            {end < today ? (
              <Link href={href({ end: laterEnd, entry: null })} scroll={false} aria-label="Three days later" className={roundArrow}>
                <CaretRight size="1.5rem" weight="bold" aria-hidden />
              </Link>
            ) : (
              <span className={`${roundArrow} opacity-30`} aria-hidden>
                <CaretRight size="1.5rem" weight="bold" />
              </span>
            )}
          </div>
          {chartTracker && latest ? (
            <p className="flex shrink-0 items-baseline gap-3">
              <span
                className="text-[2.5rem] leading-none font-extrabold tabular-nums"
                style={{
                  color: chartTracker.alert_above !== null && latest.value! > chartTracker.alert_above ? "var(--color-now-on-tint)" : "var(--color-ink)",
                }}
              >
                {readingText(latest.value)}
                {chartTracker.unit?.startsWith("°") ? "°" : chartTracker.unit ? ` ${chartTracker.unit}` : ""}
              </span>
              <span className="text-[1.25rem] font-bold text-ink-muted">latest, {whenText(new Date(latest.logged_at))}</span>
            </p>
          ) : null}
          <div className="relative min-h-[20rem] flex-1">
            {chartChoice ? (
              <CheckIn
                days={days}
                today={today}
                dayName={dayName}
                count={(d) => windowDoses.filter((l) => l.choice_id === chartChoice.id && localDateOf(new Date(l.logged_at), timeZone) === d).length}
                next={cards.find((c) => c.choice.id === chartChoice.id)?.status.next ?? null}
                time={time}
                colour={member.colour}
              />
            ) : options.length === 0 ? (
              <p className="py-3 text-[1.25rem] font-bold text-ink-muted">Nothing to chart for {member.name} yet.</p>
            ) : (
              <HealthChart
                start={windowStart}
                end={windowEnd}
                days={days}
                today={today}
                now={now}
                locale={locale}
                timeZone={timeZone}
                tracker={chartTracker}
                readings={readings}
                doses={windowDoses.map((l) => ({
                  at: new Date(l.logged_at),
                  icon: l.choice_id ? choices.find((c) => c.id === l.choice_id)?.icon || "💊" : trackerEmoji(trackerOf.get(l.tracker_id)!),
                }))}
                nextRings={nextRings}
                colour={strong(member.colour)}
              />
            )}
          </div>
        </section>

        {/* Medicines */}
        <section aria-label="Medicines" className={cardClass}>
          <FitList
            heading={<span className="text-[1.75rem]">Medicines</span>}
            fallback={5}
            empty={
              <li className="py-3 text-[1.25rem] font-bold text-ink-muted">
                No medicines for {member.name}.{" "}
                <Link href="/habits/manage?tab=health" className="text-ink underline">
                  Add one
                </Link>
              </li>
            }
            rows={cards.map(({ choice, tracker, status, small }) => (
              <li key={choice.id} className="flex min-h-[4.5rem] shrink-0 items-center gap-[0.7rem] border-b border-frame py-1 last:border-b-0">
                <Emoji emoji={choice.icon || "💊"} className="size-[2.25rem]" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex min-w-0 items-baseline gap-[0.6rem]">
                    <span className="truncate text-[1.5rem] font-extrabold text-ink">{choice.name}</span>
                    {choice.amounts[member.id] ? <span className="shrink-0 text-[1.15rem] font-bold text-ink-muted">{choice.amounts[member.id]}</span> : null}
                  </span>
                  <span className="truncate text-[1.15rem] font-bold text-ink-muted">
                    <span
                      style={{
                        color: status.next || status.atMost ? "var(--color-now-on-tint)" : "var(--color-success)",
                      }}
                    >
                      {status.next ? `next ${whenText(status.next)}` : status.atMost ? "most for today" : "OK now"}
                    </span>
                    {` · ${small}`}
                  </span>
                </span>
                <Link href={href({ log: tracker.id, choice: choice.id })} scroll={false} className={`${secondaryActionClass} px-[1.5rem]`}>
                  Log it
                </Link>
              </li>
            ))}
          />
        </section>

        {/* Today */}
        <section aria-label="Today" className={cardClass}>
          <FitList
            heading={<span className="text-[1.75rem]">Today</span>}
            fallback={8}
            empty={<li className="py-3 text-[1.25rem] font-bold text-ink-muted">Nothing logged yet today</li>}
            rows={todayLogs.map((l) => {
              const t = trackerOf.get(l.tracker_id);
              const what = l.choice_name ?? (l.value !== null ? `${t?.name ?? ""} ${readingText(l.value)}${t?.unit ? (t.unit.startsWith("°") ? "°" : ` ${t.unit}`) : ""}` : (l.note ?? ""));
              const icon = l.choice_id ? (choices.find((c) => c.id === l.choice_id)?.icon ?? "💊") : t ? trackerEmoji(t) : "💊";
              return (
                <li key={l.id} className="shrink-0 border-b border-frame">
                  <Link href={href({ entry: l.id })} scroll={false} aria-label={`${time(l.logged_at)} ${what}. Fix or remove`} className="flex min-h-[3.6rem] items-center gap-[0.7rem]">
                    <span className="min-w-[6.5rem] shrink-0 text-[1.25rem] font-extrabold text-ink-muted tabular-nums">{time(l.logged_at)}</span>
                    <Emoji emoji={icon} className="size-8" />
                    <span className="min-w-0 flex-1 truncate text-[1.35rem] font-bold text-ink">{what}</span>
                    {l.amount ? <span className="shrink-0 text-[1.15rem] font-bold text-ink-muted">{l.amount}</span> : null}
                  </Link>
                </li>
              );
            })}
          />
        </section>
      </div>

      {editing ? <EntryDialog log={editing} tracker={trackerOf.get(editing.tracker_id)} closeHref={here} returnTo={here} timeValue={localTimeOf(new Date(editing.logged_at), timeZone)} /> : null}
      {logParam && mine.length ? (
        <Sheet title={logParam === "new" ? `Add an entry for ${member.name}` : `Log for ${member.name}`} closeHref={here}>
          <HealthLogSheet
            trackers={mine}
            members={members}
            memberId={member.id}
            trackerId={logParam === "new" ? null : logParam}
            choiceId={firstParam(params.choice) ?? null}
            logs={doses}
            now={now.toISOString()}
            dayStart={dayStart.toISOString()}
            locale={locale}
            timeZone={timeZone}
            closeHref={here}
          />
        </Sheet>
      ) : null}
    </>
  );
}

const fmt = (d: LocalDate, locale: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

// ---------------------------------------------------------------------------
// A medicine's check-in: one bar a day (the mock's chart)
// ---------------------------------------------------------------------------

function CheckIn({
  days,
  today,
  dayName,
  count,
  next,
  time,
  colour,
}: {
  days: LocalDate[];
  today: LocalDate;
  dayName: (d: LocalDate) => string;
  count: (d: LocalDate) => number;
  next: Date | null;
  time: (d: Date) => string;
  colour: string;
}) {
  return (
    <div className="absolute inset-0 flex items-end gap-[0.8rem] pt-2" role="img" aria-label={days.map((d) => `${dayName(d)}: ${count(d) ? `taken ${count(d)}` : "not taken"}`).join(", ")}>
      {days.map((d) => {
        const n = count(d);
        const isToday = d === today;
        const label = n ? (n > 1 ? `Taken ×${n}` : "Taken") : isToday ? (next ? `Next ${time(next)}` : "Not yet") : "Not taken";
        return (
          <div key={d} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[0.4rem]">
            <span className="text-[1.5rem] font-extrabold text-ink">{label}</span>
            <span
              className="w-full rounded-t-[var(--radius)] rounded-b-[0.4rem] border-2"
              style={
                n
                  ? {
                      height: `${Math.min(100, 55 + 15 * n)}%`,
                      background: soft(colour),
                      borderColor: strong(colour),
                    }
                  : {
                      height: "28%",
                      background: "var(--color-board)",
                      borderStyle: "dashed",
                      borderColor: isToday ? "var(--color-now)" : "var(--color-check-border)",
                    }
              }
            />
            <span className={`text-[1.25rem] font-bold ${isToday ? "text-now-on-tint" : "text-ink-muted"}`}>{dayName(d)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A reading's chart (with the doses along the bottom)
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
  // Font sizes are in chart units: the chart is drawn about 1.2× bigger on a
  // 2560 screen, so 20 here stays above the 18px-at-1080 floor.
  const W = 780;
  const H = 520;
  const X0 = 56;
  const XW = W - X0;
  const Y0 = 48;
  const YH = 340;
  const DOSE_Y = 450;
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
  const points = [...readings].reverse().map((r) => ({
    x: x(new Date(r.logged_at)),
    y: y(r.value!),
    t: readingText(r.value),
  }));
  const dayLabel = (d: LocalDate) =>
    d === today
      ? "Today"
      : new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${d}T12:00:00Z`));
  const short = (t: Date) => shortClockTime(t, locale, timeZone).replace(/\s?[ap]m$/, "");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" className="absolute inset-0 h-full w-full" role="img" aria-label={tracker ? `${tracker.name} and doses` : "Doses"}>
      {tracker && alert !== null && alert < top ? <rect x={X0} y={y(top)} width={XW} height={y(Math.max(alert, lo)) - y(top)} fill="var(--color-alert-soft)" /> : null}
      {tracker && alert !== null && alert < top && alert > lo ? (
        <text x={X0 + 8} y={y(alert) - 8} fontSize={18} fontWeight={700} fill="var(--color-now-on-tint)">
          above {alert}
          {tracker.unit?.startsWith("°") ? "°" : ""}
        </text>
      ) : null}
      {tracker
        ? grid.map((v) => (
            <g key={v}>
              <line x1={X0} y1={y(v)} x2={W} y2={y(v)} stroke="var(--color-frame)" strokeWidth={1.5} />
              <text x={X0 - 10} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={20} fontWeight={700} fill="var(--color-ink-muted)">
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
            <text x={dx + 10} y={28} fontSize={20} fontWeight={800} fill={d === today ? "var(--color-now-on-tint)" : "var(--color-ink-soft)"}>
              {dayLabel(d)}
            </text>
          </g>
        );
      })}
      {now > start && now < end ? <line x1={x(now)} y1={10} x2={x(now)} y2={H - 10} stroke="var(--color-now)" strokeWidth={3} /> : null}
      {points.length > 1 ? <polyline points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={colour} strokeWidth={4} strokeLinejoin="round" /> : null}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={8} fill={colour} stroke="white" strokeWidth={2} />
          <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize={20} fontWeight={800} fill="var(--color-ink)">
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
            {src ? <image href={src} x={cx - 17} y={DOSE_Y - 38} width={34} height={34} /> : null}
            <text x={cx} y={DOSE_Y + 26} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--color-ink-soft)">
              {short(d.at)}
            </text>
          </g>
        );
      })}
      {nextRings.map((n, i) => (
        <circle key={i} cx={x(n.at)} cy={DOSE_Y - 21} r={18} fill="none" stroke={colour} strokeWidth={3} strokeDasharray="5 4" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Fixing or removing an entry
// ---------------------------------------------------------------------------

function EntryDialog({ log, tracker, closeHref, returnTo, timeValue }: { log: HealthLog; tracker: HealthTracker | undefined; closeHref: string; returnTo: string; timeValue: string }) {
  const title = log.choice_name ?? tracker?.name ?? "Entry";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgba(30,35,45,0.28)]" />
      <form action={updateHealthLog} role="dialog" aria-label={title} className="relative flex w-[44rem] max-w-[92vw] flex-col gap-5 rounded-[var(--radius-card)] bg-board px-8 py-7 shadow-raised">
        <input type="hidden" name="id" value={log.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex items-center gap-3">
          {tracker ? <Emoji emoji={trackerEmoji(tracker)} className="size-[2.5rem]" /> : null}
          <h2 className="min-w-0 flex-1 truncate text-[1.75rem] font-bold text-ink">{title}</h2>
          <Link href={closeHref} scroll={false} aria-label="Close" className={roundArrow}>
            <X size="1.5rem" weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>When</span>
            <TimeField name="time" defaultValue={timeValue} step={5} aria-label="When" className="w-52!" />
          </label>
          {log.choice_id !== null || log.amount !== null ? (
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Amount</span>
              <input name="amount" defaultValue={log.amount ?? ""} maxLength={20} className={`${editorInputClass} w-48`} />
            </label>
          ) : null}
          {log.value !== null ? (
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>{tracker?.name ?? "Reading"}</span>
              <input name="value" type="number" inputMode="decimal" step="0.1" defaultValue={log.value} className={`${editorInputClass} w-40`} />
            </label>
          ) : null}
          {log.note !== null ? (
            <label className="flex min-w-0 basis-full flex-col gap-1.5">
              <span className={fieldLabelClass}>Note</span>
              <input name="note" defaultValue={log.note} maxLength={200} className={editorInputClass} />
            </label>
          ) : null}
        </div>
        <div className="flex gap-2.5">
          <button className={primaryActionClass}>Save</button>
          <button formAction={deleteHealthLog} className="ml-auto flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-4 text-lg font-bold text-danger">
            Remove
          </button>
        </div>
      </form>
    </div>
  );
}
