import { Suspense } from "react";
import Link from "next/link";
import { Broom, CalendarDots, CheckCircle, Clock, Plus, Timer } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Emoji, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { HeaderClock } from "@/components/header-clock";
import { IMPORTANCE_LABEL, SIZE_LABEL, daysBetween, describeRule } from "@/lib/chores";
import { weekdaysLabel, type BlockDay } from "@/lib/chore-blocks";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf, zonedToUtc, type LocalDate } from "@/lib/time";
import { shortTime } from "../calendar/views";
import { Pager, pageOf } from "../meals/parts";
import { HeadsUpEditor, loadHeadsUps } from "../heads-ups/editor";
import { CHORE_LIST_LIMIT, loadBlocks, planChores, syncChoreTodos, type PlannedTodo } from "./blocks";
import { loadChores, loadTodos, soonChores, type ChoreWithTiming } from "./data";
import { removeChore, setChoreActive, updateChore } from "./actions";
import { ChoreFields } from "./forms";
import { BlockItemRow, RoundRow, SoonRow, TodoRow, dayLabel, dayPhrase } from "./rows";

/** How many days back "Done lately" looks. */
const RECENT_DAYS = 7;
/** Rows that fit in one chore list, and in each of the small lists, without scrolling. */
const CHORES_PER_PAGE = 9;
const WAITING_SHOWN = 3;
const SOON_SHOWN = 3;
const RECENT_SHOWN = 2;
/** Chores shown in a chore time panel (the rest are "+N more"). */
const ITEMS_PER_BLOCK = 8;

