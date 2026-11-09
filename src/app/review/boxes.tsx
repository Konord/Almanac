"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkle } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import type { Problem } from "@/lib/weekly-review";
import { Box, CloseButton, Face, Pager, Tile, type Person } from "./parts";

/*
 * The smaller boxes on the weekly review: a list of choices, adding or
 * changing a kind of day, and the things to check.
 */

/** A list of choices (move a chore day, take it off…). */
export type Picker = { title: string; options: { key: string; label: string; icon?: string | null; danger?: boolean; pick: () => void }[] };

const PICKS_SHOWN = 12;

export function PickerBox({ picker, onClose }: { picker: Picker; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(picker.options.length / PICKS_SHOWN));
  const shown = picker.options.slice(page * PICKS_SHOWN, (page + 1) * PICKS_SHOWN);
  return (
    <Box label={picker.title} width="w-[46rem]" onClose={onClose}>
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-2xl font-extrabold text-ink">{picker.title}</h2>
        <CloseButton onClick={onClose} />
      </div>
      {shown.length === 0 ? <p className="text-lg text-ink-muted">Nothing else to pick.</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={o.pick}
            className={`flex min-h-[var(--touch-target)] min-w-0 items-center gap-2 rounded-[var(--radius)] px-3 text-left text-lg font-bold ${
              o.danger ? "bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] text-danger" : "bg-rail text-ink hover:bg-panel"
            }`}
          >
            {o.icon ? <Emoji emoji={o.icon} className="size-7" /> : null}
            <span className="min-w-0 truncate">{o.label}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Pager page={page} pages={pages} setPage={setPage} />
      </div>
    </Box>
  );
}

/** A kind of day, by name, with each person's own version of it. */
export type KindChoice = { key: string; name: string; icon: string | null; typeOf: Record<string, string> };

/**
 * Adding a kind of day (the + beside Kind of day), or changing who has one
 * (tapping it): pick the kind, then who. Anyone picked moves off their old
 * kind that day, so a kind nobody has any more leaves the day.
 */
export function KindBox({
  dayName,
  kinds,
  start,
  members,
  current,
  onApply,
  onClose,
}: {
  dayName: string;
  kinds: KindChoice[];
  /** The kind tapped, or null for the +. */
  start: string | null;
  members: Person[];
  /** Each person's kind (by key) on the day now. */
  current: Record<string, string>;
  onApply: (moves: { memberId: string; typeId: string }[]) => void;
  onClose: () => void;
}) {
  const [kindKey, setKindKey] = useState<string | null>(start);
  const [picked, setPicked] = useState<string[]>([]);
  const kind = kinds.find((k) => k.key === kindKey) ?? null;
  const already = (id: string) => kind !== null && current[id] === kind.key;
  const pages = Math.max(1, Math.ceil(kinds.length / 8));
  const [page, setPage] = useState(0);
  const moving = picked.filter((id) => !already(id));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const kindName = (key: string | undefined) => kinds.find((k) => k.key === key)?.name;

  return (
    <Box label={start ? `${kind?.name} on ${dayName}` : `Add a kind of day on ${dayName}`} width="w-[68rem]" onClose={onClose}>
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-3xl font-extrabold text-ink">{start ? `${kind?.name ?? "Kind of day"} on ${dayName}` : `Add a kind of day on ${dayName}`}</h2>
        <CloseButton onClick={onClose} />
      </div>
      <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Kind of day</h3>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {kinds.slice(page * 8, (page + 1) * 8).map((k) => (
          <Tile
            key={k.key}
            icon={k.icon ?? "📅"}
            label={k.name}
            on={k.key === kindKey}
            height="h-[8.5rem]"
            onClick={() => {
              setKindKey(k.key);
              setPicked([]);
            }}
          />
        ))}
      </div>
      {pages > 1 ? (
        <div className="flex justify-end">
          <Pager page={page} pages={pages} setPage={setPage} />
        </div>
      ) : null}
      {kind ? (
        <>
          <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Who has {kind.name}?</h3>
          <div className="flex flex-wrap gap-2.5">
            {members.map((m) => {
              const has = already(m.id);
              const can = m.id in kind.typeOf;
              const on = has || picked.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={has || !can}
                  onClick={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  aria-pressed={on}
                  title={!can ? `${m.name} has no ${kind.name} kind of day` : undefined}
                  className={`flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-full border-2 pr-5 pl-2 text-lg font-bold disabled:opacity-60 ${
                    on ? "border-ink bg-rail text-ink" : "border-frame text-ink"
                  } ${!can ? "opacity-40" : ""}`}
                >
                  <Face person={m} size="size-10 text-base" />
                  {m.name}
                  {on ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-3 border-t border-frame pt-4.5">
        <p className="min-w-0 flex-1 text-base font-bold text-ink-muted">
          {moving.map((id) => `${nameOf(id)} moves off ${kindName(current[id]) ?? "their usual day"}.`).join(" ")}
        </p>
        <button
          type="button"
          disabled={!kind || moving.length === 0}
          onClick={() => {
            if (!kind) return;
            onApply(moving.map((memberId) => ({ memberId, typeId: kind.typeOf[memberId] })));
          }}
          className="flex min-h-[var(--touch-target)] items-center rounded-2xl bg-ink px-6 text-lg font-bold text-board disabled:opacity-40"
        >
          {kind ? `${start ? "Move to" : "Add"} ${kind.name}` : "Pick a kind"}
        </button>
      </div>
    </Box>
  );
}

const CHECKS_SHOWN = 5;

/** Things worth a second look, each with a fix to approve. */
export function ChecksBox({ problems, onFix, onLeave, onClose }: { problems: Problem[]; onFix: (p: Problem) => void; onLeave: (p: Problem) => void; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(problems.length / CHECKS_SHOWN));
  const at = Math.min(page, pages - 1);
  return (
    <Box label="Things to check" width="w-[64rem]" onClose={onClose}>
      <div className="flex items-center gap-3">
        <Sparkle size="1.75rem" weight="fill" className="text-accent" aria-hidden />
        <h2 className="min-w-0 flex-1 text-3xl font-extrabold text-ink">{problems.length === 0 ? "Nothing to check" : `Things to check (${problems.length})`}</h2>
        <CloseButton onClick={onClose} />
      </div>
      {problems.length === 0 ? <p className="text-lg text-ink-muted">Every day has its usual kind of day, chore days and meals, with nothing in the way.</p> : null}
      <div className="flex flex-col gap-2">
        {problems.slice(at * CHECKS_SHOWN, (at + 1) * CHECKS_SHOWN).map((p) => (
          <div key={p.id} className="flex min-h-[var(--touch-target)] items-center gap-3 rounded-2xl bg-rail px-4 py-2">
            <p className="min-w-0 flex-1 text-lg text-ink">{p.text}</p>
            {p.fix ? (
              <button type="button" onClick={() => onFix(p)} className="flex min-h-12 shrink-0 items-center rounded-xl bg-ink px-4 text-base font-bold text-board">
                {p.fix.label}
              </button>
            ) : null}
            {p.link ? (
              <Link href={p.link.href} className="flex min-h-12 shrink-0 items-center rounded-xl bg-board px-4 text-base font-bold text-ink">
                {p.link.label}
              </Link>
            ) : null}
            <button type="button" onClick={() => onLeave(p)} className="flex min-h-12 shrink-0 items-center rounded-xl px-3 text-base font-bold text-ink-muted hover:bg-board">
              Leave it
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Pager page={at} pages={pages} setPage={setPage} />
      </div>
    </Box>
  );
}
