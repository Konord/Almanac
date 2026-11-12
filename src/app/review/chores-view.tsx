"use client";

import { useMemo } from "react";
import { Emoji } from "@/components/ui";
import { useFitRows } from "@/components/use-fit-rows";
import { accepts, planChoreDays, type ChoreDay, type PlanDay } from "@/lib/chore-days";
import { movesFor, type ReviewDraft } from "@/lib/weekly-review";
import type { ReviewColumn, ReviewData } from "./data";

/*
 * The Planner's chore view (Connor, 2026-11-12): the same seven days, but
 * each shows its chore day tiles (Laundry, Kitchen…) with the chores the
 * planner expects to put on them underneath: regular chores, occasional
 * chores and one-off chores added to that chore day. It plans again from the
 * draft, so moving a chore day or putting a chore off shows straight away.
 */

/** One chore on the chore view, and what tapping it can do. */
export type PlannedChore = {
  id: string;
  name: string;
  icon: string | null;
  /** Regular chores move with their chore day; the others can be put off. */
  kind: "preset" | "generated" | "one-off";
  choreDayId: string;
  /** Put off on this Planner (not saved yet). */
  delayed: boolean;
};

type Line = { key: string; tile: ChoreDay; chore?: undefined } | { key: string; tile?: undefined; chore: PlannedChore };

/** Plans the chores again with the draft's chore days and put-off chores. */
export function useChorePlan(data: ReviewData, draft: ReviewDraft): Map<string, PlanDay> {
  return useMemo(() => {
    const input = data.chorePlan;
    const delays = draft.choreDelays ?? {};
    const week = new Set(data.columns.map((c) => c.date));
    const open = data.columns.filter((c) => c.date >= input.today).map((c) => c.date);
    const moves = [...input.moves.filter((m) => !week.has(m.date)), ...movesFor(input.choreDays, draft, open)];
    const plan = planChoreDays({
      choreDays: input.choreDays,
      chores: input.chores.map((c) => (delays[c.id] ? { ...c, not_before: delays[c.id].date } : c)),
      oneOffs: input.oneOffs.map((o) => (delays[o.id] ? { ...o, not_before: delays[o.id].date } : o)),
      today: input.today,
      away: new Set(input.away),
      keptToday: new Set(input.keptToday.filter((id) => !delays[id])),
      moves,
      errandDates: new Set(input.errandDates),
    });
    return new Map(plan.days.map((d) => [d.date, d]));
  }, [data, draft]);
}

/** A day's chores, under the chore day each one goes on. */
export function choresOnDay(day: PlanDay, data: ReviewData, draft: ReviewDraft): { tile: ChoreDay; chores: PlannedChore[] }[] {
  const delays = draft.choreDelays ?? {};
  const choreById = new Map(data.chorePlan.chores.map((c) => [c.id, c]));
  const oneOffById = new Map(data.chorePlan.oneOffs.map((o) => [o.id, o]));
  const groups = day.choreDays.map((tile) => ({ tile, chores: [] as PlannedChore[] }));
  const put = (ids: string[], chore: Omit<PlannedChore, "choreDayId">) => {
    const g = groups.find((x) => accepts(x.tile, ids)) ?? groups[0];
    if (g) g.chores.push({ ...chore, choreDayId: g.tile.id });
  };
  for (const id of day.presets) {
    const c = choreById.get(id);
    const named = data.choreNames[id];
    if (!c || !named) continue;
    // A regular chore goes on its own chore day.
    const g = groups.find((x) => c.chore_day_ids.includes(x.tile.id));
    if (g) g.chores.push({ id, name: named.name, icon: named.icon, kind: "preset", choreDayId: g.tile.id, delayed: false });
  }
  for (const item of day.items) {
    if (item.kind === "generated") {
      const c = choreById.get(item.id);
      const named = data.choreNames[item.id];
      if (c && named) put(c.chore_day_ids, { id: item.id, name: named.name, icon: named.icon, kind: "generated", delayed: item.id in delays });
    } else {
      const o = oneOffById.get(item.id);
      if (o) put(o.chore_day_id ? [o.chore_day_id] : [], { id: o.id, name: o.title, icon: o.icon, kind: "one-off", delayed: o.id in delays });
    }
  }
  return groups;
}

/** One day's column on the chore view: its tiles, each with its chores, as many lines as fit. */
export function ChoreColumn({
  col,
  groups,
  changedTile,
  onTile,
  onChore,
  onMore,
  note,
}: {
  col: ReviewColumn;
  groups: { tile: ChoreDay; chores: PlannedChore[] }[];
  changedTile: (id: string) => boolean;
  onTile: (id: string) => void;
  onChore: (c: PlannedChore) => void;
  /** Everything on the day, when not all of it fits. */
  onMore: () => void;
  /** Said instead of chores (a day that's over, or too far ahead to plan). */
  note?: string;
}) {
  const [ref, fit] = useFitRows<HTMLUListElement>(8);
  const lines: Line[] = groups.flatMap((g) => [{ key: `t-${g.tile.id}`, tile: g.tile }, ...g.chores.map((c) => ({ key: `c-${g.tile.id}-${c.id}`, chore: c }))]);
  const shown = lines.length > fit ? lines.slice(0, Math.max(1, fit - 1)) : lines;
  const hidden = lines.length - shown.length;
  return (
    <ul ref={ref} className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      {shown.map((line) =>
        line.tile ? (
          <li key={line.key} className="flex h-12 shrink-0">
            <button
              type="button"
              disabled={col.past || line.tile.is_free}
              onClick={() => onTile(line.tile.id)}
              className={`flex w-full min-w-0 items-center gap-2 rounded-[0.875rem] border-2 bg-rail px-2 text-left text-base font-extrabold text-ink enabled:hover:bg-panel ${
                changedTile(line.tile.id) ? "border-accent" : "border-transparent"
              }`}
            >
              <Emoji emoji={line.tile.icon ?? "🧹"} className="size-7" />
              <span className="min-w-0 truncate">{line.tile.name}</span>
            </button>
          </li>
        ) : (
          <li key={line.key} className="flex h-12 shrink-0 pl-3">
            <button
              type="button"
              disabled={col.past}
              onClick={() => onChore(line.chore)}
              className={`flex w-full min-w-0 items-center gap-2 rounded-[0.875rem] border-2 px-1.5 text-left text-base font-bold text-ink enabled:hover:bg-rail ${
                line.chore.delayed ? "border-accent" : "border-transparent"
              }`}
            >
              <Emoji emoji={line.chore.icon ?? "🧹"} className="size-6" />
              <span className="min-w-0 truncate">{line.chore.name}</span>
            </button>
          </li>
        ),
      )}
      {hidden > 0 ? (
        <li className="flex h-12 shrink-0 items-center pl-3">
          <button type="button" onClick={onMore} className="flex min-h-11 items-center rounded-xl px-1.5 text-base font-bold text-accent">
            + {hidden} more
          </button>
        </li>
      ) : null}
      {note ? <li className="px-1 pt-1 text-sm font-bold text-ink-muted">{note}</li> : null}
    </ul>
  );
}
