import { Field, Input, Select } from "@/components/ui";
import { PERSON_COLOURS } from "@/lib/colours";
import { ENERGY_OPTIONS, VISIBILITY_OPTIONS } from "./options";
import type { RepeatOptions } from "@/lib/recurrence";
import type { Layer, Member, SavedView } from "./types";

/** The form fields for adding or editing an event or a layer. */

export type EventDefaults = {
  title?: string;
  layerId?: string;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  memberId?: string;
  energyCost?: number;
  visibility?: string;
  notes?: string;
  icon?: string;
  repeat?: RepeatOptions;
};

export function EventFields({ layers, members, defaults }: { layers: Layer[]; members: Member[]; defaults: EventDefaults }) {
  return (
    <>
      <Field label="What">
        <Input name="title" defaultValue={defaults.title} required maxLength={120} />
      </Field>
      <Field label="Picture" hint="One emoji, like 🦷 or 🏒. Leave blank to let Almanac pick from the title.">
        <Input name="icon" defaultValue={defaults.icon} maxLength={8} placeholder="🗓️" />
      </Field>
      <Field label="Layer">
        <Select name="layerId" defaultValue={defaults.layerId ?? layers[0]?.id}>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input name="startDate" type="date" defaultValue={defaults.startDate} required />
      </Field>
      <Field label="Ends on" hint="Leave blank if it's the same day.">
        <Input name="endDate" type="date" defaultValue={defaults.endDate === defaults.startDate ? "" : defaults.endDate} />
      </Field>
      <Field label="Starts at">
        <Input name="startTime" type="time" defaultValue={defaults.startTime} />
      </Field>
      <Field label="Ends at">
        <Input name="endTime" type="time" defaultValue={defaults.endTime} />
      </Field>
      <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink sm:col-span-2">
        <input type="checkbox" name="allDay" defaultChecked={defaults.allDay} className="size-6 accent-accent" />
        All day (times are ignored)
      </label>
      <RepeatFields repeat={defaults.repeat} />
      <Field label="Who it's for" hint="Optional.">
        <Select name="memberId" defaultValue={defaults.memberId ?? ""}>
          <option value="">Nobody in particular</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Energy cost" hint="How draining it is. Busy days are worked out from this later.">
        <Select name="energyCost" defaultValue={String(defaults.energyCost ?? 1)}>
          {ENERGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Who can see it">
        <Select name="visibility" defaultValue={defaults.visibility ?? "everyone"}>
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" hint="Optional.">
        <Input name="notes" defaultValue={defaults.notes} maxLength={2000} />
      </Field>
    </>
  );
}

export function LayerFields({ layer, members }: { layer?: Layer; members: Member[] }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" defaultValue={layer?.name} required maxLength={40} />
      </Field>
      <Field label="Colour">
        <Select name="colour" defaultValue={layer?.colour ?? "blue"}>
          {PERSON_COLOURS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Whose layer" hint="Optional, e.g. Dad's court schedule.">
        <Select name="ownerMemberId" defaultValue={layer?.owner_member_id ?? ""}>
          <option value="">The whole family</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Who can see it">
        <Select name="visibility" defaultValue={layer?.visibility ?? "everyone"}>
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink sm:col-span-2">
        <input
          type="checkbox"
          name="countsTowardBusyness"
          defaultChecked={layer?.counts_toward_busyness ?? true}
          className="size-6 accent-accent"
        />
        Events here make a day count as busy
      </label>
    </>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Repeats" choices, turned into an RRULE by the server action. */
function RepeatFields({ repeat }: { repeat?: RepeatOptions }) {
  return (
    <fieldset className="grid gap-4 rounded-[var(--radius)] border-2 border-frame p-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="px-1 text-base font-medium text-ink">Repeats</legend>
      <Field label="How often">
        <Select name="repeatFrequency" defaultValue={repeat?.frequency ?? "none"}>
          <option value="none">Doesn&apos;t repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly (same date)</option>
          <option value="yearly">Yearly</option>
        </Select>
      </Field>
      <Field label="Every" hint="1 = every week, 2 = every other week, and so on.">
        <Input name="repeatInterval" type="number" min={1} max={52} defaultValue={repeat?.interval ?? 1} />
      </Field>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-base font-medium text-ink">On these days (weekly only)</span>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, i) => (
            <label
              key={label}
              className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-base text-ink"
            >
              <input
                type="checkbox"
                name="repeatWeekdays"
                value={i}
                defaultChecked={repeat?.weekdays.includes(i)}
                className="size-5 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
        <span className="text-sm text-ink-muted">Leave all unticked to use the event&apos;s own day.</span>
      </div>
      <Field label="Ends">
        <Select name="repeatEnd" defaultValue={repeat?.end ?? "never"}>
          <option value="never">Never</option>
          <option value="on">On a date</option>
          <option value="after">After a number of times</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="End date">
          <Input name="repeatUntil" type="date" defaultValue={repeat?.until ?? ""} />
        </Field>
        <Field label="Times">
          <Input name="repeatCount" type="number" min={1} max={500} defaultValue={repeat?.count ?? ""} />
        </Field>
      </div>
    </fieldset>
  );
}

/** Name and layers for a saved view. */
export function ViewFields({ layers, view }: { layers: Layer[]; view?: SavedView }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" defaultValue={view?.name} required maxLength={40} placeholder="e.g. Court and appointments" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-base font-medium text-ink">Layers it shows</legend>
        <div className="flex flex-wrap gap-2">
          {layers.map((layer) => (
            <label
              key={layer.id}
              className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-base text-ink"
            >
              <input
                type="checkbox"
                name="layerIds"
                value={layer.id}
                defaultChecked={view?.layer_ids.includes(layer.id)}
                className="size-5 accent-accent"
              />
              {layer.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
