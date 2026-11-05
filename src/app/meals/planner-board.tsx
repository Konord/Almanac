"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, Check, Plus } from "@phosphor-icons/react";
import { emojiImage } from "@/lib/emoji";
import { soft, strong } from "@/lib/colours";
import { moveMeal, placeMeal } from "./actions";

/*
 * The week board. Two ways to plan, both made for a touch screen:
 * - drag a category from the tray (or a meal already on the week) into a
 *   day's meal time, or
 * - tap a category, then tap the + where it goes.
 * Tapping a meal opens its card (choose the variant, who it's for…).
 */

export type BoardDay = {
  date: string;
  weekday: string;
  number: string;
  isToday: boolean;
  past: boolean;
  energy: { label: string; emoji: string } | null;
};
export type BoardTime = { id: string; name: string; icon: string | null; usual: string };
export type BoardPerson = { id: string; name: string; colour: string; icon: string | null };
export type BoardMeal = {
  id: string;
  date: string;
  mealTimeId: string;
  name: string;
  icon: string;
  undecided: boolean;
  cooked: boolean;
  skipped: boolean;
  backup: boolean;
  people: BoardPerson[];
};
export type BoardCategory = { id: string; name: string; icon: string | null; mealTimeIds: string[]; variants: number };

type Dragging = { kind: "category"; id: string; icon: string | null; name: string } | { kind: "meal"; id: string; icon: string | null; name: string };

/** Tray tiles on one page (two columns). */
const TRAY_PAGE = 8;

function Picture({ emoji, className }: { emoji: string | null; className: string }) {
  if (!emoji) return null;
  const src = emojiImage(emoji);
  // eslint-disable-next-line @next/next/no-img-element -- small local pictures
  return src ? <img src={src} alt="" aria-hidden draggable={false} className={className} /> : <span className={`${className} flex items-center justify-center text-[2rem] leading-none`}>{emoji}</span>;
}

function Sticker({ person }: { person: BoardPerson }) {
  if (person.icon) {
    return (
      <span className="flex size-7 items-center justify-center rounded-full border-2" style={{ background: soft(person.colour), borderColor: strong(person.colour) }} title={person.name}>
        <Picture emoji={person.icon} className="size-[72%]" />
      </span>
    );
  }
  return (
    <span className="flex size-7 items-center justify-center rounded-full text-[0.8125rem] font-extrabold text-white" style={{ background: strong(person.colour) }} title={person.name}>
      {[...person.name][0]?.toUpperCase()}
    </span>
  );
}

