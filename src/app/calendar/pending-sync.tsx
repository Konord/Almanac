"use client";

import { useEffect, useRef } from "react";
import { setPending, updatePending, usePending } from "@/components/pending-store";
import { clock, toMinutes } from "@/components/timeline-drag";
import type { QuickDefaults } from "./forms";

/**
 * Keeps the quick-add card and the dashed outline on the timeline in step.
 * Drag the outline and the card's day, time and person change; change them
 * on the card and the outline moves. Draws nothing itself.
 */
export function PendingSync({ defaults }: { defaults: QuickDefaults }) {
  const marker = useRef<HTMLSpanElement>(null);
  /** The column the outline was last in, to tell when it's dragged to another person. */
  const lastMember = useRef<string | null>(null);
  const pending = usePending();

  // (A plain string, so the effect below doesn't re-run each time the page refreshes.)
  const firstMember = defaults.memberIds?.[0] ?? "everyone";

  // Start from where you tapped, and forget it when the card closes.
  useEffect(() => {
    setPending({
      date: defaults.date,
      start: defaults.startTime ? toMinutes(defaults.startTime) : null,
      minutes: defaults.minutes,
      allDay: defaults.allDay,
      member: firstMember,
    });
    return () => setPending(null);
  }, [defaults.date, defaults.startTime, defaults.minutes, defaults.allDay, firstMember]);

  // Card → outline: typing or tapping on the card moves the outline.
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.name === "startDate" && input.value) updatePending({ date: input.value });
      if (input.name === "startTime") updatePending({ start: input.value ? toMinutes(input.value) : null });
      if (input.name === "allDay") updatePending({ allDay: input.checked });
      // The outline sits in the first chosen person's column on Today.
      if (input.name === "memberIds") {
        const first = form.querySelector<HTMLInputElement>('input[name="memberIds"]:checked');
        updatePending({ member: first?.value ?? "everyone" });
      }
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onChange);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onChange);
    };
  }, []);

  // Outline → card: dragging the outline fills in the card.
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form || !pending) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    const date = field("startDate");
    if (date && date.value !== pending.date) date.value = pending.date;
    const start = field("startTime");
    const time = pending.start === null ? "" : clock(pending.start);
    if (start && start.value !== time) start.value = time;
    const allDay = field("allDay");
    if (allDay && allDay.checked !== pending.allDay) allDay.checked = pending.allDay;
    // Dragged into another person's column: swap that person in.
    const before = lastMember.current;
    lastMember.current = pending.member;
    // The first time, the card's ticks already come from where you tapped.
    if (before === null || before === pending.member) return;
    const box = (id: string) => form.querySelector<HTMLInputElement>(`input[name="memberIds"][value="${CSS.escape(id)}"]`);
    if (pending.member === "everyone") {
      form.querySelectorAll<HTMLInputElement>('input[name="memberIds"]').forEach((b) => (b.checked = false));
    } else {
      const from = before && before !== "everyone" ? box(before) : null;
      if (from) from.checked = false;
      const to = box(pending.member);
      if (to) to.checked = true;
    }
  }, [pending]);

  return <span ref={marker} hidden />;
}
