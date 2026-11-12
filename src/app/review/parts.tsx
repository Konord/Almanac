"use client";

import { Pager as PageArrows } from "@/components/pager";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import { soft, strong } from "@/lib/colours";

/*
 * Small pieces the weekly review's screen and its boxes share.
 */

export type Person = { id: string; name: string; colour: string; icon: string | null };

/** A person's face: their picture in their colour, or their first letter. */
export function Face({ person, size = "size-7 text-[0.8125rem]" }: { person: Person | undefined; size?: string }) {
  if (!person) return null;
  if (person.icon) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full border-2 ${size}`} style={{ background: soft(person.colour), borderColor: strong(person.colour) }} title={person.name}>
        <Emoji emoji={person.icon} className="size-[72%]" />
      </span>
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${size}`} style={{ background: strong(person.colour) }} title={person.name}>
      {[...person.name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** A box over the middle of the screen (tap outside or ✕ to close). */
export function Box({
  label,
  width = "w-[48rem]",
  onClose,
  children,
}: {
  label: string;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,35,45,0.38)]" role="dialog" aria-label={label} onClick={onClose}>
      <div className={`flex max-h-[94vh] max-w-[94vw] flex-col gap-5 overflow-hidden rounded-[1.875rem] bg-board p-7 shadow-2xl ${width}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-2xl bg-rail text-ink hover:bg-panel">
      <X size="1.5rem" weight="bold" aria-hidden />
    </button>
  );
}

/** "1 of 3" with a next button, for anything that would otherwise scroll. */
export function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (p: number) => void }) {
  return <PageArrows page={page} pages={pages} onPage={setPage} />;
}

/** A big square choice with a picture, as in the meal picker. */
export function Tile({
  icon,
  label,
  note,
  on = false,
  onClick,
  height = "h-[10.5rem]",
}: {
  icon: string | null | undefined;
  label: string;
  note?: string;
  on?: boolean;
  onClick: () => void;
  height?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative flex min-w-0 flex-col items-center justify-center gap-2.5 rounded-[1.375rem] border-[3px] px-2 text-center text-lg leading-tight font-extrabold ${height} ${
        on ? "border-meal-ink bg-meal text-meal-ink" : "border-transparent bg-rail text-ink hover:bg-panel"
      }`}
    >
      {note ? <span className="absolute top-2.5 right-3 text-sm font-bold text-ink-muted">{note}</span> : null}
      <Emoji emoji={icon ?? "🍽️"} className="size-[4.5rem]" />
      <span className="line-clamp-2">{label}</span>
    </button>
  );
}

export function SectionTitle({ title, onAdd, addLabel }: { title: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 px-0.5">
      <h3 className="flex-1 text-sm font-bold tracking-wide text-ink-muted uppercase">{title}</h3>
      {onAdd ? (
        <button type="button" onClick={onAdd} aria-label={addLabel} className="flex size-10 items-center justify-center rounded-xl bg-board text-2xl leading-none font-bold text-ink hover:bg-panel">
          +
        </button>
      ) : null}
    </div>
  );
}
