import type { ReactNode } from "react";
import Link from "next/link";
import { Chips, Emoji, Field, Input } from "@/components/ui";
import { eventEmoji } from "@/lib/emoji";
import { VISIBILITY_OPTIONS } from "./options";
import type { RepeatOptions } from "@/lib/recurrence";
import { CardTabs } from "./quick-controls";
import { WhenFields } from "./when-fields";
import { PendingSync } from "./pending-sync";
import { EmojiPicker } from "@/components/emoji-picker";
import { Stickers } from "./stickers";
import type { DayKind, EventTemplate, Member } from "./types";

/** The form fields for events. */

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

/** How many kinds of day the card offers (nothing scrolls). */
const DAY_KIND_CHIPS = 6;

/**
 * "Makes it a … day": the event turns its dates into this kind of day for
 * the people on it (their wake-up, bedtime and routines follow).
 */
export function DayKindChips({ kinds, value }: { kinds: DayKind[]; value?: string | null }) {
  const shown = kinds.slice(0, DAY_KIND_CHIPS);
  // A kind that's been renamed or removed still shows, so saving keeps it.
  if (value && !shown.some((k) => k.name.toLowerCase() === value.toLowerCase())) shown.push({ name: value, icon: null });
  const chosen = shown.find((k) => value && k.name.toLowerCase() === value.toLowerCase())?.name ?? "";
  return (
    <Chips
      name="dayKind"
      label="Makes it a … day"
      defaultValue={chosen}
      options={[
        { value: "", label: "No change" },
        ...shown.map((k) => ({ value: k.name, label: k.name, leading: k.icon ? <Emoji emoji={k.icon} className="size-6" /> : undefined })),
      ]}
    />
  );
}

/** What the quick-add card starts with, from where you tapped. */
export type QuickDefaults = {
  date: string;
  startTime?: string;
  minutes: number;
  allDay: boolean;
  memberIds?: string[];
};

/** Everything the card can start with when it's editing an existing event. */
export type CardDefaults = QuickDefaults & {
  title?: string;
  icon?: string;
  notes?: string;
  /** The kind of day it makes its dates, if any. */
  dayKind?: string;
  visibility?: string;
  repeat?: RepeatOptions;
  /** Last day, for all-day events over several days. */
  endDate?: string;
};

/**
 * The event card, for adding and editing: name, then the day, start, length
 * dial and end (an end on a later day makes a multi-day event), with person
 * buttons and an All day switch. Repeats and the rest are behind tabs. Put it inside a <form className="group ...">.
 */
export function EventCardFields({
  members,
  dayKinds,
  defaults,
  adding = false,
  templates,
  headsUps,
  initialTab,
}: {
  members: Member[];
  dayKinds: DayKind[];
  defaults: CardDefaults;
  /** Editing only: the event's heads-ups, on their own tab. */
  headsUps?: ReactNode;
  /** Which tab to open on (by its name). */
  initialTab?: string;
  /** Adding a new event: keep the dashed outline on the timeline in step. */
  adding?: boolean;
  /** Ready-made events to start from (adding only). */
  templates?: { list: EventTemplate[]; href: (id: string) => string; chosen?: string; editHref?: string };
}) {
  return (
    <>
      {adding ? <PendingSync defaults={defaults} /> : null}
      <CardTabs
        initial={initialTab === "heads-ups" ? 3 : 0}
        tabs={[
          {
            label: "Event",
            panel: (
              <>
                {templates ? <TemplateRow {...templates} /> : null}
                <div className="flex gap-3">
                  <EmojiPicker initial={defaults.icon} />
                  <div className="min-w-0 flex-1">
                    <Field label="What">
                      <Input name="title" required maxLength={120} placeholder="Dentist, Hockey practice…" autoFocus={adding} defaultValue={defaults.title} />
                    </Field>
                  </div>
                </div>
                <WhenFields
                  date={defaults.date}
                  startTime={defaults.startTime}
                  minutes={defaults.minutes}
                  allDay={defaults.allDay}
                  endDate={defaults.endDate}
                  adding={adding}
                />
                <Stickers members={members} memberIds={defaults.memberIds} />
                <DayKindChips kinds={dayKinds} value={defaults.dayKind} />
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
            label: "More",
            panel: (
              <>
                <Field label="Notes">
                  <Input name="notes" maxLength={2000} defaultValue={defaults.notes} />
                </Field>
                <Chips name="visibility" label="Who can see it" defaultValue={defaults.visibility ?? "everyone"} options={VISIBILITY_OPTIONS} />
              </>
            ),
          },
          ...(headsUps ? [{ label: "Heads-ups", panel: headsUps }] : []),
        ]}
      />
    </>
  );
}

/**
 * Ready-made events across the top of the add card. Tapping one fills in
 * the card (it reloads the card with ?template=). Templates are saved with
 * "Save as a template too" when adding; "Edit templates" opens the list
 * where each can be changed or deleted.
 */
function TemplateRow({
  list,
  href,
  chosen,
  editHref,
}: {
  list: EventTemplate[];
  href: (id: string) => string;
  chosen?: string;
  /** Where "Edit templates" goes (the calendar's Tags and templates panel). */
  editHref?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-base font-bold text-ink">Start from</span>
      {list.length === 0 ? (
        <span className="text-base text-ink-muted">No templates yet. Tick &ldquo;Save as a template too&rdquo; when adding one.</span>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-2">
          {list.slice(0, 6).map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              scroll={false}
              replace
              aria-current={chosen === t.id ? "true" : undefined}
              className={`inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-full border-2 px-4 text-lg ${
                chosen === t.id ? "border-ink bg-rail font-bold" : "border-frame bg-board"
              } text-ink`}
            >
              <Emoji emoji={t.icon || eventEmoji(null, t.title)} className="size-7" />
              {t.title}
            </Link>
          ))}
        </div>
      )}
      {editHref && list.length > 0 ? (
        <Link href={editHref} scroll={false} className="ml-auto flex min-h-[var(--touch-target)] shrink-0 items-center text-base font-bold text-accent">
          Edit templates
        </Link>
      ) : null}
    </div>
  );
}
