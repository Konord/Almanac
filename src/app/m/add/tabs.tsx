"use client";

import { useState } from "react";
import type { LocalDate } from "@/lib/time";
import type { Member } from "../../calendar/types";
import { EventForm, type EventDraft } from "../event-form";
import { PhoneSeg } from "../phone-ui";
import { TaskForm, type PhoneChoreDay, type PhoneList } from "../task-form";

type Kind = "event" | "todo" | "chore";

/** Event | To-do | Chore. Each keeps what's typed while another is shown. */
export function AddTabs({
  initialKind,
  members,
  event,
  locale,
  today,
  lists,
  choresListId,
  choreDays,
}: {
  initialKind: Kind;
  members: Member[];
  event: EventDraft;
  locale: string;
  today: LocalDate;
  lists: PhoneList[];
  choresListId: string | null;
  choreDays: PhoneChoreDay[];
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  return (
    <div className="flex flex-col gap-3">
      <div className="px-3">
        <PhoneSeg
          label="What to add"
          value={kind}
          onChange={setKind}
          options={[
            { value: "event", label: "Event" },
            { value: "todo", label: "To-do" },
            { value: "chore", label: "Chore" },
          ]}
        />
      </div>
      <div hidden={kind !== "event"}>
        <EventForm members={members} initial={event} locale={locale} back="/m" />
      </div>
      <div hidden={kind !== "todo"}>
        <TaskForm kind="todo" members={members} lists={lists} choresListId={choresListId} choreDays={choreDays} today={today} locale={locale} />
      </div>
      <div hidden={kind !== "chore"}>
        <TaskForm kind="chore" members={members} lists={lists} choresListId={choresListId} choreDays={choreDays} today={today} locale={locale} />
      </div>
    </div>
  );
}
