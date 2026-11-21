"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Plus } from "@phosphor-icons/react";
import { Emoji, HandText } from "@/components/ui";
import { addGrocery, clearTickedGroceries, readGroceries, tickGrocery, type GroceriesResult } from "../../groceries/actions";
import type { GroceryLine } from "../../groceries/data";
import { PhoneHeader, phoneInputClass, phonePrimaryClass, phoneSecondaryClass } from "../phone-ui";

/*
 * The grocery list on the phone. Every tap saves straight away, like on
 * the wall screen. What's still to get is grouped by aisle; ticked lines
 * drop to the bottom until "Clear ticked". It reads the list again when
 * the phone comes back to it, so changes from the kitchen show up.
 */
export function PhoneGroceries({ initial }: { initial: GroceryLine[] }) {
  const [lines, setLines] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();

  const take = (r: GroceriesResult) => {
    if (r.ok) {
      setLines(r.lines);
      setError(null);
    } else setError(r.error);
  };
  const run = (f: () => Promise<GroceriesResult>) => start(async () => take(await f()));

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") readGroceries().then(take);
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);

  const tick = (l: GroceryLine) => {
    setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, checked: !l.checked } : x)));
    run(() => tickGrocery(l.id, !l.checked));
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    setName("");
    run(() => addGrocery(n));
  };

  const toGet = lines.filter((l) => !l.checked);
  const got = lines.filter((l) => l.checked);
  const aisles = [...new Set(toGet.map((l) => l.aisle))];

  return (
    <>
      <PhoneHeader title="Groceries" sub={toGet.length ? `${toGet.length} to get` : undefined} />
      <div className="flex flex-col gap-3 px-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add something"
            aria-label="Add something"
            enterKeyHint="done"
            maxLength={60}
            className={`${phoneInputClass} font-hand text-[1.25rem]`}
          />
          <button type="submit" disabled={!name.trim()} className={`${phonePrimaryClass} px-4`} aria-label="Add">
            <Plus size="1.3rem" weight="bold" aria-hidden />
          </button>
        </form>
        {error ? (
          <p role="alert" className="rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-4 py-3 text-[1.05rem] font-bold text-danger">
            {error}
          </p>
        ) : null}

        {toGet.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Emoji emoji="🛒" className="size-16 opacity-60" />
            <p className="text-[1.2rem] font-bold text-ink">{lines.length ? "Got everything" : "Nothing on the list"}</p>
          </div>
        ) : (
          aisles.map((aisle) => (
            <section key={aisle} className="flex flex-col gap-1.5">
              <h2 className="px-1 text-[0.95rem] font-bold tracking-[0.06em] text-ink-muted uppercase">{aisle}</h2>
              <div className="divide-y divide-frame overflow-hidden rounded-[var(--radius-card)] bg-board shadow-raised">
                {toGet
                  .filter((l) => l.aisle === aisle)
                  .map((l) => (
                    <Row key={l.id} line={l} open={open === l.id} onOpen={() => setOpen(open === l.id ? null : l.id)} onTick={() => tick(l)} />
                  ))}
              </div>
            </section>
          ))
        )}

        {got.length > 0 ? (
          <section className="flex flex-col gap-1.5 pt-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-[0.95rem] font-bold tracking-[0.06em] text-ink-muted uppercase">Got · {got.length}</h2>
              <button type="button" onClick={() => run(clearTickedGroceries)} className={phoneSecondaryClass}>
                Clear ticked
              </button>
            </div>
            <div className="divide-y divide-frame overflow-hidden rounded-[var(--radius-card)] bg-board shadow-raised">
              {got.map((l) => (
                <Row key={l.id} line={l} open={false} onOpen={() => tick(l)} onTick={() => tick(l)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Row({ line, open, onOpen, onTick }: { line: GroceryLine; open: boolean; onOpen: () => void; onTick: () => void }) {
  const more = line.parts.length > 1 || Boolean(line.detail);
  return (
    <div className={`flex flex-col ${line.checked ? "opacity-60" : ""}`}>
      <div className="flex min-h-14 items-center gap-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={line.checked}
          onClick={onTick}
          aria-label={line.checked ? `Put ${line.name} back on the list` : `Got ${line.name}`}
          className="flex size-14 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-8 items-center justify-center rounded-full border-[3px] ${line.checked ? "border-success bg-success text-white" : "border-check-border bg-board"}`}
            aria-hidden
          >
            {line.checked ? <Check size="1.1rem" weight="bold" /> : null}
          </span>
        </button>
        <button type="button" onClick={more ? onOpen : onTick} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 pr-4 text-left">
          {line.icon ? <Emoji emoji={line.icon} className="size-7" /> : null}
          <HandText className={`min-w-0 flex-1 text-[1.25rem] leading-snug font-semibold [overflow-wrap:anywhere] ${line.checked ? "line-through" : ""}`}>{line.name}</HandText>
          {line.need ? <span className="tabular max-w-[45%] shrink-0 text-right text-[1rem] leading-tight font-bold text-ink-soft">{line.need}</span> : null}
        </button>
      </div>
      {open ? (
        <div className="flex flex-col gap-0.5 pr-4 pb-3 pl-14 text-[1rem] font-semibold text-ink-muted">
          {line.detail ? <span>{line.detail}</span> : null}
          {line.parts.length > 1
            ? line.parts.map((p, i) => (
                <span key={i}>
                  {p.label}: <span className="font-bold text-ink-soft">{p.text}</span>
                </span>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
