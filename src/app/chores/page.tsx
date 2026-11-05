import { Suspense } from "react";
import { Broom, CalendarDots, CheckCircle, GearSix } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Card, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { daysBetween } from "@/lib/chores";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { dueChores, loadChores, soonChores } from "./data";
import { ChoreRow, RoundRow, SoonRow } from "./rows";

/** How many days back "Done lately" looks. */
const RECENT_DAYS = 7;

/**
 * Chores: what's due now (tap the circle when done, or Skip without guilt),
 * what's coming up, and what was done lately (with a take-back button).
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
  const { chores, rounds, members } = await loadChores(today);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const due = dueChores(chores);
  const soon = soonChores(chores);
  const recent = rounds.filter((r) => daysBetween(r.completed_on, today) <= RECENT_DAYS);
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const returnTo = "/chores";

  return (
    <>
      <ScreenHeader title="Chores">
        <HeaderClock locale={locale} timeZone={timeZone} />
        <SoftLink href="/chores/manage" className="lg:ml-auto">
          <GearSix size="1.5rem" aria-hidden />
          Set up chores
        </SoftLink>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          title="Due now"
          icon={Broom}
          tint="orange"
          aside={<span className="text-lg font-bold text-ink-muted">{due.length}</span>}
        >
          {due.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">Nothing due. Enjoy it.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {due.map((c) => (
                <ChoreRow key={c.id} chore={c} members={memberById} today={today} household={household} returnTo={returnTo} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Coming up" icon={CalendarDots} tint="purple">
          {soon.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">Nothing in the next two weeks.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {soon.map((c) => (
                <SoonRow key={c.id} chore={c} today={today} household={household} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Done lately" icon={CheckCircle} tint="teal">
          {recent.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">Nothing yet this week.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {recent.map((r) => (
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
