"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { emojiImage, eventEmoji, searchEmoji, suggestEmoji, type EmojiChoice } from "@/lib/emoji";

/** How many search results fit without scrolling (3 rows of 6). */
const RESULT_LIMIT = 18;

function Picture({ emoji, className }: { emoji: string; className: string }) {
  const src = emojiImage(emoji);
  // eslint-disable-next-line @next/next/no-img-element -- small local pictures
  return src ? <img src={src} alt="" aria-hidden draggable={false} className={className} /> : <span className={className}>{emoji}</span>;
}

/**
 * The picture for an event. Shows the chosen picture (or the one Almanac
 * guesses from the name) as a big button; tapping it opens a picker with
 * suggestions for the name and a search box. Sends "icon" with the form
 * (blank = let Almanac guess).
 */
export function EmojiPicker({ initial }: { initial?: string }) {
  const [icon, setIcon] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const marker = useRef<HTMLInputElement>(null);

  // Follow the name typed in the same form, for the guess and the suggestions.
  useEffect(() => {
    const form = marker.current?.form;
    const field = form?.elements.namedItem("title") as HTMLInputElement | null;
    if (!field) return;
    const read = () => setTitle(field.value);
    read();
    field.addEventListener("input", read);
    return () => field.removeEventListener("input", read);
  }, []);

  const shown = icon || eventEmoji(null, title);
  const pick = (emoji: string) => {
    setIcon(emoji);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <input ref={marker} type="hidden" name="icon" value={icon} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={icon ? "Change the picture" : "Pick a picture (Almanac is guessing one from the name)"}
        className="flex size-[var(--touch-target)] shrink-0 items-center justify-center self-end rounded-[var(--radius)] border-2 border-frame bg-board hover:border-ink"
      >
        <Picture emoji={shown} className={`size-9 ${icon ? "" : "opacity-60"}`} />
      </button>

      {open ? (
        <div role="dialog" aria-label="Pick a picture" className="absolute inset-0 z-20 flex flex-col gap-4 bg-board px-8 py-6">
          <div className="flex items-center gap-3">
            <h3 className="flex-1 text-2xl font-extrabold text-ink">Pick a picture</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink"
            >
              <X size="1.5rem" weight="bold" aria-hidden />
            </button>
          </div>

          <label className="flex min-h-[var(--touch-target)] items-center gap-3 rounded-[var(--radius)] border-2 border-frame px-4 focus-within:border-accent">
            <MagnifyingGlass size="1.5rem" aria-hidden className="text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. hockey, dog, cake"
              className="min-w-0 flex-1 bg-transparent text-lg text-ink outline-none"
              autoFocus
            />
          </label>

          {query.trim() ? (
            <Grid label={`Matching "${query.trim()}"`} choices={searchEmoji(query, RESULT_LIMIT)} current={icon} onPick={pick} empty="Nothing by that name yet." />
          ) : (
            <>
              <Grid
                label={title.trim() ? `Suggested for "${title.trim()}"` : "Suggested"}
                choices={suggestEmoji(title)}
                current={icon}
                onPick={pick}
                showWhy
              />
              <Grid label="A few more (search to find others)" choices={searchEmoji("", 12)} current={icon} onPick={pick} />
            </>
          )}

          <div className="mt-auto flex gap-3">
            <button
              type="button"
              onClick={() => pick("")}
              className={`inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] px-5 text-lg font-bold ${
                icon ? "bg-rail text-ink" : "bg-ink text-board"
              }`}
            >
              <Picture emoji={eventEmoji(null, title)} className="size-7" />
              Let Almanac pick from the name
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Grid({
  label,
  choices,
  current,
  onPick,
  showWhy = false,
  empty,
}: {
  label: string;
  choices: (EmojiChoice & { why?: string })[];
  current: string;
  onPick: (emoji: string) => void;
  showWhy?: boolean;
  empty?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-base font-bold text-ink">{label}</h4>
      {choices.length === 0 ? <p className="text-lg text-ink-muted">{empty}</p> : null}
      <div className="grid grid-cols-6 gap-2">
        {choices.map((c) => (
          <button
            key={c.emoji}
            type="button"
            onClick={() => onPick(c.emoji)}
            aria-pressed={current === c.emoji}
            title={c.name}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-[var(--radius)] border-2 px-1 py-2 ${
              current === c.emoji ? "border-ink bg-rail" : "border-transparent hover:bg-rail"
            }`}
          >
            <Picture emoji={c.emoji} className="size-10" />
            <span className="w-full truncate text-center text-sm text-ink-soft">{showWhy && c.why && c.why !== "everyday" ? c.why : c.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
