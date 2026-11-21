"use client";

import { Pager } from "@/components/pager";
import { useEffect, useState, type ReactNode } from "react";
import { HouseLine, Plus, SignOut } from "@phosphor-icons/react";
import { ColourDot, EmptyState, ScreenHeader, SoftLink, Toggle, editorInputClass, secondaryActionClass, segItemClass, segTrackClass } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { TimeField } from "@/components/touch-pickers";
import { useFitRows } from "@/components/use-fit-rows";
import { LeaveDialog, SaveButton, useUnsavedChanges } from "@/components/unsaved-changes";
import { PERSON_COLOURS, strong } from "@/lib/colours";
import type { PanelBox } from "@/lib/panel-boxes";
import type { SoundSettings } from "@/lib/sounds";
import { signOut } from "@/app/login/actions";
import { useSearchParams } from "next/navigation";
import { saveHousehold } from "./actions";
import { AppsTab } from "./apps-tab";
import { Field, SettingsCard, chipClass } from "./fields";
import { ScreenSaverTab, type ArtOverview, type ScreenSaverView } from "./screen-saver-tab";
import { SpotifyTab, type SpotifyInfo } from "./spotify-tab";
import { WeatherTab, type WeatherInfo } from "./weather-tab";
import { setScreenSaverHere, useScreenSaverHere } from "@/components/screen-saver-here";
import { useLauncher } from "@/components/launcher-store";
import type { MemberDraft, SettingsDraft } from "./draft";

/*
 * Settings (Glance, g-final-settings.html). Tabs in the header's tab slot:
 * People | Household | Apps | Screen saver | Spotify | Weather, and one Save at the
 * far right. Nothing scrolls.
 *
 *   - Household (the mock): the people column on the left (colour dots,
 *     no avatars, and the picked person's editor under the list), then
 *     four cards: Household, Calendar, Today panel, Sounds and themes.
 *   - People: the same people and editor with more room (the list on the
 *     left, the person on the right).
 *   - Apps, Screen saver, Spotify, Weather: their own tabs (apps-tab.tsx,
 *     screen-saver-tab.tsx, spotify-tab.tsx, weather-tab.tsx).
 *
 * Every change waits for Save; leaving with changes asks first.
 */

type Tab = "people" | "household" | "apps" | "screen" | "spotify" | "weather";

/*
 * Saving starts the editor afresh (its key is the saved data), so it would
 * jump back to the People tab. Where you were is kept here across a save
 * and picked up again straight after.
 */
type Place = { tab: Tab; view: ScreenSaverView; selected: string | null; page: number };
let placeAfterSave: Place | null = null;
const PER_PAGE = 7;
/** Rows of people in the Household tab's narrow column (the mock shows four). */
const COLUMN_ROWS = 4;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A time field a little smaller than other fields, so two fit side by side. */
const timePickClass = "px-3! text-[1.25rem]!";

let counter = 0;
const newId = () => `new-${Date.now()}-${counter++}`;

