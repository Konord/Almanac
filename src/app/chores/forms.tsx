import { Chips, Field, Input, Select } from "@/components/ui";
import { FEATURE_LINKS } from "@/lib/todos";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import type { Chore, ChoreMember } from "./data";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The fields for adding or editing a chore. */
export function ChoreFields({ chore, members }: { chore?: Chore; members: ChoreMember[] }) {
  const seasonal = Boolean(chore?.season_start);
  const [startMonth, startDay] = (chore?.season_start ?? "10-01").split("-").map(Number);
  const [endMonth, endDay] = (chore?.season_end ?? "10-31").split("-").map(Number);

  return (
    <>
      <Field label="Chore">
        <Input name="name" defaultValue={chore?.name} required maxLength={80} placeholder="Clean the fridge" />
      </Field>
      <Field label="Picture" hint="One emoji, like 🧹 or 🧊.">
        <Input name="icon" defaultValue={chore?.icon ?? ""} maxLength={8} placeholder="🧹" />
      </Field>
      <Field label="Size">
        <Select name="size" defaultValue={chore?.size ?? "small"}>
          <option value="small">Small (a few minutes)</option>
          <option value="medium">Medium</option>
          <option value="big">Big (a proper job)</option>
        </Select>
      </Field>
      <Field label="How important" hint="The Survival button won't skip important chores unless you tick them.">
        <Select name="importance" defaultValue={chore?.importance ?? "normal"}>
          <option value="low">Can wait</option>
          <option value="normal">Normal</option>
          <option value="high">Important</option>
        </Select>
      </Field>
      <Field label="About how many minutes" hint="Optional.">
        <Input name="estMinutes" type="number" min={1} max={1440} defaultValue={chore?.est_minutes ?? ""} />
      </Field>

      <fieldset className="grid gap-4 rounded-[var(--radius-card)] border border-frame p-4 sm:col-span-2 sm:grid-cols-3">
        <legend className="px-2 text-lg font-bold text-ink">How often</legend>
        <Field label="Every">
          <Input name="repeatEvery" type="number" min={1} max={365} defaultValue={chore?.repeat_every ?? 1} />
        </Field>
        <Field label="Unit">
          <Select name="repeatUnit" defaultValue={chore?.repeat_unit ?? "week"}>
            <option value="day">Days</option>
            <option value="week">Weeks</option>
            <option value="month">Months</option>
            <option value="year">Years</option>
          </Select>
        </Field>
        <Field label="Best day" hint="Optional, e.g. Saturday is cleaning day.">
          <Select name="preferredWeekday" defaultValue={chore?.preferred_weekday === null || chore?.preferred_weekday === undefined ? "" : String(chore.preferred_weekday)}>
            <option value="">Any day</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-base text-ink-muted sm:col-span-3">
          It comes back that long after it was last done or skipped, so a missed week never piles up.
        </p>
        <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink sm:col-span-3">
          <input type="checkbox" name="seasonal" defaultChecked={seasonal} className="size-6 accent-accent" />
          Seasonal instead: once a year, between these dates
        </label>
        <div className="grid grid-cols-2 gap-3 sm:col-span-3 sm:grid-cols-4">
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
      </fieldset>

      <Field label="Who usually does it" hint="Optional.">
        <Select name="assigneeId" defaultValue={chore?.default_assignee_id ?? ""}>
          <option value="">Whoever&apos;s free</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
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
      <Field label="Notes" hint="Optional, e.g. which filter to buy.">
        <Input name="notes" defaultValue={chore?.notes ?? ""} maxLength={2000} />
      </Field>
    </>
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
