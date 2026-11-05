"use client";

import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { EMOJI_GROUPS, emojiImage, emojiPage, eventEmoji, searchEmoji, suggestEmoji, type EmojiChoice } from "@/lib/emoji";

/** How many pictures fit on one page without scrolling (6 rows of 7). */
const PER_PAGE = 42;

/** The tabs: suggestions for the name, then each group, each shown by a picture. */
const TABS: { label: string; emoji: string }[] = [
  { label: "Ideas", emoji: "✨" },
  ...EMOJI_GROUPS.map((label, i) => ({ label, emoji: ["😀", "🧑", "🐶", "🍎", "⚽", "🏡", "💡", "✅"][i] })),
];

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
export function EmojiPicker({
  initial,
  nameField = "title",
  letter = false,
  fullScreen = false,
}: {
  initial?: string;
  /** The form field holding the name, for suggestions. */
  nameField?: string;
  /** For a person: with no picture they show the first letter of their name, not a guess. */
  letter?: boolean;
  /** Cover the whole screen instead of just the card it sits in. */
  fullScreen?: boolean;
}) {
  const [icon, setIcon] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  /** 0 = Suggested, then 1 + the group number. */
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const marker = useRef<HTMLInputElement>(null);

  // Follow the name typed in the same form, for the guess and the suggestions.
  useEffect(() => {
    const form = marker.current?.form;
    const field = form?.elements.namedItem(nameField) as HTMLInputElement | null;
    if (!field) return;
    const read = () => setTitle(field.value);
    read();
    field.addEventListener("input", read);
    return () => field.removeEventListener("input", read);
  }, [nameField]);

  const shown = icon || eventEmoji(null, title);
  const pick = (emoji: string) => {
    setIcon(emoji);
    setOpen(false);
    setQuery("");
    setTab(0);
    setPage(0);
  };

  // What the grid shows: search results, a tab's page, or nothing (Suggested has its own).
  const q = query.trim();
  const found = q ? searchEmoji(q, 10_000) : null;
  const browsing = found ? null : tab > 0 ? emojiPage(tab - 1, page, PER_PAGE) : null;
  const pages = found ? Math.max(1, Math.ceil(found.length / PER_PAGE)) : (browsing?.pages ?? 1);
  const shownPage = Math.min(page, pages - 1);

  return (
    <>
      <input ref={marker} type="hidden" name="icon" value={icon} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={icon ? "Change the picture" : letter ? "Pick a picture (showing the first letter for now)" : "Pick a picture (Almanac is guessing one from the name)"}
        className="flex size-[var(--touch-target)] shrink-0 items-center justify-center self-end rounded-[var(--radius)] border-2 border-frame bg-board hover:border-ink"
      >
        {letter && !icon ? (
          <span className="text-2xl font-extrabold text-ink-muted">{[...title.trim()][0]?.toUpperCase() ?? "?"}</span>
        ) : (
          <Picture emoji={shown} className={`size-9 ${icon ? "" : "opacity-60"}`} />
        )}
      </button>

      {open ? (
        <div role="dialog" aria-label="Pick a picture" className={`${fullScreen ? "fixed inset-y-0 right-0 z-50 w-full max-w-[46rem] shadow-2xl" : "absolute inset-0 z-20"} flex flex-col gap-4 bg-board px-8 py-6`}>
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search, e.g. hockey, dog, cake"
              className="min-w-0 flex-1 bg-transparent text-lg text-ink outline-none"
              autoFocus
            />
          </label>

          <div role="tablist" className="flex shrink-0 gap-1 rounded-[var(--radius)] bg-rail p-1">
            {TABS.map((t, i) => (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={!q && tab === i}
                onClick={() => {
                  setTab(i);
                  setPage(0);
                  setQuery("");
                }}
                className={`flex min-h-[var(--touch-target)] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[calc(var(--radius)-0.25rem)] py-1 ${
                  !q && tab === i ? "bg-board text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Picture emoji={t.emoji} className="size-7" />
                <span className="w-full truncate text-center text-xs font-bold">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {found ? (
              <Grid
                label={`Matching "${q}"`}
                choices={found.slice(shownPage * PER_PAGE, (shownPage + 1) * PER_PAGE)}
                current={icon}
                onPick={pick}
                empty="Nothing by that name. Try another word, or look through the tabs."
              />
            ) : browsing ? (
              <Grid label={EMOJI_GROUPS[tab - 1]} choices={browsing.choices} current={icon} onPick={pick} />
            ) : (
              <Grid
                label={title.trim() ? `Suggested for "${title.trim()}"` : "Suggested"}
                choices={suggestEmoji(title, 14)}
                current={icon}
                onPick={pick}
                showWhy
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => pick("")}
              className={`inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-[var(--radius)] px-5 text-lg font-bold ${
                icon ? "bg-rail text-ink" : "bg-ink text-board"
              }`}
            >
              {letter ? (
                <>No picture, just the letter</>
              ) : (
                <>
                  <Picture emoji={eventEmoji(null, title)} className="size-7" />
                  Let Almanac pick from the name
                </>
              )}
            </button>
            {pages > 1 ? (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(shownPage - 1, 0))}
                  disabled={shownPage === 0}
                  aria-label="Previous page"
                  className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink disabled:opacity-40"
                >
                  <CaretLeft size="1.5rem" weight="bold" aria-hidden />
                </button>
                <span className="min-w-[4.5rem] text-center text-lg font-bold text-ink" aria-live="polite">
                  {shownPage + 1} of {pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(shownPage + 1, pages - 1))}
                  disabled={shownPage === pages - 1}
                  aria-label="Next page"
                  className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink disabled:opacity-40"
                >
                  <CaretRight size="1.5rem" weight="bold" aria-hidden />
                </button>
              </div>
            ) : null}
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
      <div className="grid grid-cols-7 gap-1.5">
        {choices.map((c) => (
          <button
            key={c.emoji}
            type="button"
            onClick={() => onPick(c.emoji)}
            aria-pressed={current === c.emoji}
            title={c.name}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-[var(--radius)] border-2 px-1 py-1.5 ${
              current === c.emoji ? "border-ink bg-rail" : "border-transparent hover:bg-rail"
            }`}
          >
            <Picture emoji={c.emoji} className="size-10" />
            <span className="line-clamp-2 min-h-[2lh] w-full text-center text-xs leading-tight break-words text-ink-soft">{showWhy && c.why && c.why !== "everyday" ? c.why : c.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
