import { Avatar } from "@/components/ui";
import type { Member } from "./types";

const tile =
  "relative flex w-[5.25rem] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-[var(--radius)] border-2 border-transparent px-1 pt-1.5 pb-1 text-ink select-none hover:bg-rail has-checked:border-ink has-checked:bg-rail has-focus-visible:outline-2 has-focus-visible:outline-accent";
const label = "line-clamp-1 w-full text-center text-sm leading-tight font-bold break-all";

/**
 * Who an event is for, as stickers to tap (several is fine, e.g. Mom and
 * Ava). Nobody picked means it's for everyone. Sends "memberIds" with the form.
 */
export function Stickers({ members, memberIds = [] }: { members: Member[]; memberIds?: string[] }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">
        Who
      </legend>
      <div className="flex flex-wrap items-start gap-1">
        {members.map((m) => (
          <label key={m.id} className={tile}>
            <input type="checkbox" name="memberIds" value={m.id} defaultChecked={memberIds.includes(m.id)} className="sr-only" />
            <Avatar name={m.name} colour={m.colour} icon={m.icon} size="lg" />
            <span className={label}>{m.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
