import { EmojiPicker } from "@/components/emoji-picker";
import { Chips, Field, Input, Select } from "@/components/ui";
import { FEATURE_LINKS } from "@/lib/todos";
import { CHORE_TAGS, isChoreTag, type ChoreDay } from "@/lib/chore-days";
import type { ChoreMember } from "./data";

/*
 * While the form (marked `group`) has "A chore" picked, the day fields hide
 * and the chore fields show, with no script: the group-has-[…] classes
 * below. Tailwind only finds whole class names, so they're written out.
 */

/** The fields for adding or editing a to-do (the form needs the `group` class). */
export function TodoFields({
  members,
  lists,
  todo,
  choreDays = [],
  showList = false,
}: {
  members: ChoreMember[];
  lists?: { id: string; name: string }[];
  /** For a one-off chore: the chore day it waits for. */
  choreDays?: Pick<ChoreDay, "id" | "name">[];
  todo?: {
    title: string;
    icon: string | null;
    due_date: string | null;
    assignee_id: string | null;
    notes: string | null;
    list_id: string;
    date_kind: "due" | "start";
    at_time: string | null;
    lead_days: number | null;
    link: string | null;
    chore_day_id?: string | null;
    is_chore?: boolean;
    tags?: string[];
  };
  showList?: boolean;
}) {
  const chore = Boolean(todo?.is_chore);
  return (
    <>
      <Field label="What needs doing">
        <Input name="title" defaultValue={todo?.title} required maxLength={120} />
      </Field>
      <Field label="Picture" hint="Optional. Tap to pick one.">
        <EmojiPicker initial={todo?.icon ?? ""} nameField="title" className="self-start!" fullScreen />
      </Field>
      <Chips
        name="kind"
        label="It's"
        className="sm:col-span-2"
        options={[
          { value: "task", label: "A task" },
          { value: "chore", label: "A chore: the planner picks a day with room" },
        ]}
        defaultValue={chore ? "chore" : "task"}
      />
      {/* A task's day and time (hidden while "A chore" is picked). */}
      <div className="contents group-has-[input[name=kind][value=chore]:checked]:hidden">
        <Field label="Day" hint="Optional.">
          <Input name="dueDate" type="date" defaultValue={chore ? "" : (todo?.due_date ?? "")} />
        </Field>
        <Chips
          name="dateKind"
          label="That day is"
          options={[
            { value: "due", label: "Done by then" },
            { value: "start", label: "When it starts" },
          ]}
          defaultValue={todo?.date_kind ?? "due"}
        />
        <Field label="Time" hint="Optional. With a day, it shows on the calendar then.">
          <Input name="atTime" type="time" defaultValue={chore ? "" : (todo?.at_time?.slice(0, 5) ?? "")} />
        </Field>
        <Field label="Show it ahead (days)" hint="For one done by a day. Empty: show it all along.">
          <Input name="leadDays" type="number" min={0} max={60} defaultValue={todo?.lead_days ?? ""} />
        </Field>
      </div>
      {/* A chore's tags and chore day (shown while "A chore" is picked). */}
      <div className="hidden group-has-[input[name=kind][value=chore]:checked]:contents">
        <Chips
          name="tags"
          label="Tags"
          multiple
          options={CHORE_TAGS.map((t) => ({ value: t.value, label: t.label }))}
          defaultValue={(todo?.tags ?? []).filter(isChoreTag)}
        />
        <Field label="Chore day" hint="Optional. Empty: any day that isn't kept for one kind of chore.">
          <Select name="choreDayId" defaultValue={todo?.chore_day_id ?? ""}>
            <option value="">Any day with room</option>
            {choreDays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Opens" hint="Optional: tapping it goes there.">
        <Select name="link" defaultValue={todo?.link ?? ""}>
          <option value="">Nothing</option>
          {FEATURE_LINKS.map((l) => (
            <option key={l.path} value={l.path}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="For someone" hint="Optional.">
        <Select name="assigneeId" defaultValue={todo?.assignee_id ?? ""}>
          <option value="">Anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      {showList && lists ? (
        <Field label="List">
          <Select name="listId" defaultValue={todo?.list_id}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Notes" hint="Optional.">
        <Input name="notes" defaultValue={todo?.notes ?? ""} maxLength={2000} />
      </Field>
    </>
  );
}
