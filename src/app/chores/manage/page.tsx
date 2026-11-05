import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Broom, Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Emoji, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { SIZE_LABEL, describeRepeat } from "@/lib/chores";
import { requireHousehold, type Household } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { addChore, removeChore, setChoreActive, updateChore } from "../actions";
import { loadChores, type ChoreWithTiming } from "../data";
import { ChoreFields } from "../forms";
import { dayPhrase } from "../rows";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const { chores, members } = await loadChores(today);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const editId = firstParam(params.edit);
  const adding = firstParam(params.add) === "1";
  const editing = editId ? chores.find((c) => c.id === editId) : undefined;
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const returnTo = "/chores/manage";

  const groups: { title: string; chores: ChoreWithTiming[] }[] = [
    { title: "Every week or so", chores: chores.filter((c) => !c.season_start && (c.repeat_unit === "day" || c.repeat_unit === "week")) },
    { title: "Every month or more", chores: chores.filter((c) => !c.season_start && (c.repeat_unit === "month" || c.repeat_unit === "year")) },
    { title: "Seasonal", chores: chores.filter((c) => c.season_start) },
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
        {groups.map((g) => (
          <Card key={g.title} title={g.title} icon={Broom} tint={g.title === "Seasonal" ? "orange" : "blue"} aside={<span className="text-lg font-bold text-ink-muted">{g.chores.length}</span>}>
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {g.chores.map((c) => {
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
                      {who ? <Avatar name={who.name} colour={who.colour} size="sm" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      {adding ? (
        <Sheet title="Add a chore" closeHref="/chores/manage">
          <form action={addChore} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <ChoreFields members={members} />
            <div className="sm:col-span-2">
              <Button>Add chore</Button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {editing ? (
        <Sheet title={editing.name} closeHref="/chores/manage">
          <p className="mb-5 text-lg text-ink-muted">
            {editing.timing.lastDone ? `Last done ${dayPhrase(editing.timing.lastDone, today, household)}. ` : "Not done yet. "}
            {editing.active ? `Next due ${dayPhrase(editing.timing.dueOn, today, household)}.` : "Paused."}
          </p>
          <form action={updateChore} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <ChoreFields chore={editing} members={members} />
            <div className="sm:col-span-2">
              <Button>Save chore</Button>
            </div>
          </form>
          <div className="mt-6 flex flex-wrap gap-3">
            <form action={setChoreActive}>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="active" value={String(!editing.active)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button variant="secondary">{editing.active ? "Pause it" : "Turn it back on"}</Button>
            </form>
            <form action={removeChore}>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="name" value={editing.name} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button variant="danger">Remove {editing.name}</Button>
            </form>
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
  const parts = [describeRepeat(c, c.season_start && c.season_end ? `${fmt(c.season_start)} – ${fmt(c.season_end)}` : undefined)];
  if (c.preferred_weekday !== null) parts.push(WEEKDAY_SHORT[c.preferred_weekday]);
  parts.push(SIZE_LABEL[c.size]);
  return parts.join(" · ");
}