/**
 * Chores: every chore the household has, grouped by how often it comes
 * back (tap one to change it), next to what's coming up, what's due but
 * waiting for room in chore time, and what was done lately.
 * Chores run in the background: once made, each one comes due by its
 * rule and makes a to-do. See src/lib/chores.ts and src/lib/chore-blocks.ts.
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
  const waiting = plan.left;
  const recent = rounds.filter((r) => daysBetween(r.completed_on, today) <= RECENT_DAYS);
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  // Which page each of the three chore lists is on, kept in the address.
  const pages: Record<string, string> = {};
  for (const k of ["p0", "p1", "p2"]) {
    const v = firstParam(params[k]);
    if (v) pages[k] = v;
  }
  const here = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...pages, ...extra }).toString();
    return q ? `/chores?${q}` : "/chores";
  };
  const returnTo = here();

  // Chores kept to some times of year go under Seasonal.
  const seasonal = (c: ChoreWithTiming) => Boolean(c.season_start || c.only_seasons?.length || c.only_months?.length);
  const groups: { title: string; chores: ChoreWithTiming[] }[] = [
    { title: "Every week or so", chores: chores.filter((c) => !seasonal(c) && (c.repeat_unit === "day" || c.repeat_unit === "week")) },
    { title: "Every month or more", chores: chores.filter((c) => !seasonal(c) && (c.repeat_unit === "month" || c.repeat_unit === "year")) },
    { title: "Seasonal", chores: chores.filter(seasonal) },
  ];

  // Tapping a chore opens it for editing; tapping chore time on Today opens that day's chores.
  const editing = chores.find((c) => c.id === firstParam(params.edit));
  const blockDate = firstParam(params.date);
  const blockDays = blockDate ? plan.days.filter((d) => d.date === blockDate) : [];
  const time = (t: string) => shortTime(zonedToUtc(today, t, timeZone), household);

  return (
    <>
      <ScreenHeader title="Chores">
        <HeaderClock locale={locale} timeZone={timeZone} />
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          <SoftLink href="/chores/add">
            <Plus size="1.5rem" aria-hidden />
            Add a chore
          </SoftLink>
          <SoftLink href="/chores/blocks">
            <Clock size="1.5rem" aria-hidden />
            Chore time
          </SoftLink>
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        {chores.length === 0 ? (
          <Card title="Your chores" icon={Broom} tint="blue" className="lg:col-span-3 lg:row-span-3">
            <div className="flex flex-col items-start gap-4 py-4">
              <p className="text-xl text-ink-muted">
                No chores yet. Add the jobs that keep coming back, like cleaning the bathroom or changing the furnace filter. Each one
                comes due by itself, a set time after it was last done.
              </p>
              <SoftLink href="/chores/add">
                <Plus size="1.5rem" aria-hidden />
                Add your first chore
              </SoftLink>
            </div>
          </Card>
        ) : (
          groups.map((g, gi) => {
            const shown = pageOf(g.chores, Number(pages[`p${gi}`] ?? 0), CHORES_PER_PAGE);
            return (
              <Card
                key={g.title}
                title={g.title}
                icon={Broom}
                tint={g.title === "Seasonal" ? "orange" : "blue"}
                className="lg:row-span-3"
                aside={<span className="text-lg font-bold text-ink-muted">{g.chores.length}</span>}
              >
                {g.chores.length === 0 ? <p className="py-3 text-lg text-ink-muted">None yet.</p> : null}
                <ul className="flex flex-col lg:min-h-0 lg:flex-1">
                  {shown.items.map((c) => {
                    const who = c.default_assignee_id ? memberById.get(c.default_assignee_id) : undefined;
                    return (
                      <li key={c.id} className="border-b border-panel last:border-0">
                        <Link
                          href={here({ edit: c.id })}
                          scroll={false}
                          className={`flex min-h-17 items-center gap-3 py-1.5 ${c.active ? "" : "opacity-55"}`}
                        >
                          <Emoji emoji={c.icon ?? "🧹"} className="size-9" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-lg font-semibold text-ink">{c.name}</span>
                            <span className="truncate text-sm font-semibold text-ink-muted">
                              {repeatText(c, household)}
                              {c.active ? "" : " · paused"}
                            </span>
                          </span>
                          {who ? <Avatar name={who.name} colour={who.colour} icon={who.icon} size="sm" /> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <Pager page={shown.page} pages={shown.pages} href={(n) => here({ [`p${gi}`]: String(n) })} />
              </Card>
            );
          })
        )}

        <Card title="Waiting for room" icon={Timer} tint="pink" aside={<span className="text-lg font-bold text-ink-muted">{waiting.length}</span>}>
          {waiting.length === 0 ? (
            <p className="py-2 text-lg text-ink-muted">Every chore that&apos;s due has a place.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {waiting.slice(0, WAITING_SHOWN).map((t) => (
                <TodoRow key={t.id} todo={t} members={memberById} today={today} household={household} returnTo={returnTo} />
              ))}
            </ul>
          )}
          {waiting.length > WAITING_SHOWN ? (
            <Link href="/chores/blocks" className="mt-auto text-base font-bold text-accent">
              +{waiting.length - WAITING_SHOWN} more · add chore time?
            </Link>
          ) : blocks.length === 0 && waiting.length > 0 ? (
            <p className="mt-auto text-base font-semibold text-ink-muted">With no chore time, due chores go on the to-do list, {CHORE_LIST_LIMIT} at a time.</p>
          ) : null}
        </Card>

        <Card title="Coming up" icon={CalendarDots} tint="blue">
          {soon.length === 0 ? (
            <p className="py-2 text-lg text-ink-muted">Nothing in the next two weeks.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {soon.slice(0, SOON_SHOWN).map((c) => (
                <SoonRow key={c.id} chore={c} today={today} household={household} />
              ))}
            </ul>
          )}
          {soon.length > SOON_SHOWN ? <p className="mt-auto text-base font-bold text-ink-muted">+{soon.length - SOON_SHOWN} more</p> : null}
        </Card>

        <Card title="Done lately" icon={CheckCircle} tint="teal">
          {recent.length === 0 ? (
            <p className="py-2 text-lg text-ink-muted">Nothing this week yet.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {recent.slice(0, RECENT_SHOWN).map((r) => (
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

      {editing ? (
        <Sheet title={editing.name} closeHref={returnTo}>
          <div className="flex h-full flex-col gap-5">
            <p className="shrink-0 text-lg text-ink-muted">
              {editing.timing.lastDone ? `Last done ${dayPhrase(editing.timing.lastDone, today, household)}. ` : "Not done yet. "}
              {editing.active ? `Next due ${dayPhrase(editing.timing.dueOn, today, household)}.` : "Paused."}
            </p>
            <form id="edit-chore" action={updateChore} className="group flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <ChoreFields
                chore={editing}
                members={members}
                initialTab={firstParam(params.tab)}
                headsUps={
                  <HeadsUpEditor
                    headsUps={await loadHeadsUps({ choreId: editing.id })}
                    source={{ choreId: editing.id }}
                    returnTo={here({ edit: editing.id, tab: "heads-ups" })}
                    what="it comes due"
                    example="Buy a new filter"
                  />
                }
              />
            </form>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button form="edit-chore">Save chore</Button>
              <form action={setChoreActive} className="ml-auto">
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="active" value={String(!editing.active)} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="secondary">{editing.active ? "Pause it" : "Turn it back on"}</Button>
              </form>
              <form action={removeChore}>
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="name" value={editing.name} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="danger">Remove</Button>
              </form>
            </div>
          </div>
        </Sheet>
      ) : null}

      {blockDate ? (
        <Sheet title={`Chore time ${dayPhrase(blockDate, today, household)}`} closeHref={returnTo}>
          <div className="flex h-full flex-col gap-6">
            {blockDays.length === 0 ? <p className="text-xl text-ink-muted">No chore time that day.</p> : null}
            {blockDays.slice(0, 2).map((d) => (
              <BlockDayPanel
                key={d.block.id}
                day={d}
                today={today}
                household={household}
                time={time}
                returnTo={here({ date: blockDate })}
                itemsShown={blockDays.length > 1 ? ITEMS_PER_BLOCK / 2 : ITEMS_PER_BLOCK}
              />
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** One block of chore time on one day: when, how full, and its chores to tick off or swap. */
function BlockDayPanel({
  day,
  today,
  household,
  time,
  returnTo,
  itemsShown,
}: {
  day: BlockDay<PlannedTodo>;
  today: LocalDate;
  household: Household;
  time: (t: string) => string;
  returnTo: string;
  itemsShown: number;
}) {
  const { block, items, date, usedMinutes } = day;
  const shown = items.slice(0, itemsShown);
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

/** "Every week · Sat · Medium" or "Once a year, Oct 15 – Nov 30 · Big" */
function repeatText(c: ChoreWithTiming, household: Household): string {
  const { locale } = household.settings;
  const fmt = (md: string) => {
    const [m, d] = md.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, m - 1, d)));
  };
  const day = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const parts = [describeRule(c, day, c.season_start && c.season_end ? `${fmt(c.season_start)} – ${fmt(c.season_end)}` : undefined)];
  parts.push(SIZE_LABEL[c.size]);
  if (c.importance !== "normal") parts.push(IMPORTANCE_LABEL[c.importance]);
  return parts.join(" · ");
}
