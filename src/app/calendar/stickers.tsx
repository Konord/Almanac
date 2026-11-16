import type { CSSProperties } from "react";
import { fieldLabelClass } from "@/components/ui";
import { hand, soft, strong } from "@/lib/colours";
import type { Member } from "./types";

/**
 * The mock's `.who-chip` (g-final-event.html): a round chip with the
 * person's colour dot; ticked, it takes their pastel, border and ink.
 * People are colour chips, never avatars (Glance).
 */
const chip =
  "inline-flex min-h-[var(--touch-target)] cursor-pointer items-center gap-[0.4rem] rounded-full border-2 border-frame bg-board px-[1.1rem] text-[1.25rem] font-bold text-ink select-none has-checked:border-[var(--pc)] has-checked:bg-[var(--ps)] has-checked:text-[var(--hc)] has-focus-visible:outline-2 has-focus-visible:outline-ink";

/**
 * Who an event is for, as colour chips to tap (several is fine, e.g. Mom
 * and Ava). Nobody picked means it's for everyone. Sends "memberIds" with the form.
 */
export function Stickers({ members, memberIds = [] }: { members: Member[]; memberIds?: string[] }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-[0.35rem]">
      <legend className={`mb-[0.35rem] ${fieldLabelClass}`}>Who</legend>
      <div className="flex flex-wrap gap-[0.45rem]">
        {members.map((m) => (
          <label key={m.id} className={chip} style={{ "--pc": strong(m.colour), "--ps": soft(m.colour), "--hc": hand(m.colour) } as CSSProperties}>
            <input type="checkbox" name="memberIds" value={m.id} defaultChecked={memberIds.includes(m.id)} className="sr-only" />
            <span aria-hidden className="size-[1.15rem] shrink-0 rounded-full" style={{ background: strong(m.colour) }} />
            {m.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
