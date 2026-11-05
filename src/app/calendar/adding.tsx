import Link from "next/link";
import { HandTap, X } from "@phosphor-icons/react/dist/ssr";
import { Button, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import type { HouseholdSettings } from "@/lib/household";
import { isLocalDate, isLocalTime } from "@/lib/time";
import { addEvent } from "./actions";
import { QuickAddFields, type QuickDefaults } from "./forms";
import type { Layer, Member } from "./types";

/*
 * Adding by placing. Pressing + puts a screen into "adding" mode
 * (?placing=1): you then tap where the event goes (a day on Month, a time
 * on Week, a person's column on Today). That opens the quick-add card with
 * those details filled in (?add=day&start=09:30&mins=60&who=...).
 */

type Params = Record<string, string | string[] | undefined>;

/** Reads the adding-mode settings from the address. */
export function readAdding(params: Params, settings: HouseholdSettings, members: Member[]) {
  const placing = firstParam(params.placing) === "1";
  const add = firstParam(params.add);
  if (!add || !isLocalDate(add)) return { placing, pending: null };

  const start = firstParam(params.start);
  const mins = Number(firstParam(params.mins));
  const who = firstParam(params.who);
  const pending: QuickDefaults = {
    date: add,
    startTime: start && isLocalTime(start) ? start : undefined,
    minutes: Number.isInteger(mins) && mins >= 15 && mins <= 24 * 60 ? mins : settings.defaultEventMinutes,
    // Tapping a day (rather than a time) makes an all-day event, which you can switch off.
    allDay: firstParam(params.allday) === "1",
    memberId: who && members.some((m) => m.id === who) ? who : undefined,
  };
  return { placing: false, pending };
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
  layers,
  members,
  closeHref,
  returnTo,
  returnPath,
  side = "right",
}: {
  side?: "left" | "right";
  pending: QuickDefaults;
  layers: Layer[];
  members: Member[];
  closeHref: string;
  /** e.g. "view=week&date=2026-11-05", so saving goes back to the same place. */
  returnTo: string;
  returnPath: "/" | "/calendar";
}) {
  return (
    <Sheet title="Add an event" closeHref={closeHref} narrow side={side}>
      {layers.length === 0 ? (
        <p className="text-lg text-ink-muted">Add a layer first (under Layers on the calendar).</p>
      ) : (
        <form action={addEvent} className="group grid gap-5">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="returnPath" value={returnPath} />
          <QuickAddFields layers={layers} members={members} defaults={pending} />
          <div className="flex gap-3">
            <Button>Add event</Button>
            <Link
              href={closeHref}
              scroll={false}
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-rail px-5 text-lg font-bold text-ink"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </Sheet>
  );
}
