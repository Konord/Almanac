"use client";

import { useState, type ReactNode } from "react";
import { CaretLeft, CaretRight, GearSix, HouseLine, Plus, SignOut, SquaresFour, UserCircle, UsersThree } from "@phosphor-icons/react";
import { Avatar, Card, EmptyState, ScreenHeader, SoftLink } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { PERSON_COLOURS, strong } from "@/lib/colours";
import type { PanelBox } from "@/lib/panel-boxes";
import { signOut } from "@/app/login/actions";
import { saveHousehold } from "./actions";
import type { MemberDraft, SettingsDraft } from "./draft";

/*
 * Settings (rebuilt 2026-11-10 so nothing scrolls and there's one Save):
 * two tabs. People: everyone on the left, the one you tap on the right.
 * Household: the household's settings as big chips. Every change waits
 * for Save in the header; leaving with changes asks first.
 */

type Tab = "people" | "household";
const PER_PAGE = 7;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let counter = 0;
const newId = () => `new-${Date.now()}-${counter++}`;

const inputClass = "min-h-[var(--touch-target)] rounded-[var(--radius)] border-2 border-frame bg-board px-4 text-lg text-ink outline-none focus:border-accent";

/** One tap choices (a controlled version of the Chips in ui.tsx). */
function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-bold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[var(--touch-target)] items-center rounded-full border-2 px-4 text-lg text-ink ${o.value === value ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TextField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-base font-bold text-ink">{label}</span>
      {children}
      {hint ? <span className="text-base text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export function SettingsEditor({ initial, boxes }: { initial: SettingsDraft; boxes: PanelBox[] }) {
  const [draft, setDraft] = useState<SettingsDraft>(initial);
  const [tab, setTab] = useState<Tab>("people");
  const [selected, setSelected] = useState<string | null>(initial.members[0]?.id ?? null);
  const [page, setPage] = useState(0);
  const [listRef, perPage] = useFitRows<HTMLUListElement>(PER_PAGE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useUnsavedChanges(dirty);

  const set = (changes: Partial<SettingsDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...changes }));
  };
  const setMember = (id: string, changes: Partial<MemberDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...changes } : m)) }));
  };

  const save = async (then?: string | null) => {
    setSaving(true);
    const result = await saveHousehold(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      guard.stay();
      return;
    }
    guard.saved(then);
  };
  const undo = () => {
    setDraft(initial);
    setError(null);
    setSelected(initial.members[0]?.id ?? null);
  };

  const addPerson = () => {
    const id = newId();
    const used = new Set(draft.members.map((m) => m.colour));
    const colour = PERSON_COLOURS.find((c) => !used.has(c.value))?.value ?? "blue";
    set({ members: [...draft.members, { id, name: "", role: "child", colour, icon: null, birthYear: null, hasPin: false, pin: "", pinAgain: "", removed: false }] });
    setSelected(id);
    setPage(Math.floor(draft.members.length / perPage));
  };

  const pages = Math.max(1, Math.ceil(draft.members.length / perPage));
  const p = Math.min(page, pages - 1);
  const shown = draft.members.slice(p * perPage, (p + 1) * perPage);
  const member = draft.members.find((m) => m.id === selected);

  return (
    <>
      <ScreenHeader title="Settings">
        <nav aria-label="Settings" className="flex gap-1 rounded-2xl bg-panel p-1.25">
          {(
            [
              { tab: "people", label: "People", icon: UsersThree },
              { tab: "household", label: "Household", icon: GearSix },
            ] as const
          ).map((t) => (
            <button
              key={t.tab}
              type="button"
              onClick={() => setTab(t.tab)}
              aria-pressed={tab === t.tab}
              className={`flex min-h-[var(--touch-target)] items-center gap-2 rounded-xl px-5 text-lg font-bold ${tab === t.tab ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
            >
              <t.icon size="1.375rem" aria-hidden />
              {t.label}
            </button>
          ))}
        </nav>
        <SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />
      </ScreenHeader>

      {tab === "people" ? (
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card
            title="People"
            icon={UsersThree}
            tint="blue"
            aside={
              pages > 1 ? (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)} className="flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
                    <CaretLeft size="1.25rem" weight="bold" aria-hidden />
                  </button>
                  <span className="text-base font-bold text-ink-muted">
                    {p + 1} of {pages}
                  </span>
                  <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="flex size-12 items-center justify-center rounded-full bg-rail text-ink disabled:opacity-30">
                    <CaretRight size="1.25rem" weight="bold" aria-hidden />
                  </button>
                </div>
              ) : null
            }
          >
            <ul ref={listRef} className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              {shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    aria-pressed={selected === m.id}
                    className={`flex min-h-[4.25rem] w-full items-center gap-3 rounded-2xl px-3 text-left ${selected === m.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"} ${m.removed ? "opacity-50" : ""}`}
                  >
                    <Avatar name={m.name || "?"} colour={m.colour} icon={m.icon} />
                    <span className={`min-w-0 flex-1 truncate text-xl font-bold text-ink ${m.removed ? "line-through" : ""}`}>{m.name || "New person"}</span>
                    <span className="shrink-0 text-base text-ink-muted">
                      {m.removed ? "Removed when you save" : m.role === "parent" ? (m.hasPin || m.pin ? "Parent · PIN set" : "Parent") : "Child"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={addPerson} className="mt-3 flex min-h-[var(--touch-target)] items-center gap-2 self-start rounded-2xl bg-rail px-5 text-lg font-bold text-ink hover:bg-panel">
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Add someone
            </button>
          </Card>

          <Card title={member ? member.name || "New person" : "Person"} icon={UserCircle} tint={member?.colour ?? "slate"}>
            {member ? (
              <PersonEditor
                key={member.id}
                member={member}
                onChange={(c) => {
                  // Someone added and taken away before saving just goes.
                  if (c.removed && member.id.startsWith("new-")) {
                    set({ members: draft.members.filter((m) => m.id !== member.id) });
                    setSelected(null);
                  } else setMember(member.id, c);
                }}
              />
            ) : (
              <EmptyState emoji="👋" title="Tap someone to change them" hint="Or add someone new." />
            )}
          </Card>
        </div>
      ) : (
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
          <Card title="Household" icon={HouseLine} tint="slate">
            <div className="mt-2 flex flex-col gap-4">
              <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
                <TextField label="Name">
                  <input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} className={inputClass} />
                </TextField>
                <TextField label="Currency">
                  <input value={draft.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} maxLength={3} className={`${inputClass} uppercase`} />
                </TextField>
              </div>
              <TextField label="Time zone" hint="For example, America/Toronto.">
                <input value={draft.timeZone} onChange={(e) => set({ timeZone: e.target.value })} className={inputClass} />
              </TextField>
              <Choice label="Units" value={draft.units} onChange={(units) => set({ units })} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />
              <Choice
                label="Temperature"
                value={draft.temperatureUnit}
                onChange={(temperatureUnit) => set({ temperatureUnit })}
                options={[{ value: "celsius", label: "Celsius" }, { value: "fahrenheit", label: "Fahrenheit" }]}
              />
              <Choice
                label="Kitchen measures"
                value={draft.measures}
                onChange={(measures) => set({ measures })}
                options={[{ value: "canadian", label: "Canadian (1 cup = 250 ml)" }, { value: "us", label: "US (1 cup = 237 ml)" }]}
              />
              <div className="mt-auto flex flex-wrap gap-2.5 border-t border-frame pt-4">
                <SoftLink href="/households">
                  <HouseLine size="1.5rem" aria-hidden />
                  Switch or add household
                </SoftLink>
                <form action={signOut}>
                  <button className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-2xl bg-rail px-4 text-lg font-bold text-ink hover:bg-panel">
                    <SignOut size="1.5rem" aria-hidden />
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </Card>

          <div className="flex min-h-0 flex-col gap-5">
            <Card title="Calendar" icon={GearSix} tint="teal">
              <div className="mt-2 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Choice label="Week starts on" value={draft.weekStartsOn} onChange={(weekStartsOn) => set({ weekStartsOn })} options={[{ value: 0, label: "Sunday" }, { value: 1, label: "Monday" }]} />
                  <Choice label="Month shows" value={draft.monthStyle} onChange={(monthStyle) => set({ monthStyle })} options={[{ value: "rolling", label: "Next 5 weeks" }, { value: "calendar", label: "The month" }]} />
                </div>
                <div className="flex items-end gap-4">
                  <div className="min-w-0 flex-1">
                    <Choice label="Weekly review on" value={draft.reviewWeekday} onChange={(reviewWeekday) => set({ reviewWeekday })} options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))} />
                  </div>
                  <TextField label="At">
                    <input type="time" value={draft.reviewTime} onChange={(e) => set({ reviewTime: e.target.value })} className={`${inputClass} w-40`} />
                  </TextField>
                </div>
                <Choice
                  label="Write to-dos, meals and notes in"
                  value={draft.handwriting ? "hand" : "plain"}
                  onChange={(v) => set({ handwriting: v === "hand" })}
                  options={[{ value: "hand", label: <span className="font-hand text-xl">Handwriting</span> }, { value: "plain", label: "Plain letters" }]}
                />
              </div>
            </Card>
            <Card title="Today panel" icon={SquaresFour} tint="orange">
              <p className="mb-3 text-base text-ink-muted">The boxes you flip through on the Today panel.</p>
              <div className="flex flex-wrap gap-2">
                {boxes.map((b) => {
                  const on = draft.panelBoxes.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ panelBoxes: on ? draft.panelBoxes.filter((x) => x !== b.id) : boxes.map((x) => x.id).filter((x) => x === b.id || draft.panelBoxes.includes(x)) })}
                      className={`flex min-h-[var(--touch-target)] items-center rounded-full border-2 px-4 text-lg text-ink ${on ? "border-ink bg-rail font-bold" : "border-frame bg-board"}`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {guard.leaving ? <LeaveDialog what="some settings" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} /> : null}
    </>
  );
}

function PersonEditor({ member, onChange }: { member: MemberDraft; onChange: (c: Partial<MemberDraft>) => void }) {
  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-end gap-3">
        <EmojiPicker initial={member.icon ?? ""} fieldName="" nameText={member.name} letter fullScreen label={`Picture for ${member.name || "this person"}`} onChange={(icon) => onChange({ icon: icon || null })} />
        <div className="min-w-0 flex-1">
          <TextField label="Name">
            <input value={member.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={40} placeholder="Their name" className={inputClass} autoFocus={!member.name} />
          </TextField>
        </div>
        <TextField label="Born in">
          <input
            type="number"
            min={1900}
            max={2100}
            value={member.birthYear ?? ""}
            placeholder="Optional"
            onChange={(e) => onChange({ birthYear: e.target.value ? Number(e.target.value) : null })}
            className={`${inputClass} w-40`}
          />
        </TextField>
      </div>
      <Choice label="Role" value={member.role} onChange={(role) => onChange({ role })} options={[{ value: "parent", label: "Parent" }, { value: "child", label: "Child" }]} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-base font-bold text-ink">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {PERSON_COLOURS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              aria-pressed={member.colour === c.value}
              onClick={() => onChange({ colour: c.value })}
              className={`size-[var(--touch-target)] rounded-full ring-ink ring-offset-2 ${member.colour === c.value ? "ring-4" : ""}`}
              style={{ background: strong(c.value) }}
            />
          ))}
        </div>
      </fieldset>
      {member.role === "parent" ? (
        <div className="grid grid-cols-2 gap-4">
          <TextField label={member.hasPin ? "New PIN" : "PIN"} hint="4 to 8 digits, for parent mode later.">
            <input type="password" inputMode="numeric" autoComplete="off" value={member.pin} onChange={(e) => onChange({ pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} className={inputClass} />
          </TextField>
          <TextField label="Type it again">
            <input type="password" inputMode="numeric" autoComplete="off" value={member.pinAgain} onChange={(e) => onChange({ pinAgain: e.target.value.replace(/\D/g, "").slice(0, 8) })} className={inputClass} />
          </TextField>
        </div>
      ) : null}
      <div className="mt-auto flex justify-end">
        {member.removed ? (
          <button type="button" onClick={() => onChange({ removed: false })} className="flex min-h-[var(--touch-target)] items-center rounded-2xl bg-rail px-5 text-lg font-bold text-ink">
            Keep {member.name || "them"}
          </button>
        ) : (
          <button type="button" onClick={() => onChange({ removed: true })} className="flex min-h-[var(--touch-target)] items-center rounded-2xl border-2 border-danger px-5 text-lg font-bold text-danger">
            Remove {member.name || "this person"}
          </button>
        )}
      </div>
    </div>
  );
}
