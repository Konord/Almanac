import Link from "next/link";
import { ArrowCounterClockwise, ArrowRight, ArrowsLeftRight, Check, SunHorizon } from "@phosphor-icons/react/dist/ssr";
import { Avatar, Emoji } from "@/components/ui";
import { IMPORTANCE_LABEL, SIZE_LABEL, daysBetween } from "@/lib/chores";
import type { Household } from "@/lib/household";
import { zonedToUtc, type LocalDate } from "@/lib/time";
import { carriedOver, linkLabel } from "@/lib/todos";
import { doToday, markChoreDone, skipChore, swapOut, toggleTodo, undoRound } from "./actions";
import type { ChoreMember, ChoreWithTiming, Round, Todo } from "./data";

/** "Today", "Tomorrow", "Sat", or "Nov 14". */
export function dayLabel(date: LocalDate, today: LocalDate, household: Household): string {
  const { locale, timeZone } = household.settings;
  const gap = daysBetween(today, date);
  if (gap === 0) return "Today";
  if (gap === 1) return "Tomorrow";
  if (gap === -1) return "Yesterday";
  const noon = zonedToUtc(date, "12:00", timeZone);
  if (gap > 1 && gap < 7) return new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(noon);
  return new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" }).format(noon);
}

/** "by Fri", "Tue 9 a.m.", "from Tue" (still open after its day). */
export function todoWhen(todo: Pick<Todo, "due_date" | "date_kind" | "at_time" | "status">, today: LocalDate, household: Household): string {
  if (!todo.due_date) return "";
  const day = dayLabel(todo.due_date, today, household);
  if (carriedOver(todo, today)) return `from ${day}`;
  if (todo.date_kind === "due") return `by ${day}`;
  if (!todo.at_time) return day;
  const time = new Intl.DateTimeFormat(household.settings.locale, { timeZone: household.settings.timeZone, hour: "numeric", minute: "2-digit" })
    .format(zonedToUtc(todo.due_date, todo.at_time.slice(0, 5), household.settings.timeZone))
    .replace(":00", "");
  return `${day} ${time}`;
}

/** dayLabel for the middle of a sentence: "done today", "done Nov 3". */
export function dayPhrase(date: LocalDate, today: LocalDate, household: Household): string {
  const label = dayLabel(date, today, household);
  return ["Today", "Tomorrow", "Yesterday"].includes(label) ? label.toLowerCase() : label;
}

/** "Important · Medium · 40 min · waiting 9 days" */
export function choreMeta(chore: ChoreWithTiming, today: LocalDate, household: Household): string {
  const parts = [SIZE_LABEL[chore.size]];
  if (chore.importance !== "normal") parts.unshift(IMPORTANCE_LABEL[chore.importance]);
  if (chore.est_minutes) parts.push(`${chore.est_minutes} min`);
  if (chore.timing.window && chore.timing.state === "due") parts.push(`in season until ${dayLabel(chore.timing.window.end, today, household)}`);
  else if (chore.timing.daysOverdue >= 2) parts.push(`waiting ${chore.timing.daysOverdue} days`);
  return parts.join(" · ");
}

