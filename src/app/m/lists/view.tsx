"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus } from "@phosphor-icons/react";
import { Emoji, HandText } from "@/components/ui";
import { strong } from "@/lib/colours";
import { addDays, type LocalDate } from "@/lib/time";
import type { Member } from "../../calendar/types";
import { tickTask } from "../actions";
import { PhoneHeader, chipClass, phonePrimaryClass } from "../phone-ui";

type List = { id: string; name: string; icon: string | null; isChores: boolean };
type Todo = { id: string; listId: string; title: string; icon: string | null; dueDate: LocalDate | null; assigneeId: string | null; done: boolean };

/** The lists, one at a time: tick things off (saved straight away). */
export function PhoneLists({
  lists,
  todos: initial,
  members,
  initialList,
  today,
  locale,
}: {
  lists: List[];
  todos: Todo[];
  members: Member[];
  initialList: string | null;
  today: LocalDate;
  locale: string;
}) {
  const router = useRouter();
  const [listId, setListId] = useState(initialList);
  const [todos, setTodos] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = lists.find((l) => l.id === listId);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const tick = (t: Todo) => {
    setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    start(async () => {
      const r = await tickTask(t.id, !t.done);
      if (!r.ok) {
        setError(r.error);
        setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      } else {
        setError(null);
        router.refresh();
      }
    });
  };

  const mine = todos.filter((t) => t.listId === listId);
  const open = mine.filter((t) => !t.done);
  const done = mine.filter((t) => t.done);
  const due = (d: LocalDate | null) => {
    if (!d) return null;
    if (d === today) return "Today";
    if (d === addDays(today, 1)) return "Tomorrow";
    return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
  };

  return (
    <>
      <PhoneHeader title="Lists">
        <Link href={`/m/add?kind=${list?.isChores ? "chore" : "todo"}`} className={`${phonePrimaryClass} px-4`}>
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Add
        </Link>
      </PhoneHeader>
      <div className="flex flex-col gap-3 px-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lists">
          {lists.map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={l.id === listId} onClick={() => setListId(l.id)} className={chipClass(l.id === listId)}>
              {l.icon ? <Emoji emoji={l.icon} className="size-6" /> : null}
              {l.name}
              <span className="tabular text-ink-muted">{todos.filter((t) => t.listId === l.id && !t.done).length || ""}</span>
            </button>
          ))}
        </div>
        {error ? (
          <p role="alert" className="rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-4 py-3 text-[1.05rem] font-bold text-danger">
            {error}
          </p>
        ) : null}
        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Emoji emoji="✅" className="size-16 opacity-60" />
            <p className="text-[1.2rem] font-bold text-ink">All done</p>
          </div>
        ) : (
          <div className="divide-y divide-frame overflow-hidden rounded-[var(--radius-card)] bg-board shadow-raised">
            {open.map((t) => (
              <Row key={t.id} todo={t} colour={t.assigneeId ? memberById.get(t.assigneeId)?.colour : undefined} due={due(t.dueDate)} late={Boolean(t.dueDate && t.dueDate < today)} onTick={() => tick(t)} />
            ))}
          </div>
        )}
        {done.length > 0 ? (
          <section className="flex flex-col gap-1.5 pt-2">
            <h2 className="px-1 text-[0.95rem] font-bold tracking-[0.06em] text-ink-muted uppercase">Done · {done.length}</h2>
            <div className="divide-y divide-frame overflow-hidden rounded-[var(--radius-card)] bg-board opacity-60 shadow-raised">
              {done.map((t) => (
                <Row key={t.id} todo={t} colour={t.assigneeId ? memberById.get(t.assigneeId)?.colour : undefined} due={null} late={false} onTick={() => tick(t)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Row({ todo, colour, due, late, onTick }: { todo: Todo; colour: string | undefined; due: string | null; late: boolean; onTick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={todo.done} onClick={onTick} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
      <span
        aria-hidden
        className={`flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] ${todo.done ? "border-success bg-success text-white" : "bg-board"}`}
        style={todo.done ? undefined : { borderColor: colour ? strong(colour) : "var(--color-check-border)" }}
      >
        {todo.done ? <Check size="1.1rem" weight="bold" /> : null}
      </span>
      {todo.icon ? <Emoji emoji={todo.icon} className="size-7" /> : null}
      <HandText colour={colour} className={`min-w-0 flex-1 text-[1.25rem] leading-snug font-semibold [overflow-wrap:anywhere] ${todo.done ? "line-through" : ""}`}>
        {todo.title}
      </HandText>
      {due ? <span className={`tabular shrink-0 text-[1rem] font-bold ${late ? "text-danger" : "text-ink-soft"}`}>{due}</span> : null}
    </button>
  );
}
