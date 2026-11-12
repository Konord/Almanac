"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";

/*
 * One Save for a whole screen (Connor, 2026-11-07: "there are way too many
 * save buttons and places where data gets lost"). A screen keeps its
 * changes until Save. Leaving with changes asks first: save and go, go
 * back, or leave without saving.
 */

/**
 * Watches for leaving the screen while `dirty`. `discard` puts the screen
 * back as it was saved (the screen's Undo).
 *
 * The app keeps screens you've left alive in the background (so going back
 * is quick), with everything as you left it. So leaving without saving has
 * to throw the changes away and close the box, or they'd still be there,
 * box and all, the next time the screen opens (Connor, 2026-11-11: two
 * screens with changes kept sending each other back and forth).
 */
export function useUnsavedChanges(dirty: boolean, discard: () => void) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  const discardRef = useRef(discard);
  useEffect(() => {
    dirtyRef.current = dirty;
    discardRef.current = discard;
  });
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    // Any link on the page (the menu, Back) asks first when there are changes.
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return {
    /** Where the person was going, while the "Save your changes?" box is up. */
    leaving,
    stay: () => setLeaving(null),
    /** After a save: go where they were going, or show what was saved. */
    saved: (then?: string | null) => {
      dirtyRef.current = false;
      setLeaving(null);
      if (then) router.push(then);
      else router.refresh();
    },
    leaveWithoutSaving: () => {
      if (!leaving) return;
      const to = leaving;
      dirtyRef.current = false;
      discardRef.current();
      setLeaving(null);
      router.push(to);
    },
  };
}

/**
 * Save, at the right of the screen's header (Connor picked this over a bar
 * along the bottom, 2026-11-09). With changes: Undo and a blue Save with a
 * dot. Without: a small green "Saved". A problem shows in red beside it.
 */
export function SaveButton({ dirty, saving, error, onSave, onUndo }: { dirty: boolean; saving: boolean; error: string | null; onSave: () => void; onUndo: () => void }) {
  return (
    <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2" role="group" aria-label="Save">
      {error ? (
        <span className="line-clamp-2 max-w-[28rem] text-right text-base leading-tight font-bold text-danger" role="alert" title={error}>
          {error}
        </span>
      ) : null}
      {dirty ? (
        <>
          <button type="button" onClick={onUndo} disabled={saving} className="flex min-h-[var(--touch-target)] items-center rounded-2xl px-4 text-base font-bold text-ink-soft hover:bg-rail">
            Undo
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex min-h-[var(--touch-target)] items-center gap-2.5 rounded-2xl bg-accent px-6 text-lg font-bold text-white shadow-[0_2px_8px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] disabled:opacity-70"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-white" />
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      ) : (
        <span className="flex min-h-[var(--touch-target)] items-center gap-1.5 px-2 text-base font-bold text-success" role="status">
          <Check size="1.25rem" weight="bold" aria-hidden />
          Saved
        </span>
      )}
    </div>
  );
}

/** "Save your changes?" when leaving with changes. */
export function LeaveDialog({
  what,
  saving,
  onSave,
  onStay,
  onLeave,
}: {
  /** e.g. "some routines" */
  what: string;
  saving: boolean;
  onSave: () => void;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,35,45,0.35)]" role="dialog" aria-label="Unsaved changes">
      <div className="flex w-[34rem] max-w-[92vw] flex-col gap-4 rounded-[var(--radius-card)] bg-board p-7 shadow-2xl">
        <h2 className="text-2xl font-extrabold text-ink">Save your changes?</h2>
        <p className="text-lg text-ink-soft">You changed {what} and haven&rsquo;t saved them yet.</p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={onSave} disabled={saving} className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-ink px-5 text-lg font-bold text-board">
            {saving ? "Saving…" : "Save and go"}
          </button>
          <button type="button" onClick={onStay} className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-rail px-5 text-lg font-bold text-ink">
            Go back
          </button>
          <button type="button" onClick={onLeave} className="ml-auto flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-4 text-base font-bold text-danger">
            Leave without saving
          </button>
        </div>
      </div>
    </div>
  );
}