/** A chore that's due: picture, name, who, and Skip / Done. */
export function ChoreRow({
  chore,
  members,
  today,
  household,
  returnTo,
}: {
  chore: ChoreWithTiming;
  members: Map<string, ChoreMember>;
  today: LocalDate;
  household: Household;
  returnTo: string;
}) {
  const who = chore.default_assignee_id ? members.get(chore.default_assignee_id) : undefined;
  const hidden = (
    <>
      <input type="hidden" name="templateId" value={chore.id} />
      <input type="hidden" name="name" value={chore.name} />
      <input type="hidden" name="memberId" value={who?.id ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
  return (
    <li className="flex min-h-19 items-center gap-3.5 border-b border-panel py-1.5 last:border-0">
      <Emoji emoji={chore.icon ?? "🧹"} className="size-10" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xl leading-[1.1] font-semibold text-ink">{chore.name}</span>
        <span className="truncate text-sm font-semibold text-ink-muted">{choreMeta(chore, today, household)}</span>
      </span>
      {who ? <Avatar name={who.name} colour={who.colour} icon={who.icon} size="sm" /> : null}
      <form action={skipChore}>
        {hidden}
        <button
          className="min-h-[var(--touch-target)] rounded-2xl px-3.5 text-base font-bold text-ink-muted hover:bg-rail"
          title="Not this time. It comes back next round."
        >
          Skip
        </button>
      </form>
      <form action={markChoreDone}>
        {hidden}
        <button aria-label={`Done: ${chore.name}`} title="Tap when done" className="flex size-[var(--touch-target)] items-center justify-center">
          <span className="flex size-8.5 items-center justify-center rounded-full border-[2.5px] border-check-border text-check-border hover:border-success hover:text-success">
            <Check size="1.125rem" weight="bold" aria-hidden />
          </span>
        </button>
      </form>
    </li>
  );
}

/** A chore coming up later: picture, name and when. */
export function SoonRow({ chore, today, household }: { chore: ChoreWithTiming; today: LocalDate; household: Household }) {
  return (
    <li className="flex min-h-16 items-center gap-3.5 border-b border-panel py-1 last:border-0">
      <Emoji emoji={chore.icon ?? "🧹"} className="size-9" />
      <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{chore.name}</span>
      <span className="shrink-0 text-sm font-bold text-ink-muted">{dayLabel(chore.timing.dueOn, today, household)}</span>
    </li>
  );
}

/** A done or skipped chore round, with a way to take it back. */
export function RoundRow({
  round,
  chore,
  members,
  today,
  household,
  returnTo,
}: {
  round: Round;
  chore: ChoreWithTiming | undefined;
  members: Map<string, ChoreMember>;
  today: LocalDate;
  household: Household;
  returnTo: string;
}) {
  const who = round.completed_by ? members.get(round.completed_by) : undefined;
  return (
    <li className="flex min-h-16 items-center gap-3 border-b border-panel py-1 last:border-0">
      <Emoji emoji={chore?.icon ?? "🧹"} className="size-9" faded />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-lg font-semibold text-ink-muted">{chore?.name ?? "A chore"}</span>
        <span className="text-sm font-semibold text-ink-muted">
          {round.status === "done" ? "Done" : "Skipped"} {dayPhrase(round.completed_on, today, household)}
          {who ? ` · ${who.name}` : ""}
        </span>
      </span>
      <form action={undoRound}>
        <input type="hidden" name="id" value={round.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-label="Take it back"
          title="Take it back"
          className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-rail"
        >
          <ArrowCounterClockwise size="1.5rem" aria-hidden />
        </button>
      </form>
    </li>
  );
}

/** A to-do: tick box, words in handwriting, when and who. */
export function TodoRow({
  todo,
  members,
  today,
  household,
  returnTo,
  editHref,
}: {
  todo: Todo;
  members: Map<string, ChoreMember>;
  today: LocalDate;
  household: Household;
  returnTo: string;
  /** Tapping the words opens it for editing. */
  editHref?: string;
}) {
  const who = todo.assignee_id ? members.get(todo.assignee_id) : undefined;
  const done = todo.status === "done";
  const late = !done && carriedOver(todo, today);
  const opens = linkLabel(todo.link);
  const words = (
    <span className={`line-clamp-2 font-hand text-2xl leading-[1.1] break-words ${done ? "text-ink-muted line-through" : "text-ink"}`}>{todo.title}</span>
  );
  return (
    <li className="flex min-h-19 items-center gap-3.5 border-b border-panel last:border-0">
      <form action={toggleTodo}>
        <input type="hidden" name="id" value={todo.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          aria-pressed={done}
          aria-label={done ? `Untick ${todo.title}` : `Tick off ${todo.title}`}
          className="flex size-[var(--touch-target)] items-center justify-center"
        >
          <span
            className={`flex size-8 items-center justify-center rounded-[0.625rem] text-white ${
              done ? "bg-success" : "border-[2.5px] border-check-border"
            }`}
          >
            {done ? <Check size="1.125rem" weight="bold" aria-hidden /> : null}
          </span>
        </button>
      </form>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {todo.icon ? <Emoji emoji={todo.icon} className="size-8" faded={done} /> : null}
        {editHref ? (
          <Link href={editHref} scroll={false} className="min-w-0 flex-1 py-2">
            {words}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 py-2">{words}</span>
        )}
      </span>
      {todo.must_do && !done ? (
        <span className="shrink-0 rounded-full bg-now px-2.5 py-1 text-sm font-extrabold text-white">Must do</span>
      ) : todo.due_date && !done ? (
        <span className={`shrink-0 text-sm font-bold ${late ? "text-now" : "text-ink-muted"}`}>{todoWhen(todo, today, household)}</span>
      ) : !done ? (
        // No date: it stays on its list until it's put on today's daily list.
        <form action={doToday} className="shrink-0">
          <input type="hidden" name="id" value={todo.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-rail px-3 text-sm font-bold text-ink"
            title="Put this on today's list"
          >
            <SunHorizon size="1.125rem" aria-hidden />
            Do today
          </button>
        </form>
      ) : null}
      {opens && todo.link && !done ? (
        <Link
          href={todo.link}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rail text-ink"
          title={`Open ${opens}`}
          aria-label={`Open ${opens}`}
        >
          <ArrowRight size="1.25rem" weight="bold" aria-hidden />
        </Link>
      ) : null}
      {who ? <Avatar name={who.name} colour={who.colour} icon={who.icon} size="sm" /> : null}
    </li>
  );
}

/** A chore's to-do inside a chore block: tick it off, or swap it for another. */
export function BlockItemRow({
  todo,
  minutes,
  date,
  canSwap,
  returnTo,
}: {
  todo: Todo;
  minutes: number;
  date: LocalDate;
  canSwap: boolean;
  returnTo: string;
}) {
  return (
    <li className="flex min-h-16 items-center gap-3 border-b border-panel last:border-0">
      <form action={toggleTodo}>
        <input type="hidden" name="id" value={todo.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button aria-label={`Done: ${todo.title}`} className="flex size-[var(--touch-target)] items-center justify-center">
          <span className="flex size-8 items-center justify-center rounded-[0.625rem] border-[2.5px] border-check-border" />
        </button>
      </form>
      <Emoji emoji={todo.icon ?? "🧹"} className="size-8" />
      <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{todo.title}</span>
      <span className="shrink-0 text-sm font-bold text-ink-muted">{minutes} min</span>
      {canSwap ? (
        <form action={swapOut}>
          <input type="hidden" name="id" value={todo.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            className="flex min-h-[var(--touch-target)] items-center gap-1.5 rounded-2xl px-3 text-base font-bold text-ink-muted hover:bg-rail"
            title="Not this time: another due chore takes its place"
          >
            <ArrowsLeftRight size="1.25rem" aria-hidden />
            Swap
          </button>
        </form>
      ) : null}
    </li>
  );
}