export function SettingsEditor({
  initial,
  boxes,
  mealTimes,
  art,
  spotify,
  weather,
}: {
  initial: SettingsDraft;
  boxes: PanelBox[];
  mealTimes: { id: string; name: string }[];
  art: ArtOverview;
  spotify: SpotifyInfo;
  weather: WeatherInfo;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(initial);
  // The tray's "Settings › Apps" link opens straight on the Apps tab.
  const askedTab = useSearchParams().get("tab");
  const [kept] = useState(() => placeAfterSave);
  useEffect(() => {
    placeAfterSave = null;
  }, []);
  const [tab, setTab] = useState<Tab>(kept?.tab ?? (askedTab === "apps" || askedTab === "household" || askedTab === "screen" || askedTab === "spotify" || askedTab === "weather" ? askedTab : "people"));
  const [view, setView] = useState<ScreenSaverView>(kept?.view ?? "when");
  const [selected, setSelected] = useState<string | null>(kept && initial.members.some((m) => m.id === kept.selected) ? kept.selected : (initial.members[0]?.id ?? null));
  const [page, setPage] = useState(kept?.page ?? 0);
  const [columnPage, setColumnPage] = useState(0);
  const [listRef, perPage] = useFitRows<HTMLUListElement>(PER_PAGE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether this screen uses the screen saver is kept in this browser, but saved with the rest.
  const hereNow = useScreenSaverHere();
  const { helper } = useLauncher();
  const hereSaved = hereNow === "on" || (hereNow === null && Boolean(helper));
  const [hereDraft, setHereDraft] = useState<boolean | null>(null);
  const here = hereDraft ?? hereSaved;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || here !== hereSaved;
  const guard = useUnsavedChanges(dirty, () => {
    setDraft(initial);
    setHereDraft(null);
  });

  const set = (changes: Partial<SettingsDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...changes }));
  };
  const setSounds = (changes: Partial<SoundSettings>) => set({ sounds: { ...draft.sounds, ...changes } });
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
    if (here !== hereSaved) setScreenSaverHere(here ? "on" : "off");
    setHereDraft(null);
    // Only when the saved data changed, since only then does the editor start afresh.
    if (!then && JSON.stringify(draft) !== JSON.stringify(initial)) placeAfterSave = { tab, view, selected, page };
    guard.saved(then);
  };
  const undo = () => {
    setDraft(initial);
    setHereDraft(null);
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
    setColumnPage(Math.floor(draft.members.length / COLUMN_ROWS));
  };

  const member = draft.members.find((m) => m.id === selected);
  const changeMember = (c: Partial<MemberDraft>) => {
    if (!member) return;
    // Someone added and taken away before saving just goes.
    if (c.removed && member.id.startsWith("new-")) {
      set({ members: draft.members.filter((m) => m.id !== member.id) });
      setSelected(null);
    } else setMember(member.id, c);
  };

  const removeButton = (short: boolean) =>
    member ? (
      member.removed ? (
        <button type="button" onClick={() => changeMember({ removed: false })} className={secondaryActionClass}>
          Keep {short ? "them" : member.name || "them"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => changeMember({ removed: true })}
          aria-label={`Remove ${member.name || "this person"}`}
          className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center rounded-[var(--radius)] border-2 border-danger px-5 text-lg font-bold whitespace-nowrap text-danger"
        >
          {short ? "Remove" : `Remove ${member.name || "this person"}`}
        </button>
      )
    ) : null;
  const addButton = (
    <button type="button" onClick={addPerson} className={secondaryActionClass}>
      <Plus size="1.25rem" weight="bold" aria-hidden />
      Add someone
    </button>
  );

  return (
    <>
      <ScreenHeader
        title="Settings"
        sub={SETTINGS_TABS.find((t) => t.tab === tab)?.label}
        tabs={
          <nav aria-label="Settings" className={segTrackClass}>
            {SETTINGS_TABS.map((t) => (
              <button key={t.tab} type="button" onClick={() => setTab(t.tab)} aria-pressed={tab === t.tab} className={`${segItemClass(tab === t.tab)} !min-w-[5.75rem]`}>
                {t.label}
              </button>
            ))}
          </nav>
        }
        action={<SaveButton dirty={dirty} saving={saving} error={error} onSave={() => save()} onUndo={undo} />}
      />

      {tab === "weather" ? (
        <WeatherTab value={draft.weather} onChange={(place) => set({ weather: place })} info={weather} />
      ) : tab === "spotify" ? (
        <SpotifyTab info={spotify} />
      ) : tab === "screen" ? (
        <ScreenSaverTab value={draft.screenSaver} onChange={(screenSaver) => set({ screenSaver })} here={here} onHere={setHereDraft} mealTimes={mealTimes} art={art} view={view} onView={setView} brightness={draft.brightness} onBrightness={(brightness) => set({ brightness })} />
      ) : tab === "apps" ? (
        <AppsTab apps={draft.apps} onChange={(apps) => set({ apps })} />
      ) : tab === "people" ? (
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <PeopleList
            members={draft.members}
            selected={selected}
            onSelect={setSelected}
            page={page}
            perPage={perPage}
            onPage={setPage}
            listRef={listRef}
            footer={<div className="mt-3 flex">{addButton}</div>}
          />
          <SettingsCard title={member ? member.name || "New person" : "Person"}>
            {member ? (
              <div className="flex min-h-0 max-w-[48rem] flex-1 flex-col">
                <PersonFields key={member.id} member={member} onChange={changeMember} />
                <div className="mt-auto flex justify-end pt-4">{removeButton(false)}</div>
              </div>
            ) : (
              <EmptyState emoji="👋" />
            )}
          </SettingsCard>
        </div>
      ) : (
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[26rem_minmax(0,1fr)]">
          <PeopleList
            members={draft.members}
            selected={selected}
            onSelect={setSelected}
            page={columnPage}
            perPage={COLUMN_ROWS}
            onPage={setColumnPage}
            footer={
              <>
                {member ? <PersonFields key={member.id} member={member} onChange={changeMember} /> : null}
                <div className="mt-auto flex gap-[0.6rem] pt-3 [&>*]:flex-1">
                  {addButton}
                  {removeButton(true)}
                </div>
              </>
            }
          />

          <div className="flex min-h-0 flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <SettingsCard title="Household">
                <div className="grid grid-cols-[minmax(0,1fr)_6rem_14.5rem] gap-x-4">
                  <Field label="Name">
                    <input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} aria-label="Household name" className={editorInputClass} />
                  </Field>
                  <Field label="Currency">
                    <input value={draft.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} maxLength={3} aria-label="Currency" className={`${editorInputClass} uppercase`} />
                  </Field>
                  <Field label="Time zone">
                    <input value={draft.timeZone} onChange={(e) => set({ timeZone: e.target.value })} aria-label="Time zone" className={editorInputClass} />
                  </Field>
                </div>
                <div className="mt-[0.6rem] grid grid-cols-2 gap-x-4">
                  <Field label="Units">
                    <Toggle label="Units" value={draft.units} onChange={(units) => set({ units })} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />
                  </Field>
                  <Field label="Temperature">
                    <Toggle label="Temperature" value={draft.temperatureUnit} onChange={(temperatureUnit) => set({ temperatureUnit })} options={[{ value: "celsius", label: "Celsius" }, { value: "fahrenheit", label: "Fahrenheit" }]} />
                  </Field>
                </div>
                <Field label="Kitchen measures" className="mt-[0.6rem]">
                  <Toggle label="Kitchen measures" value={draft.measures} onChange={(measures) => set({ measures })} options={[{ value: "canadian", label: "Canadian (1 cup = 250 ml)" }, { value: "us", label: "US (1 cup = 237 ml)" }]} />
                </Field>
                <div className="mt-auto flex gap-2 pt-[0.8rem]">
                  <SoftLink href="/households">
                    <HouseLine size="1.5rem" aria-hidden />
                    Switch or add household
                  </SoftLink>
                  <form action={signOut}>
                    <button className={secondaryActionClass}>
                      <SignOut size="1.5rem" aria-hidden />
                      Sign out
                    </button>
                  </form>
                </div>
              </SettingsCard>

              <SettingsCard title="Calendar">
                <div className="grid grid-cols-2 gap-x-4">
                  <Field label="Week starts on">
                    <Toggle label="Week starts on" value={String(draft.weekStartsOn)} onChange={(v) => set({ weekStartsOn: v === "1" ? 1 : 0 })} options={[{ value: "0", label: "Sunday" }, { value: "1", label: "Monday" }]} />
                  </Field>
                  <Field label="Month shows">
                    <Toggle label="Month shows" value={draft.monthStyle} onChange={(monthStyle) => set({ monthStyle })} options={[{ value: "rolling", label: "Next 5 weeks" }, { value: "calendar", label: "The month" }]} />
                  </Field>
                </div>
                <Field label="Habits show as" className="mt-[0.6rem]">
                  <Toggle label="Habits show as" value={draft.habitsView} onChange={(habitsView) => set({ habitsView })} options={[{ value: "lines", label: "Lines" }, { value: "rings", label: "Rings" }]} />
                </Field>
                <div className="mt-[0.6rem] grid grid-cols-[minmax(0,1fr)_10rem] gap-x-4">
                  <Field label="Planner on">
                    <Toggle label="Planner on" value={String(draft.reviewWeekday)} onChange={(v) => set({ reviewWeekday: Number(v) })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
                  </Field>
                  <Field label="At">
                    <TimeField value={draft.reviewTime} onChange={(t) => set({ reviewTime: t })} step={5} aria-label="Planner time" className={timePickClass} />
                  </Field>
                </div>
                <Field label="Write to-dos, meals and notes in" className="mt-[0.6rem]">
                  <Toggle
                    label="Write to-dos, meals and notes in"
                    value={draft.handwriting ? "hand" : "plain"}
                    onChange={(v) => set({ handwriting: v === "hand" })}
                    options={[{ value: "hand", label: <span className="font-hand text-[1.35rem]">Handwriting</span> }, { value: "plain", label: "Plain letters" }]}
                  />
                </Field>
              </SettingsCard>
            </div>

            <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
              <SettingsCard title="Today panel">
                <div className="flex flex-wrap gap-[0.45rem]">
                  {boxes.map((b) => {
                    const on = draft.panelBoxes.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ panelBoxes: on ? draft.panelBoxes.filter((x) => x !== b.id) : boxes.map((x) => x.id).filter((x) => x === b.id || draft.panelBoxes.includes(x)) })}
                        className={chipClass(on)}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </SettingsCard>

              <SettingsCard title="Sounds and themes">
                <div className="grid grid-cols-2 gap-x-4">
                  <Field label="Sound">
                    <Toggle label="Sound" value={draft.sounds.muted ? "mute" : "on"} onChange={(v) => setSounds({ muted: v === "mute" })} options={[{ value: "mute", label: "Mute" }, { value: "on", label: "On" }]} />
                  </Field>
                  <Field label="Holiday themes">
                    <Toggle label="Holiday themes" value={draft.holidayThemes ? "on" : "off"} onChange={(v) => set({ holidayThemes: v === "on" })} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
                  </Field>
                </div>
                <div className="mt-[0.6rem] grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-x-4">
                  <Field label="Quiet hours">
                    <div className="flex items-center gap-2">
                      <TimeField value={draft.sounds.quietFrom} onChange={(t) => setSounds({ quietFrom: t })} step={5} aria-label="Quiet hours start" className={timePickClass} />
                      <span aria-hidden className="text-[1.25rem] font-bold text-ink-muted">–</span>
                      <TimeField value={draft.sounds.quietTo} onChange={(t) => setSounds({ quietTo: t })} step={5} aria-label="Quiet hours end" className={timePickClass} />
                    </div>
                  </Field>
                  <Field label="Output device">
                    {/* The screen's own speaker is the only place sounds can go for now. */}
                    <div className={`${editorInputClass} flex items-center truncate !text-[1.25rem]`}>Screen speaker</div>
                  </Field>
                </div>
                <div className="mt-auto flex items-center gap-4 pt-[0.6rem]">
                  {/* Holidays and event templates live here, not on the calendar (Connor, 2026-11-16). */}
                  <SoftLink href="/holidays">Holidays and birthdays</SoftLink>
                  <SoftLink href="/templates">Event templates</SoftLink>
                </div>
              </SettingsCard>
            </div>
          </div>
        </div>
      )}

      {guard.leaving ? <LeaveDialog what="some settings" saving={saving} onSave={() => save(guard.leaving)} onStay={guard.stay} onLeave={guard.leaveWithoutSaving} /> : null}
    </>
  );
}

