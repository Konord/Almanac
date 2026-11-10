"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { stretchEventDays } from "@/app/calendar/actions";
import { SideHandles } from "./side-handles";

/**
 * An all-day (or multi-day) bar in the week view's top row. Pull either
 * side over more days to make it longer, or back in to make it shorter.
 * A tap opens it for editing.
 */
export function StretchBar({
  href,
  eventId,
  occurrenceDate,
  week,
  first,
  last,
  lane,
  title,
  className,
  style,
  children,
}: {
  href: string;
  eventId: string;
  occurrenceDate: string | null;
  /** The week's days, in order. */
  week: string[];
  /** The first and last of the week's days it covers. */
  first: number;
  last: number;
  lane: number;
  title: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [preview, setPreview] = useState<[number, number] | null>(null);
  const [a, b] = preview ?? [first, last];
  const stretch = (range: [number, number]) =>
    startSaving(async () => {
      const result = await stretchEventDays({ eventId, occurrenceDate, daysBefore: first - range[0], daysAfter: range[1] - last });
      if (result.error) window.alert(result.error);
      else router.refresh();
    });
  return (
    <div className={`quiet-handles relative flex min-w-0 px-1 ${preview ? "is-dragging" : ""} ${saving ? "opacity-70" : ""}`} style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: lane + 1 }}>
      <Link href={href} scroll={false} title={title} draggable={false} className={`${className} ${preview ? "ring-2 ring-ink" : ""}`} style={style}>
        {children}
      </Link>
      <SideHandles byDay columns={week} c0={first} c1={last} onPreview={setPreview} onDone={stretch} />
    </div>
  );
}
