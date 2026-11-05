"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { EmojiPicker } from "@/components/emoji-picker";
import { saveBackupParts } from "../actions";

/*
 * A backup meal's parts: what it's made of, how much one meal uses, how
 * many you have now, and the fewest to keep before it goes on the list.
 */

type PartDraft = { name: string; uses: string; onHand: string; keep: string };

const MAX_PARTS = 8;
const cell = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-3 text-lg text-ink outline-none focus:border-accent";

export function PartsEditor({ recipeId, name, icon, initial, returnTo }: { recipeId: string; name: string; icon: string; initial: PartDraft[]; returnTo: string }) {
  const [parts, setParts] = useState<PartDraft[]>(initial.length ? initial : [{ name: "", uses: "1", onHand: "1", keep: "1" }]);
  const change = (i: number, patch: Partial<PartDraft>) => setParts((p) => p.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={saveBackupParts} className="flex min-h-0 flex-1 flex-col gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="parts" value={JSON.stringify(parts)} />
      <div className="flex items-end gap-4">
        <EmojiPicker initial={icon} nameField="name" />
        <label className="flex flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Name</span>
          <input name="name" defaultValue={name} maxLength={80} required className={`${cell} w-[30rem]`} />
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_9rem_3.5rem] gap-2 text-base font-bold text-ink-muted">
        <span>Part</span>
        <span>One meal uses</span>
        <span>Have now</span>
        <span>Keep at least</span>
        <span />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {parts.map((p, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_9rem_3.5rem] items-center gap-2">
            <input aria-label="Part" className={cell} value={p.name} placeholder="Frozen lasagne" maxLength={60} onChange={(e) => change(i, { name: e.target.value })} />
            <input aria-label="One meal uses" className={cell} value={p.uses} inputMode="decimal" onChange={(e) => change(i, { uses: e.target.value })} />
            <input aria-label="Have now" className={cell} value={p.onHand} inputMode="decimal" onChange={(e) => change(i, { onHand: e.target.value })} />
            <input aria-label="Keep at least" className={cell} value={p.keep} inputMode="decimal" onChange={(e) => change(i, { keep: e.target.value })} />
            <button type="button" aria-label="Remove part" onClick={() => setParts((rows) => rows.filter((_, j) => j !== i))} className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-rail">
              <Trash size="1.375rem" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-4 border-t border-frame pt-3">
        <button
          type="button"
          disabled={parts.length >= MAX_PARTS}
          onClick={() => setParts((rows) => [...rows, { name: "", uses: "1", onHand: "1", keep: "1" }])}
          className="inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-5 text-lg font-bold text-ink disabled:opacity-40"
        >
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Part
        </button>
        <p className="text-lg text-ink-muted">Using the meal counts each part down. Below &quot;keep at least&quot;, it&apos;s suggested for the grocery list.</p>
        <button className="ml-auto inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-ink px-6 text-lg font-bold text-board">Save</button>
      </div>
    </form>
  );
}