/** The people as colour dots and names (no avatars), a page at a time, then whatever goes under them. */
function PeopleList({
  members,
  selected,
  onSelect,
  page,
  perPage,
  onPage,
  listRef,
  footer,
}: {
  members: MemberDraft[];
  selected: string | null;
  onSelect: (id: string) => void;
  page: number;
  perPage: number;
  onPage: (page: number) => void;
  listRef?: (el: HTMLUListElement | null) => void;
  footer: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(members.length / perPage));
  const p = Math.min(page, pages - 1);
  const shown = members.slice(p * perPage, (p + 1) * perPage);
  return (
    <SettingsCard title="People" aside={<Pager page={p} pages={pages} onPage={onPage} />}>
      <ul ref={listRef} className={`flex flex-col overflow-hidden ${listRef ? "min-h-0 flex-1" : ""}`}>
        {shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              aria-pressed={selected === m.id}
              className={`flex min-h-[3.75rem] w-full items-center gap-[0.7rem] rounded-[var(--radius)] px-[0.7rem] text-left ${selected === m.id ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""} ${m.removed ? "opacity-60" : ""}`}
            >
              <ColourDot colour={m.colour} className="size-6" />
              <span className={`min-w-0 flex-1 truncate text-[1.5rem] font-extrabold text-ink ${m.removed ? "line-through" : ""}`}>{m.name || "New person"}</span>
              <span className="shrink-0 text-[1.15rem] font-bold text-ink-muted">
                {m.removed ? "Goes on Save" : m.role === "parent" ? (m.hasPin || m.pin ? "Parent · PIN set" : "Parent") : "Child"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {footer}
    </SettingsCard>
  );
}

/** One person's details: colour, picture, name, born in, role, and a PIN for parents. */
function PersonFields({ member, onChange }: { member: MemberDraft; onChange: (c: Partial<MemberDraft>) => void }) {
  const who = member.name || "this person";
  return (
    <div className="flex flex-col gap-[0.6rem] pt-[0.8rem]">
      <Field label={`Colour for ${member.name || "them"}`}>
        <div role="radiogroup" aria-label={`Colour for ${who}`} className="flex flex-wrap gap-[0.45rem]">
          {PERSON_COLOURS.map((c) => {
            const on = member.colour === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={c.label}
                title={c.label}
                onClick={() => onChange({ colour: c.value })}
                className="size-12 rounded-full"
                style={{ background: strong(c.value), boxShadow: on ? "0 0 0 0.28rem var(--color-ink), inset 0 0 0 2px #fff" : "inset 0 0 0 2px rgb(255 255 255 / 0.4)" }}
              />
            );
          })}
        </div>
      </Field>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem] gap-x-3">
        <Field label="Picture">
          <EmojiPicker initial={member.icon ?? ""} fieldName="" nameText={member.name} letter fullScreen label={`Picture for ${who}`} onChange={(icon) => onChange({ icon: icon || null })} />
        </Field>
        <Field label="Name">
          <input value={member.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={40} placeholder="Their name" aria-label="Name" className={editorInputClass} autoFocus={!member.name} />
        </Field>
        <Field label="Born in">
          <input
            inputMode="numeric"
            maxLength={4}
            value={member.birthYear ?? ""}
            placeholder="Year"
            aria-label="Born in"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              onChange({ birthYear: digits ? Number(digits) : null });
            }}
            className={`${editorInputClass} !px-3`}
          />
        </Field>
      </div>
      <Field label="Role">
        <Toggle label="Role" value={member.role} onChange={(role) => onChange({ role })} options={[{ value: "parent", label: "Parent" }, { value: "child", label: "Child" }]} />
      </Field>
      {member.role === "parent" ? (
        <div className="grid grid-cols-2 gap-x-4">
          <Field label={member.hasPin ? "New PIN" : "PIN"}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={member.pin}
              placeholder={member.hasPin ? "••••" : "4 to 8 digits"}
              aria-label={member.hasPin ? "New PIN (a PIN is set)" : "PIN, 4 to 8 digits"}
              onChange={(e) => onChange({ pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
              className={editorInputClass}
            />
          </Field>
          <Field label="Type it again">
            <input type="password" inputMode="numeric" autoComplete="off" value={member.pinAgain} aria-label="Type the PIN again" onChange={(e) => onChange({ pinAgain: e.target.value.replace(/\D/g, "").slice(0, 8) })} className={editorInputClass} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** The Settings tabs, in order (Spotify and Weather are live, so they stay beside the four in the mock). */
const SETTINGS_TABS = [
  { tab: "people", label: "People" },
  { tab: "household", label: "Household" },
  { tab: "apps", label: "Apps" },
  { tab: "screen", label: "Screen saver" },
  { tab: "spotify", label: "Spotify" },
  { tab: "weather", label: "Weather" },
] as const;