export function PlannerBoard({
  days,
  times,
  meals,
  categories,
  perCell,
  baseHref,
}: {
  days: BoardDay[];
  times: BoardTime[];
  meals: BoardMeal[];
  categories: BoardCategory[];
  perCell: number;
  baseHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [trayTime, setTrayTime] = useState(times[times.length > 1 ? times.length - 1 : 0]?.id ?? "");
  const [trayPage, setTrayPage] = useState(0);
  const [drag, setDrag] = useState<(Dragging & { x: number; y: number }) | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; item: Dragging; moved: boolean } | null>(null);

  const link = (extra: string) => `${baseHref}${baseHref.includes("?") ? "&" : "?"}${extra}`;

  const trayList = categories.filter((c) => c.mealTimeIds.length === 0 || c.mealTimeIds.includes(trayTime));
  const pages = Math.max(1, Math.ceil(trayList.length / TRAY_PAGE));
  const page = Math.min(trayPage, pages - 1);
  const shown = trayList.slice(page * TRAY_PAGE, (page + 1) * TRAY_PAGE);

  function run(action: () => Promise<{ error?: string; mealId?: string; needsPick?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else if (result.needsPick && result.mealId) router.push(link(`meal=${result.mealId}`), { scroll: false });
      else router.refresh();
    });
  }

  function place(categoryId: string, date: string, mealTimeId: string) {
    setPicked(null);
    run(() => placeMeal({ date, mealTimeId, categoryId }));
  }

  function cellAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y);
    return (el?.closest("[data-cell]") as HTMLElement | null) ?? null;
  }

  function onDown(e: React.PointerEvent, item: Dragging) {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, item, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10) return;
    s.moved = true;
    setDrag({ ...s.item, x: e.clientX, y: e.clientY });
    setOver(cellAt(e.clientX, e.clientY)?.dataset.cell ?? null);
  }

  function onUp(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    setDrag(null);
    setOver(null);
    if (!s) return;
    if (!s.moved) {
      // A tap: pick a category, or open a meal.
      if (s.item.kind === "category") setPicked((p) => (p === s.item.id ? null : s.item.id));
      else router.push(link(`meal=${s.item.id}`), { scroll: false });
      return;
    }
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const date = cell.dataset.date!;
    const mealTimeId = cell.dataset.time!;
    if (s.item.kind === "category") place(s.item.id, date, mealTimeId);
    else run(() => moveMeal({ mealId: s.item.id, date, mealTimeId }));
  }

  const pickedCategory = categories.find((c) => c.id === picked);

  return (
    <div className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_21rem] gap-5 ${pending ? "cursor-progress" : ""}`}>
      {/* The week */}
      <div
        className="grid min-h-0 gap-1.5 overflow-hidden rounded-[var(--radius-card)] border border-frame bg-board p-2.5"
        style={{ gridTemplateColumns: "7.5rem repeat(7, minmax(0, 1fr))", gridTemplateRows: `auto repeat(${times.length}, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((d) => (
          <div key={d.date} className={`flex items-center justify-center gap-2 rounded-xl py-1.5 ${d.isToday ? "bg-ink text-board" : "text-ink"}`}>
            <span className="text-lg font-bold">{d.weekday}</span>
            <span className="text-2xl font-extrabold">{d.number}</span>
            {d.energy ? <Picture emoji={d.energy.emoji} className="size-7" /> : null}
          </div>
        ))}

        {times.map((t) => (
          <Row key={t.id}>
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-rail px-1 text-center">
              <Picture emoji={t.icon} className="size-10" />
              <span className="text-lg font-bold leading-tight text-ink">{t.name}</span>
              <span className="text-sm text-ink-muted">{t.usual}</span>
            </div>
            {days.map((d) => {
              const key = `${d.date}|${t.id}`;
              const list = meals.filter((m) => m.date === d.date && m.mealTimeId === t.id);
              const extra = list.length - perCell;
              const visible = extra > 0 ? list.slice(0, perCell - 1) : list;
              return (
                <div
                  key={key}
                  data-cell={key}
                  data-date={d.date}
                  data-time={t.id}
                  className={`flex min-h-0 flex-col gap-1.5 overflow-hidden rounded-xl p-1.5 ${over === key ? "bg-meal ring-2 ring-meal-ink" : d.isToday ? "bg-[color-mix(in_srgb,var(--color-meal)_30%,white)]" : "bg-grid/60"} ${
                    d.past ? "opacity-60" : ""
                  }`}
                >
                  {visible.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onPointerDown={(e) => onDown(e, { kind: "meal", id: m.id, icon: m.icon, name: m.name })}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={() => {
                        start.current = null;
                        setDrag(null);
                      }}
                      className={`relative flex min-h-0 shrink touch-none flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1.5 text-center text-meal-ink select-none ${
                        m.undecided ? "border-2 border-dashed border-meal-ink/50 bg-board" : "bg-meal"
                      } ${m.skipped ? "opacity-50" : ""} ${perCell === 1 ? "flex-1" : "min-h-20"}`}
                    >
                      <Picture emoji={m.icon} className="size-14 min-h-0 shrink" />
                      <span className="font-hand line-clamp-2 text-xl leading-[1.2]">{m.name}</span>
                      {m.undecided ? <span className="text-sm font-bold">Choose one</span> : null}
                      {m.people.length ? (
                        <span className="absolute top-1 right-1 flex -space-x-1.5">
                          {m.people.slice(0, 4).map((p) => (
                            <Sticker key={p.id} person={p} />
                          ))}
                        </span>
                      ) : null}
                      {m.cooked ? <Check size="1.5rem" weight="bold" aria-label="Cooked" className="absolute top-1 left-1" /> : null}
                    </button>
                  ))}
                  {extra > 0 ? (
                    <Link href={link(`cell=${encodeURIComponent(key)}`)} scroll={false} className="flex min-h-11 items-center justify-center rounded-xl bg-board text-lg font-bold text-meal-ink">
                      + {extra + 1} more
                    </Link>
                  ) : null}
                  {pickedCategory && !d.past ? (
                    <button
                      type="button"
                      onClick={() => place(pickedCategory.id, d.date, t.id)}
                      className="flex min-h-[var(--touch-target)] flex-1 items-center justify-center gap-1 rounded-xl border-2 border-dashed border-meal-ink bg-meal/50 text-lg font-bold text-meal-ink"
                    >
                      <Plus size="1.25rem" weight="bold" aria-hidden />
                      Here
                    </button>
                  ) : null}
                </div>
              );
            })}
          </Row>
        ))}
      </div>

      {/* The tray */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] border border-frame bg-board p-4">
        <h2 className="text-2xl font-bold text-ink">Add a meal</h2>
        {times.length > 1 ? (
          <div className="flex gap-1 rounded-2xl bg-panel p-1">
            {times.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTrayTime(t.id);
                  setTrayPage(0);
                }}
                className={`flex min-h-12 flex-1 items-center justify-center rounded-xl px-2 text-base font-bold ${t.id === trayTime ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
        <p className="text-base leading-snug text-ink-muted">
          {pickedCategory ? `Now tap + Here on a day for ${pickedCategory.name}.` : "Drag one onto the week, or tap it and then tap the day."}
        </p>
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(0,7.5rem)] grid-cols-2 content-start gap-2.5">
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onPointerDown={(e) => onDown(e, { kind: "category", id: c.id, icon: c.icon, name: c.name })}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
              className={`flex touch-none flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 text-center select-none ${
                c.id === picked ? "border-meal-ink bg-meal" : "border-frame bg-board hover:bg-rail"
              }`}
            >
              <Picture emoji={c.icon} className="size-14" />
              <span className="line-clamp-2 text-lg font-bold leading-tight text-ink">{c.name}</span>
            </button>
          ))}
          {shown.length === 0 ? <p className="col-span-2 text-lg text-ink-muted">No categories for this meal time yet.</p> : null}
        </div>
        {pages > 1 ? (
          <div className="flex shrink-0 items-center justify-center gap-3">
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setTrayPage(page - 1)} className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail disabled:opacity-30">
              <CaretLeft size="1.5rem" weight="bold" aria-hidden />
            </button>
            <span className="text-lg font-bold text-ink-muted">
              {page + 1} of {pages}
            </span>
            <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setTrayPage(page + 1)} className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail disabled:opacity-30">
              <CaretRight size="1.5rem" weight="bold" aria-hidden />
            </button>
          </div>
        ) : null}
        <Link href="/meals/library" className="flex min-h-[var(--touch-target)] shrink-0 items-center justify-center rounded-2xl bg-rail text-lg font-bold text-ink">
          Recipes and categories
        </Link>
        {error ? <p role="alert" className="text-lg font-bold text-danger">{error}</p> : null}
      </aside>

      {drag ? (
        <div className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-2xl bg-meal px-3 py-2 text-meal-ink shadow-[0_0.5rem_1.5rem_rgba(30,35,45,0.25)]" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          <Picture emoji={drag.icon} className="size-10" />
          <span className="font-hand text-xl">{drag.name}</span>
        </div>
      ) : null}
    </div>
  );
}

/** A grid row: its children are the meal time label and the seven days (via display: contents). */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}
