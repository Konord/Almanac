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
  const pending = usePending();

  // (A plain string, so the effect below doesn't re-run each time the page refreshes.)
  const memberKey = (defaults.memberIds ?? []).join(",");

  // Start from where you tapped, and forget it when the card closes.
  useEffect(() => {
    setPending({
      date: defaults.date,
      start: defaults.startTime ? toMinutes(defaults.startTime) : null,
      minutes: defaults.minutes,
      allDay: defaults.allDay,
      members: memberKey ? memberKey.split(",") : [],
    });
    return () => setPending(null);
  }, [defaults.date, defaults.startTime, defaults.minutes, defaults.allDay, memberKey]);

  // Card → outline: typing or tapping on the card moves the outline.
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.name === "startDate" && input.value) updatePending({ date: input.value });
      if (input.name === "startTime") updatePending({ start: input.value ? toMinutes(input.value) : null });
      if (input.name === "allDay") updatePending({ allDay: input.checked });
      // On Today the outline covers the chosen people's columns.
      if (input.name === "memberIds") updatePending({ members: checkedMembers(form) });
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
    // Stretched or dragged across people's columns: tick exactly those people.
    const want = new Set(pending.members);
    form.querySelectorAll<HTMLInputElement>('input[name="memberIds"]').forEach((box) => {
      if (box.checked !== want.has(box.value)) box.checked = want.has(box.value);
    });
  }, [pending]);

  return <span ref={marker} hidden />;
}

function checkedMembers(form: HTMLFormElement): string[] {
  return [...form.querySelectorAll<HTMLInputElement>('input[name="memberIds"]:checked')].map((b) => b.value);
}
