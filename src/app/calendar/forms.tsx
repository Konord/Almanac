import { Avatar, Chips, Field, Input, Select } from "@/components/ui";
import { PERSON_COLOURS, strong } from "@/lib/colours";
import { ENERGY_OPTIONS, VISIBILITY_OPTIONS } from "./options";
import type { RepeatOptions } from "@/lib/recurrence";
import { ExtraTabs, LengthControl } from "./quick-controls";
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
  const repeat = defaults.repeat;
  // Open "More options" straight away if this event already uses any of them.
  const usesMore = Boolean(
    defaults.icon ||
      defaults.notes ||
      (defaults.endDate && defaults.endDate !== defaults.startDate) ||
      (defaults.energyCost ?? 1) !== 1 ||
      (defaults.visibility ?? "everyone") !== "everyone" ||
      (repeat && repeat.frequency !== "none" && (repeat.interval > 1 || repeat.weekdays.length > 0 || repeat.end !== "never")),
  );

  return (
    <>
      <Field label="What">
        <Input name="title" defaultValue={defaults.title} required maxLength={120} placeholder="Dentist, Hockey practice…" autoFocus={!defaults.title} />
      </Field>
      <Field label="Date">
        <Input name="startDate" type="date" defaultValue={defaults.startDate} required />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:col-span-2">
        <Field label="Starts at" hint="Leave both times blank for all day.">
          <Input name="startTime" type="time" defaultValue={defaults.allDay ? "" : defaults.startTime} />
        </Field>
        <Field label="Ends at" hint="Optional.">
          <Input name="endTime" type="time" defaultValue={defaults.allDay ? "" : defaults.endTime} />
        </Field>
      </div>
      <Chips
        name="memberId"
        label="Who it's for"
        className="sm:col-span-2"
        defaultValue={defaults.memberId ?? ""}
        options={[
          { value: "", label: "Everyone" },
          ...members.map((m) => ({ value: m.id, label: m.name, leading: <Avatar name={m.name} colour={m.colour} size="sm" /> })),
        ]}
      />
      {layers.length > 1 ? (
        <Chips
          name="layerId"
          label="Layer"
          className="sm:col-span-2"
          defaultValue={defaults.layerId ?? layers[0]?.id}
          options={layers.map((l) => ({
            value: l.id,
            label: l.name,
            leading: <span aria-hidden className="size-4 rounded-full" style={{ background: strong(l.colour) }} />,
          }))}
        />
      ) : (
        <input type="hidden" name="layerId" value={layers[0]?.id ?? ""} />
      )}
      <Chips
        name="repeatFrequency"
        label="Repeats"
        className="sm:col-span-2"
        defaultValue={repeat?.frequency ?? "none"}
        options={[
          { value: "none", label: "No" },
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
        ]}
      />
      <details open={usesMore} className="group rounded-[var(--radius-card)] border border-frame px-4 sm:col-span-2">
        <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-lg font-bold text-ink">
          More options
          <span className="ml-2 font-normal text-ink-muted">picture, several days, repeat details, energy, who sees it, notes</span>
        </summary>
        <div className="grid gap-4 pb-4 sm:grid-cols-2">
          <Field label="Picture" hint="One emoji, like 🦷 or 🏒. Leave blank to let Almanac pick from the title.">
            <Input name="icon" defaultValue={defaults.icon} maxLength={8} placeholder="🗓️" />
          </Field>
          <Field label="Ends on" hint="Only for events over several days.">
            <Input name="endDate" type="date" defaultValue={defaults.endDate === defaults.startDate ? "" : defaults.endDate} />
          </Field>
          <RepeatDetails repeat={repeat} />
          <Chips
            name="energyCost"
            label="Energy cost"
            className="sm:col-span-2"
            defaultValue={String(defaults.energyCost ?? 1)}
            options={ENERGY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          />
          <Chips name="visibility" label="Who can see it" className="sm:col-span-2" defaultValue={defaults.visibility ?? "everyone"} options={VISIBILITY_OPTIONS} />
          <Field label="Notes" hint="Optional.">
            <Input name="notes" defaultValue={defaults.notes} maxLength={2000} />
          </Field>
        </div>
      </details>
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

/** The finer repeat choices (how often lives in the chips above). Turned into an RRULE by the server action. */
function RepeatDetails({ repeat }: { repeat?: RepeatOptions }) {
  return (
    <fieldset className="grid gap-4 rounded-[var(--radius)] border-2 border-frame p-4 sm:col-span-2 sm:grid-cols-[10rem_1fr]">
      <legend className="px-1 text-base font-bold text-ink">Repeat details</legend>
      <Field label="Every" hint="2 = every other week, and so on.">
        <Input name="repeatInterval" type="number" min={1} max={52} defaultValue={repeat?.interval ?? 1} />
      </Field>
      <Chips
        name="repeatWeekdays"
        label="On these days (weekly only)"
        multiple
        defaultValue={(repeat?.weekdays ?? []).map(String)}
        options={WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }))}
      />
      <Chips
        name="repeatEnd"
        label="Stops"
        defaultValue={repeat?.end ?? "never"}
        className="sm:col-span-2"
        options={[
          { value: "never", label: "Never" },
          { value: "on", label: "On a date" },
          { value: "after", label: "After a number of times" },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 sm:col-span-2">
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

/** What the quick-add card starts with, from where you tapped. */
export type QuickDefaults = {
  date: string;
  startTime?: string;
  minutes: number;
  allDay: boolean;
  memberId?: string;
};

/**
 * The small "add an event" card: name, day, time and length up front, with
 * person buttons and an All day switch. Repeats, several days and the rest
 * are behind tabs. Put it inside a <form className="group ...">.
 */
export function QuickAddFields({ layers, members, defaults }: { layers: Layer[]; members: Member[]; defaults: QuickDefaults }) {
  return (
    <>
      <Field label="What">
        <Input name="title" required maxLength={120} placeholder="Dentist, Hockey practice…" autoFocus />
      </Field>
      <div className="grid grid-cols-[1fr_auto] items-end gap-4">
        <Field label="Day">
          <Input name="startDate" type="date" defaultValue={defaults.date} required />
        </Field>
        <label className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <input type="checkbox" name="allDay" defaultChecked={defaults.allDay} className="size-5 accent-ink" />
          All day
        </label>
      </div>
      {/* Hidden while All day is ticked. */}
      <div className="grid gap-4 group-has-[input[name=allDay]:checked]:hidden">
        <Field label="Starts at">
          <Input name="startTime" type="time" step={900} defaultValue={defaults.startTime ?? ""} required={false} />
        </Field>
        <LengthControl initial={defaults.minutes} />
      </div>
      <Chips
        name="memberId"
        label="Who it's for"
        defaultValue={defaults.memberId ?? ""}
        options={[
          { value: "", label: "Everyone" },
          ...members.map((m) => ({ value: m.id, label: m.name, leading: <Avatar name={m.name} colour={m.colour} size="sm" /> })),
        ]}
      />
      {layers.length > 1 ? null : <input type="hidden" name="layerId" value={layers[0]?.id ?? ""} />}
      <ExtraTabs
        tabs={[
          {
            label: "Repeats",
            panel: (
              <>
                <Chips
                  name="repeatFrequency"
                  label="How often"
                  className="sm:col-span-2"
                  defaultValue="none"
                  options={[
                    { value: "none", label: "No" },
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                />
                <RepeatDetails />
              </>
            ),
          },
          {
            label: "Several days",
            panel: (
              <Field label="Ends on" hint="The last day it runs. Leave blank for one day.">
                <Input name="endDate" type="date" />
              </Field>
            ),
          },
          {
            label: "More",
            panel: (
              <>
                <Field label="Picture" hint="One emoji. Leave blank to let Almanac pick from the name.">
                  <Input name="icon" maxLength={8} placeholder="🗓️" />
                </Field>
                <Field label="Notes" hint="Optional.">
                  <Input name="notes" maxLength={2000} />
                </Field>
                {layers.length > 1 ? (
                  <Chips
                    name="layerId"
                    label="Layer"
                    className="sm:col-span-2"
                    defaultValue={layers[0]?.id}
                    options={layers.map((l) => ({
                      value: l.id,
                      label: l.name,
                      leading: <span aria-hidden className="size-4 rounded-full" style={{ background: strong(l.colour) }} />,
                    }))}
                  />
                ) : null}
                <Chips
                  name="energyCost"
                  label="Energy cost"
                  className="sm:col-span-2"
                  defaultValue="1"
                  options={ENERGY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />
                <Chips name="visibility" label="Who can see it" className="sm:col-span-2" defaultValue="everyone" options={VISIBILITY_OPTIONS} />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
