import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Broom, CalendarCheck, CalendarDots, CheckCircle, Plus, Repeat, Warning } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Emoji, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { HeaderClock } from "@/components/header-clock";
import { daysBetween, describeRule } from "@/lib/chores";
import { weekdaysLabel, type ChoreDay } from "@/lib/chore-days";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { Pager, pageOf } from "../meals/parts";
import { HeadsUpEditor, loadHeadsUps } from "../heads-ups/editor";
import { loadTodos, type ChoreMember, type ChoreWithTiming } from "./data";
import { choreSchedule } from "./plan";
import { removeChore, setChoreActive, updateChore } from "./actions";
import { ChoreDayFields, removeChoreDayForm } from "./day-form";
import { ChoreFields } from "./forms";
import { RoundRow, dayLabel, dayPhrase, tagText } from "./rows";

/** How many days back "Done lately" looks. */
const RECENT_DAYS = 7;
/** Rows that fit in each column without scrolling. */
const DAYS_PER_PAGE = 6;
const CHORES_PER_PAGE = 8;
const SOON_SHOWN = 3;
const HARD_SHOWN = 2;
const RECENT_SHOWN = 2;

/**
 * Chores (tasks rework, step 2): the household's chore days, the chores
 * that show every chore day, the ones that come due by a date rule, and
 * on the right what's coming up, what's hard to schedule, and what was
 * done lately. Tap anything to change it.
 *
 * Chores run in the background: the generator (src/lib/chore-days.ts)
 * puts each one on a chore day with room, and today's go on the daily
 * list on the Today panel.
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
  const { chores, rounds, members, choreDays, plan, hard } = await choreSchedule(household, today, timeZone);
  const { todos } = await loadTodos();
  const memberById = new Map(members.map((m) => [m.id, m]));
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const dayById = new Map(choreDays.map((d) => [d.id, d]));
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const recent = rounds.filter((r) => r.status === "done" && daysBetween(r.completed_on, today) <= RECENT_DAYS);
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  // Which page each column is on, kept in the address.
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

  const presets = chores.filter((c) => c.kind === "preset");
  const generated = chores.filter((c) => c.kind === "generated");
  // Coming up: what the generator has placed after today, soonest first.
  const soon = plan.days.slice(1).flatMap((d) =>
    d.items.map((item) => ({
      date: d.date,
      id: item.id,
      name: item.kind === "generated" ? choreById.get(item.id)?.name : todoById.get(item.id)?.title,
      icon: item.kind === "generated" ? choreById.get(item.id)?.icon : todoById.get(item.id)?.icon,
      day: d.choreDays.map((cd) => cd.name).join(" + "),
    })),
  );
  const hardList = [...hard].map((id) => choreById.get(id)).filter((c): c is ChoreWithTiming => Boolean(c));
  const daysText = (c: ChoreWithTiming) =>
    c.chore_day_ids.length === 0 ? "Any day" : c.chore_day_ids.map((id) => dayById.get(id)?.name ?? "?").join(", ");

  const editing = chores.find((c) => c.id === firstParam(params.edit));
  const dayParam = firstParam(params.day);
  const editingDay = dayParam === "new" ? "new" : choreDays.find((d) => d.id === dayParam);

  const chorePage = (list: ChoreWithTiming[], key: string, meta: (c: ChoreWithTiming) => string) => {
    const shown = pageOf(list, Number(pages[key] ?? 0), CHORES_PER_PAGE);
    return (
      <>
        <ul className="flex flex-col lg:min-h-0 lg:flex-1">
          {shown.items.map((c) => (
            <ChoreLine
              key={c.id}
              chore={c}
              href={here({ edit: c.id })}
              meta={meta(c)}
              who={c.default_assignee_id ? memberById.get(c.default_assignee_id) : undefined}
              hard={hard.has(c.id)}
            />
          ))}
        </ul>
        <Pager page={shown.page} pages={shown.pages} href={(n) => here({ [key]: String(n) })} />
      </>
    );
  };
  const shownDays = pageOf(choreDays, Number(pages.p0 ?? 0), DAYS_PER_PAGE);

  return (
    <>
      <ScreenHeader title="Chores">
        <HeaderClock locale={locale} timeZone={timeZone} />
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          <SoftLink href="/chores/add">
            <Plus size="1.5rem" aria-hidden />
            Add a chore
          </SoftLink>
          <SoftLink href={here({ day: "new" })}>
            <Plus size="1.5rem" aria-hidden />
            Add a chore day
          </SoftLink>
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <Card
          title="Chore days"
          icon={CalendarCheck}
          tint="teal"
          className="lg:row-span-3"
          aside={<span className="text-lg font-bold text-ink-muted">{choreDays.length}</span>}
        >
          <ul className="flex flex-col lg:min-h-0 lg:flex-1">
            {shownDays.items.map((d) => (
              <li key={d.id} className="border-b border-panel last:border-0">
                <Link href={here({ day: d.id })} scroll={false} className="flex min-h-17 items-center gap-3 py-1.5">
                  <Emoji emoji={d.icon ?? "🗓️"} className="size-9" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-lg font-semibold text-ink">{d.name}</span>
                    <span className="truncate text-sm font-semibold text-ink-muted">{dayMeta(d)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={shownDays.page} pages={shownDays.pages} href={(n) => here({ p0: String(n) })} />
        </Card>

        <Card
          title="Every chore day"
          icon={Broom}
          tint="blue"
          className="lg:row-span-3"
          aside={<span className="text-lg font-bold text-ink-muted">{presets.length}</span>}
        >
          {presets.length === 0 ? (
            <Empty href="/chores/add?kind=preset">
              Chores that happen every time a chore day comes round, like &ldquo;Wash the bedding&rdquo; on Laundry day.
            </Empty>
          ) : (
            chorePage(presets, "p1", (c) => [daysText(c), tagText(c)].filter(Boolean).join(" · ") + (c.active ? "" : " · paused"))
          )}
        </Card>

        <Card
          title="When it comes due"
          icon={Repeat}
          tint="orange"
          className="lg:row-span-3"
          aside={<span className="text-lg font-bold text-ink-muted">{generated.length}</span>}
        >
          {generated.length === 0 ? (
            <Empty href="/chores/add">
              Chores on a schedule, like &ldquo;Wash the blankets every 3 months&rdquo;. Each goes on a chore day with room.
            </Empty>
          ) : (
            chorePage(generated, "p2", (c) => `${repeatText(c, household)} · ${daysText(c)}${c.active ? "" : " · paused"}`)
          )}
        </Card>

        <Card title="Coming up" icon={CalendarDots} tint="blue">
          {soon.length === 0 ? (
            <p className="py-2 text-lg text-ink-muted">Nothing placed in the next two weeks.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {soon.slice(0, SOON_SHOWN).map((s) => (
                <li key={`${s.date}-${s.id}`} className="flex min-h-14 items-center gap-3 border-b border-panel last:border-0">
                  <Emoji emoji={s.icon ?? "🧹"} className="size-8" />
                  <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{s.name ?? "A chore"}</span>
                  <span className="shrink-0 text-sm font-bold text-ink-muted">
                    {dayLabel(s.date, today, household)}
                    {s.day ? ` · ${s.day}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {soon.length > SOON_SHOWN ? <p className="mt-auto text-base font-bold text-ink-muted">+{soon.length - SOON_SHOWN} more</p> : null}
        </Card>

        <Card
          title="Hard to schedule"
          icon={Warning}
          tint="pink"
          aside={<span className="text-lg font-bold text-ink-muted">{hardList.length}</span>}
        >
          {hardList.length === 0 ? (
            <p className="py-2 text-lg text-ink-muted">Every chore has a day with room.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {hardList.slice(0, HARD_SHOWN).map((c) => (
                <li key={c.id} className="border-b border-panel last:border-0">
                  <Link href={here({ edit: c.id })} scroll={false} className="flex min-h-14 items-center gap-3">
                    <Emoji emoji={c.icon ?? "🧹"} className="size-8" />
                    <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{c.name}</span>
                    <span className="shrink-0 text-sm font-bold text-ink-muted">
                      {c.chore_day_ids.length ? "No room" : "No day takes it"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {hardList.length > HARD_SHOWN ? (
            <p className="mt-auto text-base font-bold text-ink-muted">+{hardList.length - HARD_SHOWN} more</p>
          ) : null}
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
              {!editing.active
                ? "Paused."
                : editing.kind === "generated"
                  ? `Next due ${dayPhrase(editing.timing.dueOn, today, household)}.`
                  : ""}
              {hard.has(editing.id) ? " Hard to schedule: give it another chore day, or more room on its days." : ""}
            </p>
            <form id="edit-chore" action={updateChore} className="group flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <ChoreFields
                chore={editing}
                members={members}
                choreDays={choreDays}
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

      {editingDay ? (
        <Sheet title={editingDay === "new" ? "New chore day" : editingDay.name} closeHref={returnTo}>
          <div className="flex h-full flex-col gap-5">
            <ChoreDayFields day={editingDay === "new" ? undefined : editingDay} returnTo={here({ day: dayParam ?? "new" })} />
            {editingDay !== "new" && !editingDay.is_free ? removeChoreDayForm(editingDay, returnTo) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** "Tue · only its own · 2 chores, 1 Big" */
