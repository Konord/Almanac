import type { ComponentProps, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { emojiImage } from "@/lib/emoji";
import { hand, soft, strong } from "@/lib/colours";
import { HOLIDAY_READY_ATTR } from "@/lib/holiday-theme";
import { TimerPill } from "./timer-pill";
import { MenuTray, type Section } from "./menu-tray";
import { WeatherSlot } from "./weather";

/**
 * Small building blocks shared by every screen, in the Glance A style
 * (docs/glance/SPEC.md): a light grey rail behind white rounded panels. They only use theme colours (bg-board, text-ink, accent …), and
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
 * that slides up with a swipe from the bottom edge (see menu-tray.tsx).
 */
export function AppFrame({ section, children }: { section: Section; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-rail lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      {/* No strip at the bottom: the tray comes out with a swipe up from the edge (no dock, no side rail). */}
      <main className="flex min-w-0 flex-1 flex-col gap-3.5 p-4 sm:p-6 lg:min-h-0 lg:gap-5 lg:px-8 lg:pt-6 lg:pb-6">
        {children}
      </main>
      <MenuTray section={section} />
      <TimerPill />
    </div>
  );
}

/**
 * The Glance header, the same 7rem band on every screen (SPEC "Global
 * header rule"). From left to right:
 *
 *   - a big printed title (6.75rem, weight 800), with optional secondary
 *     text (the date, the year) sitting on the title's baseline, and on a
 *     holiday a big picture before it;
 *   - `children`: any other live controls the screen still needs, if they
 *     fit beside the title (they move into the screen bodies as each
 *     screen is redesigned);
 *   - the weather (calendar pages only; see weather.tsx);
 *   - `nav`: prev / next arrows, just left of the tab slot;
 *   - the tab slot, a fixed width so the right-hand end never shifts:
 *     Today | Week | Month on the calendar pages, the page's own sub-tabs
 *     elsewhere, or empty;
 *   - `action`: the black Add (or Save, or "New list") at the far right.
 *
 * Nothing goes under the title (no chips). A screen with more live
 * controls than fit (Today, Week, Month for now) passes them as `toolbar`:
 * a slim row just below the header band, so the band itself is the same
 * 7rem everywhere.
 */
export function ScreenHeader({
  title,
  sub,
  hero,
  nav,
  tabs,
  weather = false,
  action,
  toolbar,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** A holiday's big picture, before the title. */
  hero?: string | null;
  nav?: ReactNode;
  tabs?: ReactNode;
  /** Calendar pages keep a place for the weather. */
  weather?: boolean;
  action?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
}) {
  const band = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-[1.15rem] gap-y-2 lg:h-28 lg:max-h-28 lg:flex-nowrap">
      <div className="mr-auto flex min-w-0 items-baseline gap-[0.8rem] overflow-hidden">
        {hero ? <Emoji emoji={hero} className="size-14 self-center drop-shadow-[0_0.15rem_0.4rem_rgba(0,0,0,0.3)] lg:size-24" /> : null}
        <h1 className="shrink-0 pb-[0.06em] text-[3.5rem] leading-[0.9] font-extrabold tracking-[-0.045em] text-title lg:text-[6.75rem]">{title}</h1>
        {sub && sub !== title ? <span className="tabular min-w-0 truncate text-2xl leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-title-soft lg:text-[2rem]">{sub}</span> : null}
      </div>
      {children ? <div className="flex min-w-0 items-center gap-[0.6rem]">{children}</div> : null}
      <div className="flex shrink-0 items-center gap-[0.6rem]">
        {weather ? <WeatherSlot /> : null}
        {nav ? <div className="flex items-center gap-[0.35rem]">{nav}</div> : null}
        <div className="flex justify-end lg:min-w-[22.5rem]">{tabs}</div>
        {action}
      </div>
    </header>
  );
  if (!toolbar) return band;
  return (
    <>
      {band}
      <div className="-mt-2 flex min-h-[var(--touch-target)] shrink-0 flex-wrap items-center gap-[0.6rem]">{toolbar}</div>
    </>
  );
}

/** The track of a segmented switch, and one of its options (for switches made of buttons). */
export const segTrackClass = "flex gap-1 rounded-[calc(var(--radius)+0.3rem)] bg-panel p-[0.3rem]";
export function segItemClass(active: boolean): string {
  return `flex min-h-[var(--touch-target)] min-w-[6.75rem] items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-lg whitespace-nowrap ${
    active ? "bg-tab-on font-bold text-tab-on-ink shadow-raised" : "font-semibold text-ink-muted"
  }`;
}

