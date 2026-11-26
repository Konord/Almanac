import { X } from "@phosphor-icons/react/dist/ssr";
import { Button, Chips, Emoji, fieldLabelClass, Input } from "@/components/ui";
import { LEAD_UNITS, leadLabel } from "@/lib/heads-ups";
import { NumberStepper } from "@/components/touch-pickers";
import { createClient } from "@/lib/supabase/server";
import { addHeadsUp, removeHeadsUp } from "./actions";

/*
 * The heads-ups on one event or chore, with a way to add more. It sits
 * inside the event's (or chore's) own form, so its buttons send to their
 * own actions with formAction, and its fields start with "hu" so they
 * don't get mixed up with the event's.
 */

export type HeadsUp = { id: string; label: string; minutes_before: number; makes: "todo" | "grocery" };

/** Room for this many on one card without scrolling. */
const MAX_HEADS_UPS = 4;

export async function loadHeadsUps(source: { eventId: string } | { choreId: string }): Promise<HeadsUp[]> {
  const supabase = await createClient();
  const query = supabase.from("heads_ups").select("id, label, minutes_before, makes").order("minutes_before", { ascending: false });
  const { data, error } = await ("eventId" in source ? query.eq("event_id", source.eventId) : query.eq("chore_id", source.choreId));
  if (error) throw error;
  return (data ?? []) as HeadsUp[];
}

export function HeadsUpEditor({
  headsUps,
  source,
  returnTo,
}: {
  headsUps: HeadsUp[];
  source: { eventId: string } | { choreId: string };
  /** The page to come back to, opened on this tab. */
  returnTo: string;
}) {
  return (
    <div className="grid content-start gap-4">
      <input type="hidden" name="huReturnTo" value={returnTo} />
      {"eventId" in source ? (
        <input type="hidden" name="huEventId" value={source.eventId} />
      ) : (
        <input type="hidden" name="huChoreId" value={source.choreId} />
      )}
      {headsUps.length === 0 ? (
        null
      ) : (
        <ul className="flex flex-col">
          {headsUps.map((h) => (
            <li key={h.id} className="flex min-h-[3.6rem] items-center gap-[0.6rem] border-b border-frame last:border-0">
              <Emoji emoji={h.makes === "grocery" ? "🛒" : "🔔"} className="size-8" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[1.35rem] font-bold text-ink">{h.label}</span>
                <span className="text-[1.15rem] font-bold text-ink-muted">
                  {leadLabel(h.minutes_before)}
                  {h.makes === "grocery" ? " · on the grocery list" : ""}
                </span>
              </span>
              <button
                formAction={removeHeadsUp.bind(null, h.id)}
                formNoValidate
                aria-label={`Remove the heads-up ${h.label}`}
                className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink"
              >
                <X size="1.5rem" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {headsUps.length < MAX_HEADS_UPS ? (
        <div className="grid gap-3 rounded-[var(--radius-card)] bg-rail px-[1.1rem] py-4">
          <div className="flex items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
              <span className={fieldLabelClass}>New heads-up</span>
              <Input name="huLabel" maxLength={80} />
            </label>
            <label className="flex shrink-0 flex-col gap-[0.35rem]">
              <span className={fieldLabelClass}>How long</span>
              <NumberStepper name="huAmount" min={0} max={999} defaultValue={1} aria-label="How long" />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <Chips
              name="huUnit"
              label="Before"
              defaultValue="days"
              options={LEAD_UNITS.map((u) => ({ value: u.unit, label: u.label }))}
            />
            <Chips
              name="huMakes"
              label="It makes"
              defaultValue="todo"
              options={[
                { value: "todo", label: "To-do" },
                { value: "grocery", label: "Grocery" },
              ]}
            />
          </div>
          <div>
            <Button variant="secondary" formAction={addHeadsUp} formNoValidate>
              Add heads-up
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[1.25rem] font-bold text-ink-muted">That&rsquo;s the most for one {"eventId" in source ? "event" : "chore"}.</p>
      )}
    </div>
  );
}
