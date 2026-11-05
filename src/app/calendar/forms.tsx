import { Avatar, Chips, Field, Input, Select } from "@/components/ui";
import { PERSON_COLOURS, strong } from "@/lib/colours";
import { ENERGY_OPTIONS, VISIBILITY_OPTIONS } from "./options";
import type { RepeatOptions } from "@/lib/recurrence";
import { CardTabs, LengthControl } from "./quick-controls";
import { PendingSync } from "./pending-sync";
import { EmojiPicker } from "@/components/emoji-picker";
import type { Layer, Member, SavedView } from "./types";

/** The form fields for events and layers. */

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
    <fieldset className="grid gap-4 rounded-[var(--radius)] border-2 border-frame p-4 sm:col-span-2">
      <legend className="px-1 text-base font-bold text-ink">Repeat details</legend>
      <div className="grid grid-cols-[7rem_1fr] items-end gap-4">
        <Field label="Every">
          <Input name="repeatInterval" type="number" min={1} max={52} defaultValue={repeat?.interval ?? 1} aria-describedby="repeat-every-hint" />
        </Field>
        <Chips
          name="repeatEnd"
          label="Stops"
          defaultValue={repeat?.end ?? "never"}
          options={[
            { value: "never", label: "Never" },
            { value: "on", label: "On a date" },
            { value: "after", label: "After some times" },
          ]}
        />
      </div>
      <Chips
        name="repeatWeekdays"
        label="On these days (weekly only)"
        multiple
        defaultValue={(repeat?.weekdays ?? []).map(String)}
        options={WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }))}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Stop date">
          <Input name="repeatUntil" type="date" defaultValue={repeat?.until ?? ""} />
        </Field>
        <Field label="How many times">
          <Input name="repeatCount" type="number" min={1} max={500} defaultValue={repeat?.count ?? ""} />
        </Field>
      </div>
      <p id="repeat-every-hint" className="text-sm text-ink-muted">Every 2 weekly = every other week.</p>
    </fieldset>
  )
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

/** Everything the card can start with when it's editing an existing event. */
export type CardDefaults = QuickDefaults & {
  title?: string;
  icon?: string;
  notes?: string;
  layerId?: string;
  energyCost?: number;
  visibility?: string;
  repeat?: RepeatOptions;
  /** Last day, for all-day events over several days. */
  endDate?: string;
};

/**
 * The event card, for adding and editing: name, day, time and length up front, with
 * person buttons and an All day switch. Repeats, several days and the rest
 * are behind tabs. Put it inside a <form className="group ...">.
 */
export function EventCardFields({
  layers,
  members,
  defaults,
  adding = false,
}: {
  layers: Layer[];
  members: Member[];
  defaults: CardDefaults;
  /** Adding a new event: keep the dashed outline on the timeline in step. */
  adding?: boolean;
}) {
  return (
    <>
      {adding ? <PendingSync defaults={defaults} /> : null}
      {layers.length > 1 ? null : <input type="hidden" name="layerId" value={defaults.layerId ?? layers[0]?.id ?? ""} />}
      <CardTabs
        tabs={[
          {
            label: "Event",
            panel: (
              <>
                <div className="flex gap-3">
                  <EmojiPicker initial={defaults.icon} />
                  <div className="min-w-0 flex-1">
                    <Field label="What">
                      <Input name="title" required maxLength={120} placeholder="Dentist, Hockey practice…" autoFocus={adding} defaultValue={defaults.title} />
                    </Field>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_1fr] gap-4">
                  <Field label="Day">
                    <Input name="startDate" type="date" defaultValue={defaults.date} required />
                  </Field>
                  {/* Hidden while All day is ticked. */}
                  <div className="group-has-[input[name=allDay]:checked]:invisible">
                    <Field label="Starts at">
                      <Input name="startTime" type="time" step={900} defaultValue={defaults.startTime ?? ""} required={false} />
                    </Field>
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1 group-has-[input[name=allDay]:checked]:invisible">
                    <LengthControl initial={defaults.minutes} />
                  </div>
                  <label className="flex min-h-[var(--touch-target)] shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-accent">
                    <input type="checkbox" name="allDay" defaultChecked={defaults.allDay} className="size-5 accent-ink" />
                    All day
                  </label>
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
              </>
            ),
          },
          {
            label: "Repeats",
            panel: (
              <>
                <Chips
                  name="repeatFrequency"
                  label="How often"
                  defaultValue={defaults.repeat?.frequency ?? "none"}
                  options={[
                    { value: "none", label: "No" },
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                />
                <RepeatDetails repeat={defaults.repeat} />
              </>
            ),
          },
          {
            label: "Days",
            panel: (
              <Field label="Runs over several days? Last day" hint="Leave blank if it's just the one day.">
                <Input name="endDate" type="date" defaultValue={defaults.endDate && defaults.endDate !== defaults.date ? defaults.endDate : ""} />
              </Field>
            ),
          },
          {
            label: "More",
            panel: (
              <>
                <Field label="Notes">
                  <Input name="notes" maxLength={2000} defaultValue={defaults.notes} />
                </Field>
                {layers.length > 1 ? (
                  <Chips
                    name="layerId"
                    label="Layer"
                    defaultValue={defaults.layerId ?? layers[0]?.id}
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
                  defaultValue={String(defaults.energyCost ?? 1)}
                  options={ENERGY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />
                <Chips name="visibility" label="Who can see it" defaultValue={defaults.visibility ?? "everyone"} options={VISIBILITY_OPTIONS} />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
