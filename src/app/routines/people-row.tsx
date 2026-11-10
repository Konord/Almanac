import Link from "next/link";
import { Avatar, ProgressBar } from "@/components/ui";
import type { LocalDate } from "@/lib/time";
import { dayRoutinesFor, type RoutineData } from "./data";

/** How far through today's routines a person is, across all their routines. */
export function dayProgress(data: RoutineData, memberId: string, date: LocalDate) {
  const routines = dayRoutinesFor(data, memberId, date);
  return {
    done: routines.reduce((n, r) => n + r.progress.done, 0),
    total: routines.reduce((n, r) => n + r.progress.total, 0),
  };
}

/**
 * The row of people across the top of a screen: avatar, name, and a bar
 * for today's routine steps. With `hrefFor`, each person is a button.
 */
export function PeopleRow({
  data,
  date,
  hrefFor,
  activeId,
  compact = false,
}: {
  data: RoutineData;
  date: LocalDate;
  hrefFor?: (memberId: string) => string;
  activeId?: string;
  compact?: boolean;
}) {
  if (data.members.length === 0) return null;
  return (
    <div className={`flex shrink-0 flex-wrap gap-x-6.5 gap-y-2 ${compact ? "" : "lg:h-15.5 lg:flex-nowrap"}`} aria-label="People">
      {data.members.map((m) => {
        const { done, total } = dayProgress(data, m.id, date);
        const inner = (
          <>
            <Avatar name={m.name} colour={m.colour} icon={m.icon} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex justify-between gap-2 text-lg font-bold text-ink">
                <span className="truncate">{m.name}</span>
                <span className="font-semibold text-ink-muted">{total ? `${done}/${total}` : ""}</span>
              </span>
              <ProgressBar done={done} total={total} colour={m.colour} />
            </span>
          </>
        );
        const base = "flex min-w-48 flex-1 basis-0 items-center gap-3";
        return hrefFor ? (
          <Link
            key={m.id}
            href={hrefFor(m.id)}
            aria-current={activeId === m.id ? "page" : undefined}
            className={`${base} min-h-[var(--touch-target)] rounded-2xl px-3 ${activeId === m.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
          >
            {inner}
          </Link>
        ) : (
          <div key={m.id} className={base}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
