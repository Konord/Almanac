/*
 * The boxes the Today panel's working part flips between with its arrows
 * (Connor, 2026-11-10): the daily list, Up next, any list (To-do,
 * Groceries…), today's routines and the chore bucket. Each household picks
 * which ones show in Settings; they always come in the same order.
 */

export type PanelBox = { id: string; name: string };

/** The boxes that aren't lists. */
export const FIXED_BOXES = {
  today: "Daily list",
  upnext: "Up next",
  routines: "Routines",
  bucket: "Chores",
} as const;

type ListLike = { id: string; name: string; is_chores: boolean };

/** Every box there could be, in order: the daily list, Up next, the lists, routines, the chore bucket. */
export function allBoxes(lists: ListLike[]): PanelBox[] {
  return [
    { id: "today", name: FIXED_BOXES.today },
    { id: "upnext", name: FIXED_BOXES.upnext },
    // The Chores list isn't a box of its own: the Chores box shows it (Connor, 2026-11-11: one "Chores").
    ...lists.filter((l) => !l.is_chores).map((l) => ({ id: l.id, name: l.name })),
    { id: "routines", name: FIXED_BOXES.routines },
    { id: "bucket", name: FIXED_BOXES.bucket },
  ];
}

/**
 * The boxes a screen shows. `chosen` is the household's pick (null: not
 * picked yet, so everything but the Chores list, which the chore bucket
 * covers). The Agenda has no Up next (its timeline already shows today).
 * There's always at least the daily list.
 */
export function panelBoxes(chosen: readonly string[] | null, lists: ListLike[], agenda: boolean): PanelBox[] {
  const choresList = lists.find((l) => l.is_chores)?.id;
  const wanted = chosen ? new Set(chosen) : null;
  const boxes = allBoxes(lists).filter((b) => (wanted ? wanted.has(b.id) : b.id !== choresList) && !(agenda && b.id === "upnext"));
  return boxes.length ? boxes : [{ id: "today", name: FIXED_BOXES.today }];
}

/** The box before or after one, going round. */
export function stepBox(boxes: PanelBox[], current: string, by: 1 | -1): string {
  const at = Math.max(0, boxes.findIndex((b) => b.id === current));
  return boxes[(at + by + boxes.length) % boxes.length].id;
}
