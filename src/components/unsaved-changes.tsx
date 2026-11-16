"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import { primaryActionClass, secondaryActionClass } from "./ui";

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
export function SaveButton({
  dirty,
  saving,
  error,
  onSave,
  onUndo,
  ready = false,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onUndo: () => void;
  /** Offer Save even with no changes (the Planner's week not yet sent to the grocery list). */
  ready?: boolean;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2" role="group" aria-label="Save">
      {error ? (
        <span className="line-clamp-2 max-w-[28rem] text-right text-[1.15rem] leading-tight font-bold text-danger" role="alert" title={error}>
          {error}
        </span>
      ) : null}
      {dirty || ready ? (
        <>
          {dirty ? (
          <button type="button" onClick={onUndo} disabled={saving} className={secondaryActionClass}>
            Undo
          </button>
          ) : null}
          {/* The page's one Save: the black main action, with a dot while there are changes. */}
          <button type="button" onClick={onSave} disabled={saving} className={`${primaryActionClass} disabled:opacity-70`}>
            {dirty ? <span aria-hidden className="size-2.5 rounded-full bg-primary-ink" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      ) : (
        <span className="flex min-h-[var(--touch-target)] items-center gap-1.5 px-2 text-lg font-bold text-success" role="status">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(35_38_43/0.18)]" role="dialog" aria-label="Unsaved changes">
      <div className="flex w-[40rem] max-w-[92vw] flex-col gap-4 rounded-[var(--radius-dialog)] bg-board px-[1.65rem] pt-6 pb-[1.4rem] shadow-dialog">
        <h2 className="text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">Save your changes?</h2>
        <p className="text-[1.25rem] font-semibold text-ink-soft">You changed {what} and haven&rsquo;t saved them yet.</p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={onSave} disabled={saving} className={`${primaryActionClass} disabled:opacity-70`}>
            {saving ? "Saving…" : "Save and go"}
          </button>
          <button type="button" onClick={onStay} className={secondaryActionClass}>
            Go back
          </button>
          <button type="button" onClick={onLeave} className="ml-auto flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] px-4 text-lg font-bold text-danger">
            Leave without saving
          </button>
        </div>
      </div>
    </div>
  );
}
