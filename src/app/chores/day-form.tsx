import { EmojiPicker } from "@/components/emoji-picker";
import { Button, Chips, Field, Input } from "@/components/ui";
import type { ChoreDay } from "@/lib/chore-days";
import { removeChoreDay, saveChoreDay } from "./actions";

/** Monday first, the way the week reads. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
  value: String(d),
  label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
}));

/**
 * Adding or changing a chore day: its name and picture, which days of the
 * week it's on, and how much room it has. The Free day fills every day
 * with nothing else, so it only has room to set.
 */
export function ChoreDayFields({ day, returnTo }: { day?: ChoreDay; returnTo: string }) {
  const free = day?.is_free ?? false;
  return (
    <form action={saveChoreDay} className="flex min-h-0 flex-1 flex-col gap-5">
      <input type="hidden" name="id" value={day?.id ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex gap-3">
        <EmojiPicker initial={day?.icon ?? ""} nameField="name" />
        <div className="min-w-0 flex-1">
          <Field label="Chore day">
            <Input name="name" defaultValue={day?.name} required maxLength={40} placeholder="Laundry" />
          </Field>
        </div>
      </div>
      {free ? (
        <p className="text-lg text-ink-muted">
          The Free day is any day with no other chore day. Chores with no chore day of their own can go here.
        </p>
      ) : (
        <>
          <Chips name="weekdays" label="On" multiple defaultValue={(day?.weekdays ?? []).map(String)} options={WEEKDAYS} />
          <div className="flex flex-col gap-2">
            <Toggle name="span" checked={day?.span ?? false} label="Days next to each other are one stretch (a weekend Big Clean)" />
            <Toggle name="restrictive" checked={day?.restrictive ?? false} label="Only its own chores (Laundry day: only laundry)" />
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Room for this many chores" hint="Every-chore-day chores don't count.">
          <Input name="maxTasks" type="number" min={0} max={20} defaultValue={day?.max_tasks ?? 3} />
        </Field>
        <Field label="Of those, Big ones" hint="Chores tagged Big.">
          <Input name="maxBig" type="number" min={0} max={20} defaultValue={day?.max_big ?? 1} />
        </Field>
      </div>
      <div className="mt-auto flex shrink-0 gap-3">
        <Button>{day ? "Save chore day" : "Add chore day"}</Button>
      </div>
    </form>
  );
}

function Toggle({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-3 text-lg text-ink">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-7 shrink-0 accent-[var(--color-ink)]" />
      {label}
    </label>
  );
}

export function removeChoreDayForm(day: ChoreDay, returnTo: string) {
  return (
    <form action={removeChoreDay} className="shrink-0">
      <input type="hidden" name="id" value={day.id} />
      <input type="hidden" name="name" value={day.name} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button variant="danger">Remove chore day</Button>
    </form>
  );
}
