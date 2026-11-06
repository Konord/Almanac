import { Suspense } from "react";
import Link from "next/link";
import { Broom, CalendarDots, Check, CheckCircle, Clock, GearSix, Lightning, Timer } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Chips, Emoji, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { pickForNow, weekdaysLabel } from "@/lib/chore-blocks";
import { daysBetween } from "@/lib/chores";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { shortTime } from "../calendar/views";
import { CHORE_LIST_LIMIT, choreMinutes, loadBlocks, planChores, syncChoreTodos, type PlannedTodo } from "./blocks";
import { loadChores, loadTodos, soonChores } from "./data";
import { markChoreDone } from "./actions";
import { BlockItemRow, RoundRow, SoonRow, TodoRow, dayLabel } from "./rows";
import type { BlockDay } from "@/lib/chore-blocks";

/** How many days back "Done lately" looks. */
const RECENT_DAYS = 7;
/** Chores shown in a block (the rest are "+N more"), and block days in the tab row. */
const ITEMS_PER_BLOCK = 7;
const BLOCK_TABS = 5;

const NOW_MINUTES = ["10", "20", "30", "60"];
const ENERGY: Record<string, ("small" | "medium" | "big")[]> = {
  low: ["small"],
  some: ["small", "medium"],
  lots: ["small", "medium", "big"],
};

/**
 * Chores: the chore time coming up this week and what's going in it (tick
 * off, or swap one for another), the chores waiting for room, a "Chore
 * now" picker for a spare moment, what's coming up and what was done.
 * A chore never sits on the calendar itself: see src/lib/chore-blocks.ts.
 */