/** A segmented switch, like Today / Week / Month. */
export function Segmented({ options, label }: { options: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className={segTrackClass}>
      {options.map((o) => (
        <Link key={o.label} href={o.href} aria-current={o.active ? "page" : undefined} className={segItemClass(o.active)}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** The look of the main action (Add, Save, New list): ink black, or the holiday colour. */
export const primaryActionClass =
  "inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-[0.6rem] rounded-[var(--radius)] bg-primary px-[1.35rem] text-lg font-bold whitespace-nowrap text-primary-ink";

/**
 * The header's main action keeps one width at least, so Add → Stop or
 * Save → Saving… never nudges the header (Connor, 2026-11-16).
 */
export const headerActionWidth = "min-w-[8.5rem]";

/** A grey second-rank button ("+ Add a kind", "Type it in"). */
export const secondaryActionClass =
  "inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-[0.6rem] rounded-[var(--radius)] bg-panel px-6 text-lg font-bold whitespace-nowrap text-ink disabled:opacity-40";

/** A white card on the rail (a manager's list or editor panel): the mock's `.card`. */
export const cardClass = "flex min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised lg:min-h-0";

/** A small capital heading inside a card: the mock's `.k`. */
export const kickerClass = "shrink-0 text-[1.15rem] font-bold tracking-[0.06em] text-ink-muted uppercase";

/** A big tappable choice (a month, a weekday): a round chip, ink-framed when picked. */
export function choiceChipClass(on: boolean): string {
  return `flex min-h-[var(--touch-target)] items-center justify-center rounded-full border-2 px-4 text-[1.25rem] font-bold ${
    on ? "border-ink bg-rail text-ink" : "border-frame bg-board text-ink-soft"
  }`;
}

/** A field's small label above it ("When", "Minutes"): the mock's `.fl`. */
export const fieldLabelClass = "text-[1.15rem] font-bold text-ink-muted";

/** A typed-in field in an editor card (big bold text, grey frame): the mock's `.inp`. */
export const editorInputClass =
  "min-h-[var(--touch-target)] w-full min-w-0 rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-[1.5rem] font-bold text-ink outline-none focus:border-ink disabled:opacity-40";

/**
 * A small switch of choices inside a card ("When", "Who can see it",
 * On | Off): grey track, the picked one raised in white. For a page's
 * own tabs use the header's segmented switch instead.
 */
export function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  /** Nothing is raised when it's null (e.g. "some steps" of a routine). */
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-[0.2rem] rounded-[var(--radius)] bg-panel p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex min-h-[calc(var(--touch-target)-0.2rem)] min-w-0 flex-1 items-center justify-center rounded-[calc(var(--radius)-0.15rem)] px-3 text-center text-[1.25rem] leading-[1.15] font-bold disabled:opacity-60 ${
            value === o.value ? "bg-board text-ink shadow-raised" : "text-ink-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A person's colour as a round dot (instead of an avatar). */
export function ColourDot({ colour, className = "size-[1.15rem]" }: { colour: string | null | undefined; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: strong(colour) }} />;
}

/**
 * An on/off setting as a whole-row switch: the words on the left, the
 * switch at the right (blue when on, grey when off). The mock's `.tog`.
 */
export function Switch({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[var(--touch-target)] w-full items-center justify-between gap-[0.7rem] text-left text-[1.25rem] leading-tight font-bold text-ink"
    >
      <span className="min-w-0">{children}</span>
      <span aria-hidden className="relative h-8 w-[3.4rem] shrink-0 rounded-full" style={{ background: on ? strong("blue") : "var(--color-check-border)" }}>
        <span className={`absolute top-[0.22rem] size-[1.55rem] rounded-full bg-board shadow-raised transition-[left] ${on ? "left-[1.6rem]" : "left-[0.22rem]"}`} />
      </span>
    </button>
  );
}

/** The look of a person chip (dot + name): pastel with their ink when on, plain when off. The mock's `.who-chip`. */
export function whoChipStyle(colour: string | null | undefined, on: boolean): { className: string; style: CSSProperties | undefined } {
  return {
    className: `inline-flex min-h-[var(--touch-target)] min-w-0 items-center gap-[0.4rem] rounded-full border-2 px-[1.1rem] text-[1.25rem] font-bold ${on ? "" : "border-frame bg-board text-ink"}`,
    style: on ? { borderColor: strong(colour), background: soft(colour), color: hand(colour) } : undefined,
  };
}

/** The header's main action as a link, e.g. "+ Add" or "+ New list". */
export function ActionLink({
  href,
  children,
  label,
  icon: IconComponent = Plus,
  scroll,
}: {
  href: string;
  children: ReactNode;
  /** For screen readers when the words alone aren't enough. */
  label?: string;
  icon?: Icon | null;
  scroll?: boolean;
}) {
  return (
    <Link href={href} aria-label={label} title={label} scroll={scroll} className={`${primaryActionClass} ${headerActionWidth}`}>
      {IconComponent ? <IconComponent size="1.25rem" weight="bold" aria-hidden /> : null}
      {children}
    </Link>
  );
}

/** Text someone in the family wrote: handwriting in their ink (dark ink if it isn't anyone's). */
export function HandText({ colour, className = "", children }: { colour?: string | null; className?: string; children: ReactNode }) {
  return (
    <span className={`font-hand ${className}`} style={{ color: hand(colour) }}>
      {children}
    </span>
  );
}

/** A round button with a Phosphor icon (for ‹ › arrows and the like). */
export function IconLink({ href, label, icon: IconComponent }: { href: string; label: string; icon: Icon }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink"
    >
      <IconComponent size="1.5rem" weight="bold" aria-hidden />
    </Link>
  );
}

/** A plain text button-link with a soft fill, e.g. "Today" or "Set up routines". */
export function SoftLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] bg-panel px-5 text-lg font-bold text-ink ${className}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Cards, people and pictures
// ---------------------------------------------------------------------------

/** A white rounded panel lifted off the rail, with a title row and a tinted icon chip. */
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
    <section className={`flex min-w-0 flex-col rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised lg:min-h-0 ${className}`}>
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
export function EmptyState({ emoji, title, hint }: { emoji: string; title?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="m-auto flex max-w-[30rem] flex-col items-center gap-3 p-6 text-center">
      <Emoji emoji={emoji} className="size-20 opacity-60" />
      {title ? <p className="text-2xl font-bold text-balance text-ink">{title}</p> : null}
      {hint ? <p className="text-lg text-balance text-ink-muted">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms and messages
// ---------------------------------------------------------------------------

/**
 * A simple page for sign-in and first-time setup (no menu): one centred
 * Glance card on the grey rail, the big printed title above it.
 */
export function PageShell({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-rail p-6 sm:p-10 lg:h-dvh lg:overflow-hidden">
      <div className="flex w-full max-w-[46rem] flex-col gap-6">
        <div className="flex items-baseline gap-[0.8rem]">
          <h1 className="text-[3.5rem] leading-[0.9] font-extrabold tracking-[-0.045em] text-title lg:text-[6.75rem]">{title}</h1>
          {sub ? <span className="text-2xl leading-none font-bold tracking-[-0.02em] text-title-soft lg:text-[2rem]">{sub}</span> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

/** A white Glance card with an optional title (the sign-in and setup cards). */
export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-board px-[1.65rem] pt-6 pb-[1.6rem] shadow-raised">
      {title ? <h2 className="text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex min-h-[var(--touch-target)] items-center justify-center gap-[0.6rem] rounded-[var(--radius)] px-[1.35rem] text-[1.25rem] font-bold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "save" }) {
  const look = {
    primary: "bg-primary text-primary-ink",
    // The blue of the screen-wide Save (unsaved-changes.tsx), so every Save looks the same.
    save: "bg-accent text-white",
    secondary: "bg-panel text-ink",
    danger: "border-2 border-danger bg-board text-danger",
  }[variant];
  return <button className={`${buttonBase} ${look} ${className}`} {...props} />;
}

/** A labelled field: the mock's small grey `.fl` label above the box, and an optional line of help under it. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-[0.35rem]">
      <span className={fieldLabelClass}>{label}</span>
      {children}
      {hint ? <span className="text-[1.15rem] font-semibold text-ink-muted">{hint}</span> : null}
    </label>
  );
}

/** The mock's `.inp` (a step smaller, since these sit in forms with many fields). */
const inputClass =
  "min-h-[var(--touch-target)] min-w-0 rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-[1.35rem] font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-muted focus:border-ink";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${inputClass} ${className}`} {...props} />;
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const look = tone === "error" ? "bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] text-danger" : "bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-success";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`shrink-0 rounded-[var(--radius)] px-5 py-3 text-[1.25rem] font-bold ${look}`}>
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
      <legend className={`mb-[0.35rem] ${fieldLabelClass}`}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-[1.25rem] font-semibold text-ink-soft select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent"
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
      <div className="flex h-28 shrink-0 items-center gap-5">
        <span className="h-12 w-72 rounded-2xl bg-rail" />
        <span className="h-12 w-56 rounded-2xl bg-rail" />
        <span className="ml-auto h-12 w-44 rounded-2xl bg-rail" />
      </div>
      <div className="grid min-h-[20rem] flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
        <span className="rounded-[var(--radius-card)] bg-board/70" />
        <span className="rounded-[var(--radius-card)] bg-board/70" />
      </div>
    </div>
  );
}

/**
 * An empty marker a screen draws when it's ready for holiday colours
 * (Christmas, Halloween): its content sits on white panels, so a dark rail
 * is fine. See src/lib/holiday-theme.ts.
 */
export function HolidayColoursHere() {
  return <span hidden {...{ [HOLIDAY_READY_ATTR]: "" }} />;
}
