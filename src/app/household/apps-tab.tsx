"use client";

import { useState, type ReactNode } from "react";
import { AppWindow, ArrowDown, ArrowUp, Desktop, Globe, Plus } from "@phosphor-icons/react";
import { Card, EmptyState } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useLauncher } from "@/components/launcher-store";
import { PERSON_COLOURS, soft, strong } from "@/lib/colours";
import { emojiImage } from "@/lib/emoji";
import { MAX_APPS, type AppDraft } from "@/lib/launcher";

/*
 * Settings › Apps (2026-11-11): the apps in the kitchen screen's tray.
 * The list on the left is the tray's order (move with the arrows); the
 * app you tap is on the right. Like the rest of Settings, nothing is kept
 * until Save.
 *
 * A web app is one on the server (Jellyfin, Actual): it needs its address.
 * A program is one on the kitchen PC (Steam, FreeTube): it's picked from
 * the launcher helper's own list, which only shows on the kitchen screen.
 */

let counter = 0;
const newId = () => `new-app-${Date.now()}-${counter++}`;

const inputClass = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-accent";

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-full border-2 px-4 text-lg text-ink ${on ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
    >
      {children}
    </button>
  );
}

/** The small rounded square used in the list, matching the tray's tiles. */
function MiniTile({ app }: { app: AppDraft }) {
  const src = app.icon ? emojiImage(app.icon) : null;
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-[0.875rem]" style={{ background: soft(app.colour) }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- small local picture
        <img src={src} alt="" aria-hidden className="size-8" />
      ) : (
        <span aria-hidden className="text-2xl font-extrabold text-ink">{app.icon ?? (app.name.slice(0, 1).toUpperCase() || "?")}</span>
      )}
    </span>
  );
}

