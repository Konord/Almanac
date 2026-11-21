import { EmojiPicker } from "@/components/emoji-picker";
import { Chips, Field, Input, Select } from "@/components/ui";
import { DayField, NumberStepper, TimeField } from "@/components/touch-pickers";
import { CHORE_TAGS, isChoreTag, type ChoreDay } from "@/lib/chore-days";
import type { ChoreMember } from "./data";

/**
 * The fields for adding or editing a to-do. A one-off chore (on the Chores
 * list) has tags and a chore day instead of a day and time, and stays on
 * the Chores list.
 */
export function TodoFields({
  members,
  lists,
  todo,
  choreDays = [],
  showList = false,
  chore = false,
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
    tags?: string[];
  };
  showList?: boolean;
  /** It's on the Chores list. */
  chore?: boolean;
}) {
  return (
    <>
      <Field label="What needs doing">
        <Input name="title" defaultValue={todo?.title} required maxLength={120} />
      </Field>
      <Field label="Picture">
        <EmojiPicker initial={todo?.icon ?? ""} nameField="title" className="self-start!" fullScreen />
      </Field>
      {chore ? (
        <ChoreFields choreDays={choreDays} tags={todo?.tags ?? []} choreDayId={todo?.chore_day_id ?? null} />
      ) : (
      <>
        <Field label="Day">
          <DayField name="dueDate" defaultValue={todo?.due_date ?? ""} allowEmpty emptyText="No day" aria-label="Day" />
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
        <Field label="Time">
          <TimeField name="atTime" defaultValue={todo?.at_time?.slice(0, 5) ?? ""} step={5} allowEmpty emptyText="No time" aria-label="Time" />
        </Field>
        <Field label="Show it ahead">
          <NumberStepper name="leadDays" min={0} max={60} defaultValue={todo?.lead_days ?? null} allowEmpty unit="days" aria-label="Show it ahead" />
        </Field>
      </>
      )}
      <Field label="For someone">
        <Select name="assigneeId" defaultValue={todo?.assignee_id ?? ""}>
          <option value="">Anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      {showList && lists && !chore ? (
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
      <Field label="Notes">
        <Input name="notes" defaultValue={todo?.notes ?? ""} maxLength={2000} />
      </Field>
    </>
  );
}

/** A one-off chore's tags and chore day. */
export function ChoreFields({
  choreDays,
  tags,
  choreDayId,
}: {
  choreDays: Pick<ChoreDay, "id" | "name">[];
  tags: string[];
  choreDayId: string | null;
}) {
  return (
    <>
      <Chips
        name="tags"
        label="Tags"
        multiple
        options={CHORE_TAGS.map((t) => ({ value: t.value, label: t.label }))}
        defaultValue={tags.filter(isChoreTag)}
      />
      <Field label="Chore day">
        <Select name="choreDayId" defaultValue={choreDayId ?? ""}>
          <option value="">Any day</option>
          {choreDays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
