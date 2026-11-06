import type { ReactNode } from "react";
import { EmojiPicker } from "@/components/emoji-picker";
import { Chips, Field, Input, Select } from "@/components/ui";
import { SEASONS, snapOf, type ChoreSnap } from "@/lib/chores";
import { CardTabs } from "../calendar/quick-controls";
import { FEATURE_LINKS } from "@/lib/todos";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import type { Chore, ChoreMember } from "./data";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SNAP_OPTIONS: { value: ChoreSnap; label: string }[] = [
  { value: "none", label: "Any day" },
  { value: "weekday", label: "The nearest" },
  { value: "first_of_month", label: "First of the month:" },
  { value: "last_of_month", label: "Last of the month:" },
  { value: "first_of_season", label: "First of the season:" },
  { value: "last_of_season", label: "Last of the season:" },
];

function onlyInOf(chore?: Chore): string {
  if (chore?.season_start) return "dates";
  if (chore?.only_seasons?.length) return "seasons";
  if (chore?.only_months?.length) return "months";
  return "any";
}

/**
 * The fields for adding or editing a chore, on tabs so nothing scrolls:
 * the chore itself, when it comes back (the rule builder), when in the
 * year it's allowed, the rest, and (when editing) its heads-ups.
 * Put it inside a <form className="group ...">: some fields show or hide
 * with the choices made.
 */
