import type { ReactNode } from "react";
import Link from "next/link";
import { Emoji, editorInputClass, fieldLabelClass } from "@/components/ui";
import { eventEmoji } from "@/lib/emoji";
import { VISIBILITY_OPTIONS } from "./options";
import type { RepeatOptions } from "@/lib/recurrence";
import { CardTabs, ToggleChips, choiceChipClass } from "./quick-controls";
import { WhenFields } from "./when-fields";
import { PendingSync } from "./pending-sync";
import { EmojiPicker } from "@/components/emoji-picker";
import { Stickers } from "./stickers";
import type { DayKind, EventTemplate, Member } from "./types";

/*
 * The event sheet's fields, in the Glance look (g-final-event.html): small
 * grey labels over big bold inputs, people as colour chips, kinds of day
 * as plain chips, and Event | Repeats | More | Heads-ups as tabs.
 */

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A field with its small label above (the mock's `.field`). */
export function SheetField({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-[0.35rem] ${className}`}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </label>
  );
}

/** Big tappable choices (radio or checkbox underneath), in the mock's chip look. */
export function ChoiceChips({
  name,
  label,
  options,
  defaultValue,
  multiple = false,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | readonly string[];
  multiple?: boolean;
}) {
  const chosen = new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue === undefined ? [] : [defaultValue]);
  return (
    <fieldset className="flex min-w-0 flex-col gap-[0.35rem]">
      <legend className={`mb-[0.35rem] ${fieldLabelClass}`}>{label}</legend>
      <div className="flex flex-wrap gap-[0.45rem]">
        {options.map((o) => (
          <label key={o.value} className={choiceChipClass}>
            <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={chosen.has(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The finer repeat choices (how often is the chips above). Turned into an RRULE by the server action. */
function RepeatDetails({ repeat }: { repeat?: RepeatOptions }) {
  return (
    <>
      <div className="grid grid-cols-[8rem_1fr] items-end gap-[0.8rem]">
        <SheetField label="Every">
          <input name="repeatInterval" type="number" min={1} max={52} defaultValue={repeat?.interval ?? 1} className={editorInputClass} />
        </SheetField>
        <ChoiceChips
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
      <ChoiceChips
        name="repeatWeekdays"
        label="On these days (weekly)"
        multiple
        defaultValue={(repeat?.weekdays ?? []).map(String)}
        options={WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }))}
      />
      <div className="grid grid-cols-2 gap-[0.8rem]">
        <SheetField label="Stop date">
          <input name="repeatUntil" type="date" defaultValue={repeat?.until ?? ""} className={editorInputClass} />
        </SheetField>
        <SheetField label="How many times">
          <input name="repeatCount" type="number" min={1} max={500} defaultValue={repeat?.count ?? ""} className={editorInputClass} />
        </SheetField>
      </div>
    </>
  );
}

/** How many kinds of day the sheet offers (nothing scrolls). */
const DAY_KIND_CHIPS = 6;

/**
 * "Kind of day": the event turns its dates into this kind of day for the
 * people on it (their wake-up, bedtime and routines follow). Tap the
 * picked one again for none. Sends "dayKind".
 */
export function DayKindChips({ kinds, value }: { kinds: DayKind[]; value?: string | null }) {
  const shown = kinds.slice(0, DAY_KIND_CHIPS);
  // A kind that's been renamed or removed still shows, so saving keeps it.
  if (value && !shown.some((k) => k.name.toLowerCase() === value.toLowerCase())) shown.push({ name: value, icon: null });
  const chosen = shown.find((k) => value && k.name.toLowerCase() === value.toLowerCase())?.name ?? "";
  return (
    <ToggleChips
      name="dayKind"
      label="Kind of day"
      initial={chosen}
      // Words only, as in the mock, so the kinds fit on one row.
      options={shown.map((k) => ({ value: k.name, label: k.name }))}
    />
  );
}

/** Where it is: plain text, no map (Connor, 15 Nov). Sends "location". */
export function LocationField({ value }: { value?: string | null }) {
  return (
    <SheetField label="Location">
      <input name="location" maxLength={200} defaultValue={value ?? ""} placeholder="Where (optional)" autoComplete="off" className={`${editorInputClass} placeholder:font-semibold placeholder:text-ink-muted`} />
    </SheetField>
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
  /** Where it is (plain text). */
  location?: string;
};

/**
 * The event sheet, for adding and editing: picture and name, then the
 * start, All day and end (with the day, end day and length dial under
 * them; an end on a later day makes a multi-day event), who as colour
 * chips, the kind of day and the place. Repeats and the rest are behind
 * tabs. Put it inside a <form className="group ...">.
 */
export function EventCardFields({
  members,
  dayKinds,
  defaults,
  adding = false,
  templates,
  headsUps,
  repeatText,
  initialTab,
}: {
  members: Member[];
  dayKinds: DayKind[];
  defaults: CardDefaults;
  /** Editing only: the event's heads-ups, on their own tab. */
  headsUps?: ReactNode;
  /** Editing a repeating event: how it repeats now, in words. */
  repeatText?: string;
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
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-[0.8rem]">
                  <EmojiPicker initial={defaults.icon} className="border-0 bg-panel [&_img]:size-[2.35rem]" />
                  <SheetField label="What">
                    <input name="title" required maxLength={120} autoFocus={adding} defaultValue={defaults.title} className={editorInputClass} />
                  </SheetField>
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
                <LocationField value={defaults.location} />
              </>
            ),
          },
          {
            label: "Repeats",
            panel: (
              <>
                {repeatText ? <p className="text-[1.25rem] font-bold text-ink-soft">Now: {repeatText}</p> : null}
                <ChoiceChips
                  name="repeatFrequency"
                  label="How often"
                  defaultValue={defaults.repeat?.frequency ?? "none"}
                  options={[
                    { value: "none", label: "Doesn't repeat" },
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
                <SheetField label="Notes">
                  <textarea
                    name="notes"
                    maxLength={2000}
                    rows={4}
                    defaultValue={defaults.notes}
                    className={`${editorInputClass} resize-none py-3 text-[1.375rem] leading-snug font-semibold`}
                  />
                </SheetField>
                <ChoiceChips name="visibility" label="Who can see it" defaultValue={defaults.visibility ?? "everyone"} options={VISIBILITY_OPTIONS} />
              </>
            ),
          },
          ...(headsUps ? [{ label: "Heads-ups", panel: headsUps }] : []),
        ]}
      />
    </>
  );
}

/** How many templates fit across the top of the add sheet. */
const TEMPLATES_SHOWN = 6;

/**
 * Ready-made events across the top of the add sheet. Tapping one fills in
 * the sheet (it reloads it with ?template=). Templates are saved with
 * "Add and save as a template" when adding, or "Save as a template" on an
 * event; "Edit templates" opens the list where each can be changed or deleted.
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
  /** Where "Edit templates" goes (the calendar's Templates panel). */
  editHref?: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-[0.45rem]">
      <span className={`${fieldLabelClass} mr-1`}>From a template</span>
      {list.length === 0 ? (
        <span className="text-[1.25rem] font-semibold text-ink-muted">None yet: use “Add and save as a template”.</span>
      ) : (
        list.slice(0, TEMPLATES_SHOWN).map((t) => (
          <Link
            key={t.id}
            href={href(t.id)}
            scroll={false}
            replace
            aria-current={chosen === t.id ? "true" : undefined}
            className={`inline-flex min-h-[var(--touch-target)] max-w-[16rem] items-center gap-[0.4rem] rounded-full border-2 px-[0.9rem] text-[1.25rem] font-bold text-ink ${
              chosen === t.id ? "border-ink bg-panel" : "border-frame bg-board"
            }`}
          >
            <Emoji emoji={t.icon || eventEmoji(null, t.title)} className="size-7" />
            <span className="truncate">{t.title}</span>
          </Link>
        ))
      )}
      {editHref && list.length > 0 ? (
        <Link href={editHref} scroll={false} className="inline-flex min-h-[var(--touch-target)] items-center px-2 text-[1.25rem] font-bold text-accent">
          {list.length > TEMPLATES_SHOWN ? `+ ${list.length - TEMPLATES_SHOWN} more` : "Edit templates"}
        </Link>
      ) : null}
    </div>
  );
}
