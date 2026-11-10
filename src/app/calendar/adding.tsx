import Link from "next/link";
import { HandTap, X } from "@phosphor-icons/react/dist/ssr";
import { Button, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import type { HouseholdSettings } from "@/lib/household";
import { isLocalDate, isLocalTime } from "@/lib/time";
import { addEvent } from "./actions";
import { EventCardFields, type CardDefaults } from "./forms";
import type { EventTemplate, Member, Tag } from "./types";

/*
 * Adding by placing. Pressing + puts a screen into "adding" mode
 * (?placing=1): you then tap where the event goes (a day on Month, a time
 * on Week, a person's column on Today). That opens the quick-add card with
 * those details filled in (?add=day&start=09:30&mins=60&who=...).
 * Tapping a template on the card adds &template=<id>, which fills in its
 * name, picture, length, people and tags (where you tapped still wins).
 */

type Params = Record<string, string | string[] | undefined>;

export type Pending = CardDefaults & {
  /** The template it started from, if one was tapped. */
  templateId?: string;
};

/** Reads the adding-mode settings from the address. */
export function readAdding(
  params: Params,
  settings: HouseholdSettings,
  members: Member[],
  templates: EventTemplate[],
  tags: Tag[],
  path: "/" | "/calendar",
): { placing: boolean; pending: Pending | null; templateHref: (id: string) => string } {
  // The same address with a template picked (everything else kept).
  const templateHref = (id: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = firstParam(value);
      if (v && !["template", "error", "message"].includes(key)) next.set(key, v);
    }
    next.set("template", id);
    return `${path}?${next.toString()}`;
  };
  const placing = firstParam(params.placing) === "1";
  const add = firstParam(params.add);
  if (!add || !isLocalDate(add)) return { placing, pending: null, templateHref };

  const start = firstParam(params.start);
  const mins = Number(firstParam(params.mins));
  const who = firstParam(params.who);
  const tapped = {
    startTime: start && isLocalTime(start) ? start : undefined,
    minutes: Number.isInteger(mins) && mins >= 15 && mins <= 24 * 60 ? mins : undefined,
    // One person, several ("a,b"), or "all" for the whole row (everyone).
    memberIds: who ? who.split(",").filter((id) => members.some((m) => m.id === id)) : [],
    wholeRow: who === "all",
  };
  const template = templates.find((t) => t.id === firstParam(params.template));
  if (template) {
    const memberIds = new Set(members.map((m) => m.id));
    const tagIds = new Set(tags.map((t) => t.id));
    // A timed template placed on a day (Month) takes its own start time.
    const startTime = tapped.startTime ?? template.start_time ?? undefined;
    return {
      placing: false,
      templateHref,
      pending: {
        templateId: template.id,
        date: add,
        title: template.title,
        icon: template.icon ?? "",
        notes: template.notes ?? "",
        startTime,
        minutes: template.minutes,
        allDay: template.all_day || !startTime,
        memberIds: tapped.memberIds.length > 0 || tapped.wholeRow ? tapped.memberIds : template.member_ids.filter((id) => memberIds.has(id)),
        tagIds: template.tag_ids.filter((id) => tagIds.has(id)),
      },
    };
  }
  const pending: Pending = {
    startTime: tapped.startTime,
    memberIds: tapped.memberIds,
    date: add,
    minutes: tapped.minutes ?? settings.defaultEventMinutes,
    // Tapping a day (rather than a time) makes an all-day event, which you can switch off.
    allDay: firstParam(params.allday) === "1",
  };
  return { placing: false, pending, templateHref };
}

/** The bar that shows you're adding, with what to tap and a way out. */
export function PlacingBar({ hint, cancelHref }: { hint: string; cancelHref: string }) {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_12%,white)] py-2 pr-2 pl-5 text-xl font-bold text-ink"
    >
      <HandTap size="1.75rem" weight="bold" aria-hidden className="text-accent" />
      <span className="flex-1">{hint}</span>
      <Link
        href={cancelHref}
        scroll={false}
        className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] bg-board px-4 text-lg font-bold text-ink"
      >
        <X size="1.25rem" weight="bold" aria-hidden />
        Cancel
      </Link>
    </div>
  );
}

/** The quick-add card, sliding in from the right. */
export function QuickAddSheet({
  pending,
  members,
  tags,
  templates,
  templateHref,
  closeHref,
  returnTo,
  returnPath,
  side = "right",
}: {
  side?: "left" | "right";
  pending: Pending;
  members: Member[];
  tags: Tag[];
  templates: EventTemplate[];
  templateHref: (id: string) => string;
  closeHref: string;
  /** e.g. "view=week&date=2026-11-05", so saving goes back to the same place. */
  returnTo: string;
  returnPath: "/" | "/calendar";
}) {
  return (
    <Sheet title="Add an event" closeHref={closeHref} narrow side={side}>
      {/* A new template remounts the form so its fields start from the template. */}
      <form key={pending.templateId ?? "blank"} action={addEvent} className="group flex h-full flex-col gap-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <EventCardFields
          members={members}
          tags={tags}
          defaults={pending}
          adding
          templates={{
            list: templates,
            href: templateHref,
            chosen: pending.templateId,
            editHref: `/calendar?${returnTo ? `${returnTo}&` : ""}panel=tags`,
          }}
        />
        <div className="mt-auto flex shrink-0 items-center gap-3">
          <Button>Add event</Button>
          <Link
            href={closeHref}
            scroll={false}
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-rail px-5 text-lg font-bold text-ink"
          >
            Cancel
          </Link>
          {pending.templateId ? null : (
            <label className="ml-auto flex min-h-[var(--touch-target)] cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-accent">
              <input type="checkbox" name="saveTemplate" className="size-5 accent-ink" />
              Save as a template too
            </label>
          )}
        </div>
      </form>
    </Sheet>
  );
}
