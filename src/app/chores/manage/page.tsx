import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Broom, Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Emoji, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { IMPORTANCE_LABEL, SIZE_LABEL, describeRule } from "@/lib/chores";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { addChore, removeChore, setChoreActive, updateChore } from "../actions";
import { loadChores, type ChoreWithTiming } from "../data";
import { ChoreFields } from "../forms";
import { dayPhrase } from "../rows";
import { Pager, pageOf } from "../../meals/parts";

/** Rows that fit in one list without scrolling. */
const CHORES_PER_PAGE = 9;
import { HeadsUpEditor, loadHeadsUps } from "../../heads-ups/editor";


/**
 * Setting chores up: the household's chore library, grouped by how often
 * they come back. Tapping one opens it for editing in a side panel.
 */
export default function ManageChoresPage(props: PageProps<"/chores/manage">) {
  return (
    <AppFrame section="chores">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Manage searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Manage({ searchParams }: { searchParams: PageProps<"/chores/manage">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const { chores, members } = await loadChores(today, household.settings.timeZone);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const editId = firstParam(params.edit);
  const adding = firstParam(params.add) === "1";
  const editing = editId ? chores.find((c) => c.id === editId) : undefined;
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const returnTo = "/chores/manage";
  // Which page each of the three lists is on.
  const pages: Record<string, string> = {};
  for (const k of ["p0", "p1", "p2"]) {
    const v = firstParam(params[k]);
    if (v) pages[k] = v;
  }

  // Chores kept to some times of year go under Seasonal.
  const seasonal = (c: ChoreWithTiming) => Boolean(c.season_start || c.only_seasons?.length || c.only_months?.length);
  const groups: { title: string; chores: ChoreWithTiming[] }[] = [
    { title: "Every week or so", chores: chores.filter((c) => !seasonal(c) && (c.repeat_unit === "day" || c.repeat_unit === "week")) },
    { title: "Every month or more", chores: chores.filter((c) => !seasonal(c) && (c.repeat_unit === "month" || c.repeat_unit === "year")) },
    { title: "Seasonal", chores: chores.filter(seasonal) },
  ];

  return (
    <>
      <ScreenHeader title="Set up chores">
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          <SoftLink href="/chores/manage?add=1">
            <Plus size="1.5rem" aria-hidden />
            Add a chore
          </SoftLink>
          <SoftLink href="/chores">
            <ArrowLeft size="1.5rem" aria-hidden />
            Back to chores
          </SoftLink>
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <p className="shrink-0 text-lg text-ink-muted">
        These started as a suggested list. Change, pause or remove any of them. Each one comes back a set time after it was
        last done, or once a year in its season.
      </p>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
        {groups.map((g, gi) => {
          const shown = pageOf(g.chores, Number(firstParam(params[`p${gi}`]) ?? 0), CHORES_PER_PAGE);
          return (
          <Card key={g.title} title={g.title} icon={Broom} tint={g.title === "Seasonal" ? "orange" : "blue"} aside={<span className="text-lg font-bold text-ink-muted">{g.chores.length}</span>}>
            <ul className="flex flex-col lg:min-h-0 lg:flex-1">
              {shown.items.map((c) => {
                const who = c.default_assignee_id ? memberById.get(c.default_assignee_id) : undefined;
                return (
                  <li key={c.id} className="border-b border-panel last:border-0">
                    <Link href={`/chores/manage?edit=${c.id}`} scroll={false} className={`flex min-h-17 items-center gap-3 py-1.5 ${c.active ? "" : "opacity-55"}`}>
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
            <Pager page={shown.page} pages={shown.pages} href={(n) => `/chores/manage?${new URLSearchParams({ ...pages, [`p${gi}`]: String(n) })}`} />
          </Card>
          );
        })}
      </div>

      {adding ? (
        <Sheet title="Add a chore" closeHref="/chores/manage">
          <form action={addChore} className="group flex h-full flex-col gap-5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <ChoreFields members={members} />
            <div className="shrink-0">
              <Button>Add chore</Button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {editing ? (
        <Sheet title={editing.name} closeHref="/chores/manage">
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
                    returnTo={`/chores/manage?edit=${editing.id}&tab=heads-ups`}
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
    </>
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