export function AppsTab({ apps, onChange }: { apps: AppDraft[]; onChange: (apps: AppDraft[]) => void }) {
  const [selected, setSelected] = useState<string | null>(apps[0]?.id ?? null);
  const app = apps.find((a) => a.id === selected);
  const kept = apps.filter((a) => !a.removed).length;

  const change = (id: string, changes: Partial<AppDraft>) => onChange(apps.map((a) => (a.id === id ? { ...a, ...changes } : a)));
  const move = (id: string, by: -1 | 1) => {
    const i = apps.findIndex((a) => a.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= apps.length) return;
    const next = [...apps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const id = newId();
    onChange([...apps, { id, name: "", icon: null, colour: "slate", kind: "web", address: "", localKey: "", checkUp: true, removed: false }]);
    setSelected(id);
  };

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card title="Apps" icon={AppWindow} tint="purple" aside={<span className="text-base font-bold text-ink-muted">{kept} of {MAX_APPS}</span>}>
        <p className="text-base text-ink-muted">They show on the kitchen screen: drag the menu up twice.</p>
        {/* At most 8 apps, so the list always fits without pages. */}
        <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
          {apps.map((a, i) => (
            <li key={a.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelected(a.id)}
                aria-pressed={selected === a.id}
                className={`flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 text-left ${selected === a.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"} ${a.removed ? "opacity-50" : ""}`}
              >
                <MiniTile app={a} />
                <span className={`min-w-0 flex-1 truncate text-xl font-bold text-ink ${a.removed ? "line-through" : ""}`}>{a.name || "New app"}</span>
                <span className="shrink-0 text-base text-ink-muted">{a.removed ? "Removed when you save" : a.kind === "web" ? "Web app" : "Program"}</span>
              </button>
              <button type="button" aria-label={`Move ${a.name || "this app"} earlier`} disabled={i === 0} onClick={() => move(a.id, -1)} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
                <ArrowUp size="1.25rem" weight="bold" aria-hidden />
              </button>
              <button type="button" aria-label={`Move ${a.name || "this app"} later`} disabled={i === apps.length - 1} onClick={() => move(a.id, 1)} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
                <ArrowDown size="1.25rem" weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={add}
          disabled={kept >= MAX_APPS}
          className="mt-3 flex min-h-[var(--touch-target)] items-center gap-2 self-start rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel disabled:opacity-40"
        >
          <Plus size="1.25rem" weight="bold" aria-hidden />
          Add an app
        </button>
      </Card>

      <Card title={app ? app.name || "New app" : "App"} icon={app?.kind === "local" ? Desktop : Globe} tint={app?.colour ?? "slate"}>
        {app ? (
          <AppEditor
            key={app.id}
            app={app}
            onChange={(c) => {
              // An app added and taken away before saving just goes.
              if (c.removed && app.id.startsWith("new-")) {
                onChange(apps.filter((a) => a.id !== app.id));
                setSelected(null);
              } else change(app.id, c);
            }}
          />
        ) : (
          <EmptyState emoji="🕹️" title="Tap an app to change it" hint="Or add one: Jellyfin, Actual, Steam…" />
        )}
      </Card>
    </div>
  );
}

function AppEditor({ app, onChange }: { app: AppDraft; onChange: (c: Partial<AppDraft>) => void }) {
  const { helper } = useLauncher();
  const programs = helper ? helper.programs : [];
  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-end gap-3">
        <EmojiPicker initial={app.icon ?? ""} fieldName="" nameText={app.name} letter fullScreen label={`Picture for ${app.name || "this app"}`} onChange={(icon) => onChange({ icon: icon || null })} />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Name</span>
          <input value={app.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={30} placeholder="Jellyfin" className={inputClass} autoFocus={!app.name} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-base font-bold text-ink">Tile colour</legend>
        <div className="flex flex-wrap gap-2">
          {PERSON_COLOURS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              aria-pressed={app.colour === c.value}
              onClick={() => onChange({ colour: c.value })}
              className={`size-[var(--touch-target)] rounded-[0.875rem] border-2 ring-ink ring-offset-2 ${app.colour === c.value ? "ring-4" : ""}`}
              style={{ background: soft(c.value), borderColor: strong(c.value) }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-base font-bold text-ink">Where it runs</legend>
        <div className="flex flex-wrap gap-2">
          <Pill on={app.kind === "web"} onClick={() => onChange({ kind: "web" })}>
            <Globe size="1.375rem" aria-hidden />
            On the server (a web address)
          </Pill>
          <Pill on={app.kind === "local"} onClick={() => onChange({ kind: "local" })}>
            <Desktop size="1.375rem" aria-hidden />
            On the kitchen PC (a program)
          </Pill>
        </div>
      </fieldset>

      {app.kind === "web" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-bold text-ink">Web address</span>
            <input value={app.address} onChange={(e) => onChange({ address: e.target.value })} inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="http://192.168.2.10:8096" className={inputClass} />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-base font-bold text-ink">Show if it&apos;s up</legend>
            <div className="flex flex-wrap gap-2">
              <Pill on={app.checkUp} onClick={() => onChange({ checkUp: true })}>Yes, check every minute</Pill>
              <Pill on={!app.checkUp} onClick={() => onChange({ checkUp: false })}>No</Pill>
            </div>
          </fieldset>
        </>
      ) : programs.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-base font-bold text-ink">Which program</legend>
          <div className="flex flex-wrap gap-2">
            {programs.map((p) => (
              <Pill key={p.key} on={app.localKey === p.key} onClick={() => onChange({ localKey: p.key, name: app.name || p.name })}>
                {p.name}
              </Pill>
            ))}
          </div>
          <span className="text-base text-ink-muted">These come from the launcher&apos;s list on the kitchen PC.</span>
        </fieldset>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Program name in the launcher&apos;s list</span>
          <input value={app.localKey} onChange={(e) => onChange({ localKey: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={40} autoCapitalize="off" spellCheck={false} placeholder="steam" className={inputClass} />
          <span className="text-base text-ink-muted">On the kitchen screen you can pick from the list instead.</span>
        </label>
      )}

      <div className="mt-auto flex justify-end">
        {app.removed ? (
          <button type="button" onClick={() => onChange({ removed: false })} className="flex min-h-[var(--touch-target)] items-center rounded-2xl bg-rail px-5 text-lg font-bold text-ink">
            Keep {app.name || "it"}
          </button>
        ) : (
          <button type="button" onClick={() => onChange({ removed: true })} className="flex min-h-[var(--touch-target)] items-center rounded-2xl border-2 border-danger px-5 text-lg font-bold text-danger">
            Remove {app.name || "this app"}
          </button>
        )}
      </div>
    </div>
  );
}
