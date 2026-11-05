"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { Avatar, Emoji } from "@/components/ui";
import { eventEmoji, searchEmoji, suggestEmoji } from "@/lib/emoji";
import { createTag } from "./actions";
import type { Member, Tag } from "./types";

const tile =
  "relative flex w-[5.25rem] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-[var(--radius)] border-2 border-transparent px-1 pt-1.5 pb-1 text-ink select-none hover:bg-rail has-checked:border-ink has-checked:bg-rail has-focus-visible:outline-2 has-focus-visible:outline-accent";
const label = "line-clamp-1 w-full text-center text-sm leading-tight font-bold break-all";

/**
 * Who an event is for and what it's about, as stickers to tap: people
 * first (tap several, e.g. Mom and Ava), then tags like Work. Nobody picked
 * means it's for everyone. "+ Tag" makes a new tag on the spot.
 * Sends "memberIds" and "tagIds" with the form.
 */
export function Stickers({
  members,
  tags: initialTags,
  memberIds = [],
  tagIds = [],
}: {
  members: Member[];
  tags: Tag[];
  memberIds?: string[];
  tagIds?: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [fresh, setFresh] = useState<string[]>([]);
  const [making, setMaking] = useState(false);

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">
        Who and what <span className="font-normal text-ink-muted">(tap any; nobody means everyone)</span>
      </legend>
      <div className="flex flex-wrap items-start gap-1">
        {members.map((m) => (
          <label key={m.id} className={tile}>
            <input type="checkbox" name="memberIds" value={m.id} defaultChecked={memberIds.includes(m.id)} className="sr-only" />
            <Avatar name={m.name} colour={m.colour} icon={m.icon} size="lg" />
            <span className={label}>{m.name}</span>
          </label>
        ))}
        <span aria-hidden className="mx-1 h-16 w-px self-center bg-frame" />
        {tags.map((t) => (
          <label key={t.id} className={tile}>
            <input
              type="checkbox"
              name="tagIds"
              value={t.id}
              defaultChecked={tagIds.includes(t.id) || fresh.includes(t.id)}
              className="sr-only"
            />
            <span className="flex size-12 items-center justify-center">
              <Emoji emoji={t.icon || eventEmoji(null, t.name)} className="size-10" />
            </span>
            <span className={`${label} font-normal`}>{t.name}</span>
          </label>
        ))}
        <button type="button" onClick={() => setMaking(true)} className={`${tile} text-ink-muted`}>
          <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-frame">
            <Plus size="1.5rem" weight="bold" aria-hidden />
          </span>
          <span className={`${label} font-normal`}>New tag</span>
        </button>
      </div>
      {making ? (
        <NewTag
          onClose={() => setMaking(false)}
          onMade={(tag) => {
            setTags((all) => [...all, tag]);
            setFresh((ids) => [...ids, tag.id]);
            setMaking(false);
          }}
        />
      ) : null}
    </fieldset>
  );
}

/** A small panel over the card for naming a new tag and picking its picture. */
function NewTag({ onClose, onMade }: { onClose: () => void; onMade: (tag: Tag) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  // Guesses for the name first, then anything whose name matches, then everyday ones.
  const ideas = [...suggestEmoji(name, 7), ...(name.trim() ? searchEmoji(name, 14) : []), ...suggestEmoji("", 14)]
    .filter((c, i, all) => all.findIndex((x) => x.emoji === c.emoji) === i)
    .slice(0, 14);
  const chosen = icon || ideas[0]?.emoji || "";

  const save = () =>
    startSaving(async () => {
      const result = await createTag({ name, icon: chosen });
      if (result.error || !result.tag) setError(result.error ?? "That didn't work.");
      else onMade(result.tag);
    });

  return (
    <div role="dialog" aria-label="New tag" className="absolute inset-0 z-20 flex flex-col gap-5 bg-board px-8 py-6">
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-2xl font-extrabold text-ink">New tag</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink"
        >
          <X size="1.5rem" weight="bold" aria-hidden />
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setIcon("");
          }}
          onKeyDown={(e) => {
            // Enter would send the whole event form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (name.trim()) save();
            }
          }}
          maxLength={30}
          placeholder="Work, Work from home, Pizza day…"
          autoFocus
          className="min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-accent"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Picture</span>
        <div className="grid grid-cols-7 gap-1.5">
          {ideas.map((c) => (
            <button
              key={c.emoji}
              type="button"
              onClick={() => setIcon(c.emoji)}
              aria-pressed={chosen === c.emoji}
              title={c.name}
              className={`flex flex-col items-center gap-1 rounded-[var(--radius)] border-2 px-1 py-1.5 ${
                chosen === c.emoji ? "border-ink bg-rail" : "border-transparent hover:bg-rail"
              }`}
            >
              <Emoji emoji={c.emoji} className="size-10" />
              <span className="line-clamp-1 w-full text-center text-xs text-ink-soft">{c.name}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-muted">Pictures to match the name.</p>
      </div>
      {error ? <p className="text-lg font-bold text-danger">{error}</p> : null}
      <div className="mt-auto flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || saving}
          className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-ink px-6 text-lg font-bold text-board disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add tag"}
        </button>
        <button type="button" onClick={onClose} className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-rail px-5 text-lg font-bold text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
