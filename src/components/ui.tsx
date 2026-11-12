import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { emojiImage } from "@/lib/emoji";
import { soft, strong } from "@/lib/colours";
import { TimerPill } from "./timer-pill";
import { MenuTray, type Section } from "./menu-tray";

/**
 * Small building blocks shared by every screen, in the locked "bright"
 * style. They only use theme colours (bg-board, text-ink, accent …), and
 * every tappable thing is at least the theme's touch-target size so it
 * works on the wall screen.
 *
 * Sizes are in rem (Tailwind units: 1 unit = 4px at 1920×1080), so the
 * whole screen scales with the display. See globals.css.
 */

// ---------------------------------------------------------------------------
// The app frame: the whole screen for content, with the menu in a hidden tray
// ---------------------------------------------------------------------------

export type { Section };

/**
 * Every main screen sits in this frame. On a landscape screen the frame is
 * exactly one screen tall and nothing in it scrolls the page; on a phone the
 * page scrolls as usual. The menu is not shown on screen: it lives in a tray
 * that slides up from the handle at the bottom centre (see menu-tray.tsx).
 */
export function AppFrame({ section, children }: { section: Section; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col gap-3.5 p-4 pb-12 sm:p-6 sm:pb-12 lg:min-h-0 lg:px-8.5 lg:pt-5.5 lg:pb-9">
        {children}
      </main>
      <MenuTray section={section} />
      <TimerPill />
    </div>
  );
}

/** The 72px header row: big title, then whatever the screen adds (clock, switch). */
export function ScreenHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-5.5 gap-y-2 lg:h-18 lg:flex-nowrap">
      <h1 className="text-3xl font-extrabold tracking-[-0.03rem] text-ink lg:text-5xl">{title}</h1>
      {children}
    </header>
  );
}

/** A segmented switch, like Day / Week / Month. */
export function Segmented({ options, label }: { options: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 rounded-2xl bg-panel p-1.25">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={`flex min-h-[var(--touch-target)] min-w-24 items-center justify-center rounded-xl px-4 text-base font-bold ${
            o.active ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** A round button with a Phosphor icon (for ‹ › arrows and the like). */
export function IconLink({ href, label, icon: IconComponent }: { href: string; label: string; icon: Icon }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-rail text-ink hover:bg-panel"
    >
      <IconComponent size="1.75rem" weight="bold" aria-hidden />
    </Link>
  );
}

/** A plain text button-link with a soft fill, e.g. "Today" or "Set up routines". */
export function SoftLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-2 rounded-2xl bg-rail px-5 text-base font-bold text-ink hover:bg-panel ${className}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Cards, people and pictures
// ---------------------------------------------------------------------------

/** A white card with a hairline edge and a title row with a tinted icon chip. */
export function Card({
  title,
  icon: IconComponent,
  tint,
  aside,
  children,
  className = "",
}: {
  /** Leave out to draw no title row (for a list that draws its own). */
  title?: ReactNode;
  icon?: Icon;
  /** Person colour for the icon chip, e.g. "blue". */
  tint?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-[var(--radius-card)] border border-frame bg-board px-5.5 py-4.5 lg:min-h-0 ${className}`}>
      {title === undefined && !IconComponent && !aside ? null : (
      <div className="mb-1 flex items-center gap-3">
        {IconComponent ? (
          <span
            className="flex size-10.5 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `color-mix(in srgb, ${strong(tint)} 16%, white)`, color: strong(tint) }}
          >
            <IconComponent size="1.625rem" aria-hidden />
          </span>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink">{title}</h2>
        {aside}
      </div>
      )}
      {children}
    </section>
  );
}

/** A person's round avatar: their initial on their strong colour. */
/**
 * A person's sticker: the first letter of their name in their colour, or
 * their own picture (an emoji) on their pastel colour if they chose one.
 */
export function Avatar({
  name,
  colour,
  icon,
  size = "md",
}: {
  name: string;
  colour: string | null | undefined;
  icon?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "sm" ? "size-7 text-[0.8125rem]" : size === "lg" ? "size-12 text-xl" : "size-11 text-sm";
  if (icon) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full border-2 ${box}`}
        style={{ background: soft(colour), borderColor: strong(colour) }}
        aria-hidden
      >
        <Emoji emoji={icon} className="size-[72%]" />
      </span>
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${box}`}
      style={{ background: strong(colour) }}
      aria-hidden
    >
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** A Fluent 3D picture for an emoji (or the plain emoji if we don't have one). */
export function Emoji({ emoji, className = "size-10", faded = false }: { emoji: string | null | undefined; className?: string; faded?: boolean }) {
  if (!emoji) return null;
  const src = emojiImage(emoji);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- small local pictures; no resizing needed
    return <img src={src} alt="" aria-hidden className={`shrink-0 ${className} ${faded ? "opacity-55" : ""}`} />;
  }
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center leading-none ${className} ${faded ? "opacity-55" : ""}`} style={{ fontSize: "0.8em" }}>
      <span className="text-[1.6em]">{emoji}</span>
    </span>
  );
}

