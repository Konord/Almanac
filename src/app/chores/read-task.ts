import { isLocalDate, isLocalTime } from "@/lib/time";
import { isChoreTag } from "@/lib/chore-days";

/*
 * Reading a to-do's or one-off chore's fields (shared by the lists' actions
 * and the phone's). Each problem goes to `fail`, which never returns.
 */

export type Fail = (message: string) => never;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function readIcon(formData: FormData, fail: Fail): string | null {
  const icon = text(formData, "icon");
  if (icon && [...icon].length > 4) fail("The picture should be one emoji, like 🧹.");
  return icon || null;
}

export function readTodo(formData: FormData, fail: Fail) {
  const title = text(formData, "title");
  const dueDate = text(formData, "dueDate");
  if (!title) fail("Write what needs doing.");
  if (title.length > 120) fail("Keep it under 120 letters.");
  if (dueDate && !isLocalDate(dueDate)) fail("That date doesn't look right.");
  const dateKind = text(formData, "dateKind") === "start" ? "start" : "due";
  const atTime = text(formData, "atTime");
  if (atTime && !isLocalTime(atTime)) fail("The time should look like 9:30 am.");
  const leadText = text(formData, "leadDays");
  const leadDays = leadText === "" ? null : Number(leadText);
  if (leadDays !== null && !(Number.isInteger(leadDays) && leadDays >= 0 && leadDays <= 60)) fail("Show it between 0 and 60 days before.");
  return {
    title,
    icon: readIcon(formData, fail),
    due_date: dueDate || null,
    date_kind: dateKind,
    // Only a to-do with a day can have a time ("by 3 pm" or "at 3 pm").
    at_time: dueDate && atTime ? atTime : null,
    lead_days: dateKind === "due" ? leadDays : null,
    // Tasks no longer open a part of the app (Connor, 2026-11-10).
    link: null,
    assignee_id: text(formData, "assigneeId") || null,
    notes: text(formData, "notes") || null,
  };
}

/**
 * A one-off chore's fields (Connor, 2026-11-10): anything on the Chores
 * list. It has tags and maybe a chore day, and the chore planner picks its
 * day, so it has no day fields of its own.
 */
export function readChore(formData: FormData, fail: Fail) {
  const title = text(formData, "title");
  if (!title) fail("Write what needs doing.");
  if (title.length > 120) fail("Keep it under 120 letters.");
  const tags = formData.getAll("tags").map(String).filter(isChoreTag);
  return {
    title,
    icon: readIcon(formData, fail),
    // Tasks no longer open a part of the app (Connor, 2026-11-10).
    link: null,
    assignee_id: text(formData, "assigneeId") || null,
    notes: text(formData, "notes") || null,
    tags,
    must_do: tags.includes("essential"),
    chore_day_id: text(formData, "choreDayId") || null,
  };
}