export default function ChoresPage(props: PageProps<"/chores">) {
  return (
    <AppFrame section="chores">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Chores searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Chores({ searchParams }: { searchParams: PageProps<"/chores">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { locale, timeZone } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const { chores, rounds, members } = await loadChores(today, timeZone);
  await syncChoreTodos(household, chores);
  const [{ todos }, blocks] = await Promise.all([loadTodos(), loadBlocks()]);
  const plan = planChores(blocks, chores, todos, today);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const soon = soonChores(chores);
  const recent = rounds.filter((r) => daysBetween(r.completed_on, today) <= RECENT_DAYS);
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  // Chore time: one block day at a time, picked from a row of tabs. It
  // opens on the day asked for (tapping a block on Today), else the next one.
  const tabs = plan.days.slice(0, BLOCK_TABS);
  const from = firstParam(params.date) ?? today;
  const asked = Number(firstParam(params.bi) ?? tabs.findIndex((d) => d.date >= from));
  const chosen = Math.min(Math.max(0, asked), Math.max(0, tabs.length - 1));
  const returnTo = `/chores?bi=${chosen}`;

  // Chore now: what fits the time and energy, from what's due or coming up soon.
  const nowMinutes = firstParam(params.now);
  const energy = firstParam(params.energy) ?? "some";
  const candidates = [...chores.filter((c) => c.active && c.timing.state === "due"), ...soon].map((c) => ({
    id: c.id,
    template_id: c.id,
    minutes: choreMinutes(c),
    due_date: c.timing.dueOn,
    not_before: null,
    weight: c.importance === "high" ? 2 : c.importance === "low" ? 0 : 1,
    size: c.size,
  }));
  const picks = nowMinutes ? pickForNow(candidates, Number(nowMinutes), ENERGY[energy] ?? ENERGY.some).slice(0, 3) : [];

  const waiting = plan.left;
  const time = (t: string) => shortTime(zonedToUtc(today, t, timeZone), household);

  return (
    <>
      <ScreenHeader title="Chores">
        <HeaderClock locale={locale} timeZone={timeZone} />
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          <SoftLink href="/chores/blocks">
            <Clock size="1.5rem" aria-hidden />
            Chore time
          </SoftLink>
          <SoftLink href="/chores/manage">
            <GearSix size="1.5rem" aria-hidden />
            Set up chores
          </SoftLink>
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Chore time this week" icon={Broom} tint="orange" className="lg:row-span-2">
          {plan.days.length === 0 ? (
            <div className="flex flex-col gap-3 py-3">
              <p className="text-xl text-ink-muted">
                No chore time set aside yet, so chores that come due go on the to-do list, {CHORE_LIST_LIMIT} at a time.
              </p>
              <SoftLink href="/chores/blocks" className="self-start">
                <Clock size="1.5rem" aria-hidden />
                Set aside chore time
              </SoftLink>
            </div>
          ) : (
            <>
              <nav className="flex flex-wrap gap-2 pt-1 pb-3" aria-label="Chore time this week">
                {tabs.map((d, i) => (
                  <Link
                    key={`${d.block.id}|${d.date}`}
                    href={`/chores?bi=${i}`}
                    scroll={false}
                    aria-current={i === chosen ? "true" : undefined}
                    className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-full border-2 px-4 text-lg ${
                      i === chosen ? "border-ink bg-rail font-bold" : "border-frame bg-board"
                    } text-ink`}
                  >
                    <Emoji emoji={d.block.icon ?? "🧹"} className="size-6" />
                    {dayLabel(d.date, today, household)}
                  </Link>
                ))}
              </nav>
              {tabs[chosen] ? <BlockDayPanel day={tabs[chosen]} today={today} household={household} time={time} returnTo={returnTo} /> : null}
            </>
          )}
        </Card>

        <Card title="Chore now" icon={Lightning} tint="purple">
          {nowMinutes ? (
            <>
              <p className="flex items-center justify-between gap-2 text-base font-bold text-ink-muted">
                {nowMinutes} min, {energy === "low" ? "low" : energy === "lots" ? "lots of" : "some"} energy
                <Link href={`/chores?bi=${chosen}`} scroll={false} className="flex min-h-[var(--touch-target)] items-center text-accent">
                  Change
                </Link>
              </p>
              {picks.length === 0 ? (
                <p className="text-lg text-ink-muted">Nothing fits. Enjoy the break.</p>
              ) : (
                <ul className="flex flex-col">
                  {picks.map((p) => {
                    const chore = choreById.get(p.id)!;
                    return (
                      <li key={p.id} className="flex min-h-14 items-center gap-2.5 border-b border-panel last:border-0">
                        <Emoji emoji={chore.icon ?? "🧹"} className="size-8" />
                        <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{chore.name}</span>
                        <span className="shrink-0 text-sm font-bold text-ink-muted">{p.minutes} min</span>
                        <form action={markChoreDone}>
                          <input type="hidden" name="templateId" value={chore.id} />
                          <input type="hidden" name="name" value={chore.name} />
                          <input type="hidden" name="memberId" value={chore.default_assignee_id ?? ""} />
                          <input type="hidden" name="returnTo" value={`${returnTo}&now=${nowMinutes}&energy=${energy}`} />
                          <button aria-label={`Done: ${chore.name}`} className="flex size-[var(--touch-target)] items-center justify-center">
                            <span className="flex size-8 items-center justify-center rounded-full border-[2.5px] border-check-border text-check-border hover:border-success hover:text-success">
                              <Check size="1rem" weight="bold" aria-hidden />
                            </span>
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <form action="/chores" className="flex flex-col gap-3">
              <input type="hidden" name="bi" value={chosen} />
              <Chips name="now" label="I've got (min)" defaultValue="20" options={NOW_MINUTES.map((m) => ({ value: m, label: m }))} />
              <Chips
                name="energy"
                label="Energy"
                defaultValue={energy}
                options={[
                  { value: "low", label: "Low" },
                  { value: "some", label: "Some" },
                  { value: "lots", label: "Lots" },
                ]}
              />
              <div>
                <Button variant="secondary">Pick for me</Button>
              </div>
            </form>
          )}
        </Card>

        <Card title="Coming up" icon={CalendarDots} tint="blue">
          {soon.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">Nothing in the next two weeks.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {soon.slice(0, 5).map((c) => (
                <SoonRow key={c.id} chore={c} today={today} household={household} />
              ))}
            </ul>
          )}
          {soon.length > 5 ? <p className="mt-auto text-lg font-bold text-ink-muted">+{soon.length - 5} more</p> : null}
        </Card>

        <Card
          title="Waiting for room"
          icon={Timer}
          tint="pink"
          aside={<span className="text-lg font-bold text-ink-muted">{waiting.length}</span>}
        >
          {waiting.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">Every chore that&apos;s due has a place.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {waiting.slice(0, 3).map((t) => (
                <TodoRow key={t.id} todo={t} members={memberById} today={today} household={household} returnTo={returnTo} />
              ))}
            </ul>
          )}
          {waiting.length > 3 ? (
            <Link href="/chores/blocks" className="mt-auto text-lg font-bold text-accent">
              +{waiting.length - 3} more · add chore time?
            </Link>
          ) : null}
        </Card>

        <Card title="Done lately" icon={CheckCircle} tint="teal">
          {recent.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">Nothing yet this week.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {recent.slice(0, 4).map((r) => (
                <RoundRow
                  key={r.id}
                  round={r}
                  chore={choreById.get(r.template_id)}
                  members={memberById}
                  today={today}
                  household={household}
                  returnTo={returnTo}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

/** One block on one day: when, how full, and its chores. */
function BlockDayPanel({
  day,
  today,
  household,
  time,
  returnTo,
}: {
  day: BlockDay<PlannedTodo>;
  today: LocalDate;
  household: Household;
  time: (t: string) => string;
  returnTo: string;
}) {
  const { block, items, date, usedMinutes } = day;
  const shown = items.slice(0, ITEMS_PER_BLOCK);
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3">
        <Emoji emoji={block.icon ?? "🧹"} className="size-10" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xl font-extrabold text-ink">{block.name}</span>
          <span className="text-sm font-bold text-ink-muted">
            {dayLabel(date, today, household)} · {time(block.start_time)} ·{" "}
            {block.kind === "closed" ? `${block.minutes} min` : `${usedMinutes} of ${block.minutes} min`}
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-lg text-ink-muted">
          {block.kind === "closed" ? "Not due this time." : `Nothing due yet. ${weekdaysLabel(block.weekdays)}, as things come due.`}
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((t) => (
            <BlockItemRow key={t.id} todo={t} minutes={t.minutes} date={date} canSwap={block.kind === "open"} returnTo={returnTo} />
          ))}
        </ul>
      )}
      {items.length > shown.length ? <p className="mt-auto text-base font-bold text-ink-muted">+{items.length - shown.length} more</p> : null}
    </section>
  );
}
