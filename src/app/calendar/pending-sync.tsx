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

  // Start from where you tapped, and forget it when the card closes.
  useEffect(() => {
    setPending({
      date: defaults.date,
      start: defaults.startTime ? toMinutes(defaults.startTime) : null,
      minutes: defaults.minutes,
      allDay: defaults.allDay,
      member: defaults.memberId ?? "everyone",
    });
    return () => setPending(null);
  }, [defaults.date, defaults.startTime, defaults.minutes, defaults.allDay, defaults.memberId]);

  // Card → outline: typing or tapping on the card moves the outline.
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.name === "startDate" && input.value) updatePending({ date: input.value });
      if (input.name === "startTime") updatePending({ start: input.value ? toMinutes(input.value) : null });
      if (input.name === "allDay") updatePending({ allDay: input.checked });
      if (input.name === "memberId") updatePending({ member: input.value || "everyone" });
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
    const who = form.querySelector<HTMLInputElement>(`input[name="memberId"][value="${pending.member === "everyone" ? "" : CSS.escape(pending.member)}"]`);
    if (who && !who.checked) who.checked = true;
  }, [pending]);

  return <span ref={marker} hidden />;
}
