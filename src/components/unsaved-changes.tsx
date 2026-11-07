"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * One Save for a whole screen (Connor, 2026-11-07: "there are way too many
 * save buttons and places where data gets lost"). A screen keeps its
 * changes until Save. Leaving with changes asks first: save and go, go
 * back, or leave without saving.
 */

/** Watches for leaving the screen while `dirty`. */
export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
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
      dirtyRef.current = false;
      router.push(leaving);
    },
  };
}

/** The bar at the bottom: what's saved, Undo changes, and the one Save. */
export function SaveBar({ dirty, saving, error, onSave, onUndo }: { dirty: boolean; saving: boolean; error: string | null; onSave: () => void; onUndo: () => void }) {
  return (
    <div className={`flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2 ${dirty ? "bg-[color-mix(in_srgb,var(--color-accent)_9%,white)]" : "bg-rail"}`}>
      <span className={`min-w-0 flex-1 text-base font-bold ${error ? "text-danger" : dirty ? "text-accent" : "text-ink-muted"}`} role="status">
        {error ?? (dirty ? "You have changes that aren't saved yet." : "Everything is saved.")}
      </span>
      {dirty ? (
        <button type="button" onClick={onUndo} disabled={saving} className="flex min-h-11 items-center rounded-xl px-3 text-base font-bold text-ink hover:bg-board">
          Undo changes
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] bg-ink px-6 text-lg font-bold text-board disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save"}
      </button>
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
