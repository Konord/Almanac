import type { ComponentProps, ReactNode } from "react";

/**
 * Small building blocks shared by every screen. They only use theme
 * colours (bg-board, text-ink, marker-*), and every tappable thing is at
 * least the theme's touch-target size so it works on the wall screen.
 */

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6 sm:p-10">
      <h1 className="border-b-4 border-marker-blue pb-3 text-4xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      {children}
    </main>
  );
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border-2 border-frame bg-panel/60 p-5 sm:p-6">
      {title ? <h2 className="mb-4 text-2xl font-semibold text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius)] px-5 text-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const look = {
    primary: "bg-marker-blue text-board",
    secondary: "border-2 border-frame bg-board text-ink",
    danger: "border-2 border-marker-red bg-board text-marker-red",
  }[variant];
  return <button className={`${buttonBase} ${look} ${className}`} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-base font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-sm text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-marker-blue";

export function Input(props: ComponentProps<"input">) {
  return <input className={inputClass} {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select className={inputClass} {...props} />;
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const look =
    tone === "error"
      ? "border-marker-red text-marker-red"
      : "border-marker-green text-marker-green";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-[var(--radius)] border-2 bg-board px-4 py-3 text-base ${look}`}>
      {children}
    </p>
  );
}

/** Reads a single string from Next.js search params. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