function dayMeta(d: ChoreDay): string {
  const parts = [weekdaysLabel(d.weekdays)];
  if (d.span) parts.push("one stretch");
  if (d.restrictive) parts.push("only its own");
  parts.push(`room for ${d.max_tasks}${d.max_big ? `, ${d.max_big} Big` : ", no Big"}`);
  return parts.join(" · ");
}

function ChoreLine({
  chore,
  href,
  meta,
  who,
  hard,
}: {
  chore: ChoreWithTiming;
  href: string;
  meta: string;
  who?: ChoreMember;
  hard: boolean;
}) {
  return (
    <li className="border-b border-panel last:border-0">
      <Link href={href} scroll={false} className={`flex min-h-17 items-center gap-3 py-1.5 ${chore.active ? "" : "opacity-55"}`}>
        <Emoji emoji={chore.icon ?? "🧹"} className="size-9" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-semibold text-ink">{chore.name}</span>
          <span className="truncate text-sm font-semibold text-ink-muted">{meta}</span>
        </span>
        {hard ? <Warning size="1.5rem" weight="fill" className="shrink-0 text-now" aria-label="Hard to schedule" /> : null}
        {who ? <Avatar name={who.name} colour={who.colour} icon={who.icon} size="sm" /> : null}
      </Link>
    </li>
  );
}

function Empty({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 py-3">
      <p className="text-lg text-ink-muted">{children}</p>
      <SoftLink href={href}>
        <Plus size="1.5rem" aria-hidden />
        Add one
      </SoftLink>
    </div>
  );
}

/** "Every week · Sat · Big" or "Once a year, Oct 15 – Nov 30 · Outdoor" */
function repeatText(c: ChoreWithTiming, household: Household): string {
  const { locale } = household.settings;
  const fmt = (md: string) => {
    const [m, d] = md.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, m - 1, d)));
  };
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const parts = [describeRule(c, day, c.season_start && c.season_end ? `${fmt(c.season_start)} – ${fmt(c.season_end)}` : undefined)];
  if (tagText(c)) parts.push(tagText(c));
  return parts.join(" · ");
}