export function ChoreFields({
  chore,
  members,
  headsUps,
  initialTab,
}: {
  chore?: Chore;
  members: ChoreMember[];
  headsUps?: ReactNode;
  initialTab?: string;
}) {
  const [startMonth, startDay] = (chore?.season_start ?? "10-01").split("-").map(Number);
  const [endMonth, endDay] = (chore?.season_end ?? "10-31").split("-").map(Number);
  const snap = chore ? snapOf(chore) : "none";

  return (
    <CardTabs
      initial={initialTab === "heads-ups" ? 4 : 0}
      tabs={[
        {
          label: "Chore",
          panel: (
            <>
              <div className="flex gap-3">
                <EmojiPicker initial={chore?.icon ?? ""} nameField="name" />
                <div className="min-w-0 flex-1">
                  <Field label="Chore">
                    <Input name="name" defaultValue={chore?.name} required maxLength={80} placeholder="Clean the fridge" />
                  </Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Size">
                  <Select name="size" defaultValue={chore?.size ?? "small"}>
                    <option value="small">Small (a few minutes)</option>
                    <option value="medium">Medium</option>
                    <option value="big">Big (a proper job)</option>
                  </Select>
                </Field>
                <Field label="How important">
                  <Select name="importance" defaultValue={chore?.importance ?? "normal"}>
                    <option value="low">Can wait</option>
                    <option value="normal">Normal</option>
                    <option value="high">Important (Survival keeps it)</option>
                  </Select>
                </Field>
                <Field label="About how many minutes">
                  <Input name="estMinutes" type="number" min={1} max={1440} defaultValue={chore?.est_minutes ?? ""} />
                </Field>
                <Field label="Who usually does it">
                  <Select name="assigneeId" defaultValue={chore?.default_assignee_id ?? ""}>
                    <option value="">Whoever&apos;s free</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </>
          ),
        },
        {
          label: "When",
          panel: (
            <>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                <Chips
                  name="repeatFrom"
                  label="Counts from"
                  defaultValue={chore?.repeat_from ?? "done"}
                  options={[
                    { value: "done", label: "When it was last done" },
                    { value: "date", label: "A set date" },
                  ]}
                />
                <div className="invisible group-has-[input[name=repeatFrom][value=date]:checked]:visible">
                  <Input name="startDate" type="date" aria-label="The date it counts from" defaultValue={chore?.start_date ?? ""} />
                </div>
              </div>
              <div className="flex items-end gap-4">
                <Field label="Every">
                  <Input name="repeatEvery" type="number" min={1} max={365} defaultValue={chore?.repeat_every ?? 1} className="w-24" />
                </Field>
                <Chips
                  name="repeatUnit"
                  label="&nbsp;"
                  defaultValue={chore?.repeat_unit ?? "week"}
                  options={[
                    { value: "day", label: "Days" },
                    { value: "week", label: "Weeks" },
                    { value: "month", label: "Months" },
                    { value: "year", label: "Years" },
                  ]}
                />
              </div>
              <div className="flex items-end gap-4">
                <Field label="Lands on">
                  <Select name="snap" defaultValue={snap}>
                    {SNAP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="group-has-[select[name=snap]_option[value=none]:checked]:invisible">
                  <Select name="preferredWeekday" aria-label="Day of the week" defaultValue={String(chore?.preferred_weekday ?? 6)}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <p className="text-base text-ink-muted">
                From when it was last done, a missed one never piles up. A set date keeps a steady schedule, like every other
                Monday.
              </p>
            </>
          ),
        },
        {
          label: "Only in",
          panel: (
            <>
              <Chips
                name="onlyIn"
                label="Only at some times of year?"
                defaultValue={onlyInOf(chore)}
                options={[
                  { value: "any", label: "Any time" },
                  { value: "seasons", label: "Some seasons" },
                  { value: "months", label: "Some months" },
                  { value: "dates", label: "Once a year, between dates" },
                ]}
              />
              <div className="hidden group-has-[input[name=onlyIn][value=seasons]:checked]:block">
                <Chips
                  name="onlySeasons"
                  label="Seasons (spring from Mar 20, summer Jun 21, fall Sep 22, winter Dec 21)"
                  multiple
                  defaultValue={chore?.only_seasons ?? []}
                  options={SEASONS.map((x) => ({ value: x.season, label: x.label }))}
                />
              </div>
              <div className="hidden group-has-[input[name=onlyIn][value=months]:checked]:block">
                <Chips
                  name="onlyMonths"
                  label="Months"
                  multiple
                  defaultValue={(chore?.only_months ?? []).map(String)}
                  options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m.slice(0, 3) }))}
                />
              </div>
              <div className="hidden grid-cols-4 gap-3 group-has-[input[name=onlyIn][value=dates]:checked]:grid">
                <Field label="From">
                  <Select name="seasonStartMonth" defaultValue={String(startMonth)}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Day">
                  <Select name="seasonStartDay" defaultValue={String(startDay)}>
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To">
                  <Select name="seasonEndMonth" defaultValue={String(endMonth)}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Day">
                  <Select name="seasonEndDay" defaultValue={String(endDay)}>
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </>
          ),
        },
        {
          label: "More",
          panel: (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Inside or outside">
                  <Select name="location" defaultValue={chore?.location ?? "indoor"}>
                    <option value="indoor">Inside</option>
                    <option value="outdoor">Outside</option>
                  </Select>
                </Field>
                <Field label="Who can see it">
                  <Select name="visibility" defaultValue={chore?.visibility ?? "everyone"}>
                    {VISIBILITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Notes" hint="Optional, e.g. which filter to buy.">
                <Input name="notes" defaultValue={chore?.notes ?? ""} maxLength={2000} />
              </Field>
            </>
          ),
        },
        ...(headsUps ? [{ label: "Heads-ups", panel: headsUps }] : []),
      ]}
    />
  );
}

/** The fields for adding or editing a to-do. */
export function TodoFields({
  members,
  lists,
  todo,
  showList = false,
}: {
  members: ChoreMember[];
  lists?: { id: string; name: string }[];
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
  };
  showList?: boolean;
}) {
  return (
    <>
      <Field label="What needs doing">
        <Input name="title" defaultValue={todo?.title} required maxLength={120} />
      </Field>
      <Field label="Picture" hint="Optional: one emoji.">
        <Input name="icon" defaultValue={todo?.icon ?? ""} maxLength={8} />
      </Field>
      <Field label="Day" hint="Optional.">
        <Input name="dueDate" type="date" defaultValue={todo?.due_date ?? ""} />
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
      <Field label="Starts at" hint="Optional, for one that starts on its day.">
        <Input name="atTime" type="time" defaultValue={todo?.at_time?.slice(0, 5) ?? ""} />
      </Field>
      <Field label="Show it ahead (days)" hint="For one done by a day. Empty: show it all along.">
        <Input name="leadDays" type="number" min={0} max={60} defaultValue={todo?.lead_days ?? ""} />
      </Field>
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
