import { Field, Input, Select } from "@/components/ui";
import { MEMBER_COLOURS } from "@/lib/colours";
import { ENERGY_OPTIONS, VISIBILITY_OPTIONS } from "./options";
import type { Layer, Member } from "./types";

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
};

export function EventFields({ layers, members, defaults }: { layers: Layer[]; members: Member[]; defaults: EventDefaults }) {
  return (
    <>
      <Field label="What">
        <Input name="title" defaultValue={defaults.title} required maxLength={120} />
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
        <input type="checkbox" name="allDay" defaultChecked={defaults.allDay} className="size-6 accent-marker-blue" />
        All day (times are ignored)
      </label>
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
        <Select name="colour" defaultValue={layer?.colour ?? "marker-blue"}>
          {MEMBER_COLOURS.map((c) => (
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
          className="size-6 accent-marker-blue"
        />
        Events here make a day count as busy
      </label>
    </>
  );
}
