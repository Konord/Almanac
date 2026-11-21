"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Emoji } from "@/components/ui";
import { LeaveDialog, useUnsavedChanges } from "@/components/unsaved-changes";
import { hand, soft, strong } from "@/lib/colours";
import { CHORE_TAGS, type ChoreTag } from "@/lib/chore-days";
import { addDays, type LocalDate } from "@/lib/time";
import type { Member } from "../calendar/types";
import { addTask } from "./actions";
import { FieldLabel, PickField, chipClass, dateText, phoneInputClass, phonePrimaryClass, phoneSecondaryClass } from "./phone-ui";

export type PhoneList = { id: string; name: string; icon: string | null };
export type PhoneChoreDay = { id: string; name: string; icon: string | null };

type Draft = {
  title: string;
  listId: string;
  /** "" = no date */
  dueDate: string;
  assigneeId: string;
  tags: ChoreTag[];
  choreDayId: string;
};

/**
 * Adding a to-do (to one of the lists) or a one-off chore (to the Chores
 * list, where the chore planner picks its day). Stays open after each one,
 * for the next.
 */
export function TaskForm({
  kind,
  members,
  lists,
  choresListId,
  choreDays,
  today,
  locale,
}: {
  locale: string;
  kind: "todo" | "chore";
  members: Member[];
  lists: PhoneList[];
  choresListId: string | null;
  choreDays: PhoneChoreDay[];
  today: LocalDate;
}) {
  const router = useRouter();
  const blank: Draft = {
    title: "",
    listId: kind === "chore" ? (choresListId ?? "") : (lists[0]?.id ?? ""),
    dueDate: "",
    assigneeId: "",
    tags: [],
    choreDayId: "",
  };
  const [saved, setSaved] = useState(blank);
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = draft.title.trim() !== "";
  const unsaved = useUnsavedChanges(dirty, () => setDraft(saved));
  const set = (change: Partial<Draft>) => {
    setNote(null);
    setDraft((d) => ({ ...d, ...change }));
  };

  const save = (then?: string | null) => {
    setError(null);
    const f = new FormData();
    f.set("title", draft.title);
    f.set("listId", draft.listId);
    f.set("assigneeId", draft.assigneeId);
    if (kind === "todo") {
      f.set("dueDate", draft.dueDate);
      f.set("dateKind", "due");
    } else {
      for (const t of draft.tags) f.append("tags", t);
      f.set("choreDayId", draft.choreDayId);
    }
    start(async () => {
      const result = await addTask(f);
      if (!result.ok) {
        setError(result.error);
        unsaved.stay();
        return;
      }
      // Keep the list and person for the next one; clear the rest.
      const next = { ...draft, title: "", dueDate: "", tags: [] as ChoreTag[] };
      setSaved(next);
      setDraft(next);
      setNote(`Added ${draft.title.trim()}.`);
      unsaved.saved(then ?? null);
      if (!then) router.refresh();
    });
  };

  const tomorrow = addDays(today, 1);
  const dateChoice = draft.dueDate === "" ? "none" : draft.dueDate === today ? "today" : draft.dueDate === tomorrow ? "tomorrow" : "pick";

  if (kind === "chore" && !choresListId) {
    return <p className="px-4 py-6 text-[1.1rem] font-semibold text-ink-muted">There&rsquo;s no Chores list yet.</p>;
  }

  return (
    <form
      className="flex flex-col gap-3 px-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save();
      }}
    >
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-board px-4 py-4 shadow-raised">
        <label className="flex flex-col gap-1">
          <FieldLabel>{kind === "chore" ? "Chore" : "To-do"}</FieldLabel>
          <input
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={kind === "chore" ? "Clean the gutters" : "Call the dentist"}
            enterKeyHint="done"
            maxLength={120}
            className={`${phoneInputClass} font-hand text-[1.3rem]`}
            style={{ color: hand(members.find((m) => m.id === draft.assigneeId)?.colour) }}
          />
        </label>

        {kind === "todo" && lists.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>List</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {lists.map((l) => (
                <button key={l.id} type="button" aria-pressed={draft.listId === l.id} onClick={() => set({ listId: l.id })} className={chipClass(draft.listId === l.id)}>
                  {l.icon ? <Emoji emoji={l.icon} className="size-6" /> : null}
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {kind === "todo" ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Due</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["none", "No date", ""],
                  ["today", "Today", today],
                  ["tomorrow", "Tomorrow", tomorrow],
                ] as const
              ).map(([value, label, date]) => (
                <button key={value} type="button" aria-pressed={dateChoice === value} onClick={() => set({ dueDate: date })} className={chipClass(dateChoice === value)}>
                  {label}
                </button>
              ))}
              <PickField
                type="date"
                label="Pick a date"
                value={dateChoice === "pick" ? draft.dueDate : today}
                min={today}
                text={dateChoice === "pick" ? dateText(draft.dueDate, locale) : "Pick a day"}
                onChange={(dueDate) => set({ dueDate })}
                className={`w-auto flex-1 px-4 ${dateChoice === "pick" ? "border-ink" : ""}`}
              />
            </div>
          </div>
        ) : null}

        {members.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Who</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={draft.assigneeId === ""} onClick={() => set({ assigneeId: "" })} className={chipClass(draft.assigneeId === "")}>
                Anyone
              </button>
              {members.map((m) => {
                const on = draft.assigneeId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ assigneeId: m.id })}
                    className={`inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 px-3.5 text-[1.05rem] font-bold ${on ? "" : "border-frame bg-board text-ink"}`}
                    style={on ? { borderColor: strong(m.colour), background: soft(m.colour), color: hand(m.colour) } : undefined}
                  >
                    <span aria-hidden className="size-3 rounded-full" style={{ background: strong(m.colour) }} />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {kind === "chore" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Tags</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {CHORE_TAGS.map((t) => {
                  const on = draft.tags.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ tags: on ? draft.tags.filter((x) => x !== t.value) : [...draft.tags, t.value] })}
                      className={chipClass(on)}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {choreDays.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Chore day</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={draft.choreDayId === ""} onClick={() => set({ choreDayId: "" })} className={chipClass(draft.choreDayId === "")}>
                    Any day
                  </button>
                  {choreDays.map((d) => (
                    <button key={d.id} type="button" aria-pressed={draft.choreDayId === d.id} onClick={() => set({ choreDayId: d.id })} className={chipClass(draft.choreDayId === d.id)}>
                      {d.icon ? <Emoji emoji={d.icon} className="size-6" /> : null}
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 -mx-3 flex flex-col gap-2 bg-rail/95 px-3 py-2">
      {error ? (
          <p role="alert" className="rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-4 py-3 text-[1.05rem] font-bold text-danger">
            {error}
          </p>
        ) : null}
        {note && !dirty ? (
          <p role="status" className="rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-success)_10%,white)] px-4 py-3 text-[1.05rem] font-bold text-success">
            {note}
          </p>
        ) : null}
        <div className="flex gap-2">
        {dirty ? (
          <button type="button" onClick={() => setDraft(saved)} disabled={pending} className={phoneSecondaryClass}>
            Undo
          </button>
        ) : null}
        <button type="submit" disabled={pending || !dirty} className={`${phonePrimaryClass} flex-1`}>
          {pending ? "Adding…" : kind === "chore" ? "Add chore" : "Add to-do"}
        </button>
        </div>
      </div>

      {unsaved.leaving ? (
        <LeaveDialog what={kind === "chore" ? "this chore" : "this to-do"} saving={pending} onSave={() => save(unsaved.leaving)} onStay={unsaved.stay} onLeave={unsaved.leaveWithoutSaving} />
      ) : null}
    </form>
  );
}