/**
 * What an editor panel shows before anything is picked: one big picture, a
 * short line saying what to tap, and at most one line of help. Every manager
 * uses this, so empty panels look the same everywhere.
 */
export function EmptyState({ emoji, title, hint }: { emoji: string; title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="m-auto flex max-w-[30rem] flex-col items-center gap-3 p-6 text-center">
      <Emoji emoji={emoji} className="size-20" />
      <p className="text-2xl font-bold text-balance text-ink">{title}</p>
      {hint ? <p className="text-lg text-balance text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** A thin bar in a person's colour, e.g. 3 of 5 steps done. */
export function ProgressBar({ done, total, colour, thick = false }: { done: number; total: number; colour?: string | null; thick?: boolean }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className={`overflow-hidden rounded-full bg-grid ${thick ? "h-2.5" : "h-2"}`}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: colour ? strong(colour) : "var(--color-success)" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms and messages
// ---------------------------------------------------------------------------

/** A simple page for sign-in and first-time setup (no rail). */
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6 sm:p-10">
      <h1 className="text-5xl font-extrabold tracking-tight text-ink">{title}</h1>
      {children}
    </main>
  );
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-frame bg-board px-5.5 py-4.5">
      {title ? <h2 className="mb-4 text-2xl font-bold text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex min-h-[var(--touch-target)] items-center justify-center gap-2 rounded-[var(--radius)] px-5 text-lg font-bold transition-opacity hover:opacity-90 disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "save" }) {
  const look = {
    primary: "bg-ink text-board",
    // The blue of the screen-wide Save (unsaved-changes.tsx), so every Save looks the same.
    save: "bg-accent text-white",
    secondary: "bg-rail text-ink hover:bg-panel",
    danger: "border-2 border-danger bg-board text-danger",
  }[variant];
  return <button className={`${buttonBase} ${look} ${className}`} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-base font-bold text-ink">{label}</span>
      {children}
      {hint ? <span className="text-sm text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-accent";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${inputClass} ${className}`} {...props} />;
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const look = tone === "error" ? "bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] text-danger" : "bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-success";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`shrink-0 rounded-2xl px-5 py-3 text-lg font-bold ${look}`}>
      {children}
    </p>
  );
}

/** Reads a single string from Next.js search params. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type ChipOption = { value: string; label: string; leading?: ReactNode };

/**
 * A row of big tappable choices, used instead of a dropdown so picking
 * something on a touch screen is one tap. Underneath they're ordinary
 * radio buttons (pick one) or checkboxes (pick several), so forms work
 * without any extra code.
 */
export function Chips({
  name,
  label,
  options,
  defaultValue,
  multiple = false,
  className = "",
}: {
  name: string;
  label: string;
  options: readonly ChipOption[];
  defaultValue?: string | readonly string[];
  multiple?: boolean;
  className?: string;
}) {
  const chosen = new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue === undefined ? [] : [defaultValue]);
  return (
    <fieldset className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <legend className="mb-1.5 text-base font-bold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o.value}
              defaultChecked={chosen.has(o.value)}
              className="sr-only"
            />
            {o.leading}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What a screen shows for the moment while it's being read: soft grey
 * outlines where the header and cards will be, instead of the word
 * "Loading…" on a blank screen.
 */
export function LoadingOutline() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col gap-5" role="status" aria-label="Loading">
      <div className="flex h-18 shrink-0 items-center gap-5">
        <span className="h-12 w-72 rounded-2xl bg-rail" />
        <span className="h-12 w-56 rounded-2xl bg-rail" />
        <span className="ml-auto h-12 w-44 rounded-2xl bg-rail" />
      </div>
      <div className="grid min-h-[20rem] flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
        <span className="rounded-[var(--radius-card)] border border-frame bg-rail/60" />
        <span className="rounded-[var(--radius-card)] border border-frame bg-rail/60" />
      </div>
    </div>
  );
}
