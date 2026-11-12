import { appsProblem, type AppDraft } from "../../lib/launcher.ts";
import { BOX_ID } from "../../lib/panel-boxes.ts";

/*
 * The Settings screen keeps every change here until its one Save (Connor,
 * 2026-11-07: one Save per screen). People and household settings are
 * saved together.
 */

export type MemberDraft = {
  /** A database id, or "new-…" for someone added on the screen. */
  id: string;
  name: string;
  role: "parent" | "child";
  colour: string;
  icon: string | null;
  birthYear: number | null;
  hasPin: boolean;
  /** A new PIN typed on the screen (blank: leave it as it is), and the same again. */
  pin: string;
  pinAgain: string;
  /** Marked to go when the screen is saved. */
  removed: boolean;
};

export type SettingsDraft = {
  name: string;
  timeZone: string;
  currency: string;
  weekStartsOn: 0 | 1;
  monthStyle: "rolling" | "calendar";
  habitsView: "lines" | "rings";
  units: "metric" | "imperial";
  temperatureUnit: "celsius" | "fahrenheit";
  measures: "canadian" | "us";
  handwriting: boolean;
  reviewWeekday: number;
  reviewTime: string;
  panelBoxes: string[];
  members: MemberDraft[];
  /** The kitchen screen's apps (Apps tab), in tray order. */
  apps: AppDraft[];
};

export const isNewId = (id: string) => id.startsWith("new-");

/** What's wrong with the draft, in words for the screen, or null. (The time zone is checked on the server.) */
export function draftProblem(d: SettingsDraft): string | null {
  if (!d.name.trim()) return "The household needs a name.";
  if (!/^[A-Za-z]{3}$/.test(d.currency.trim())) return "Currency should be a 3-letter code like CAD.";
  if (!(Number.isInteger(d.reviewWeekday) && d.reviewWeekday >= 0 && d.reviewWeekday <= 6) || !/^\d{2}:\d{2}$/.test(d.reviewTime)) {
    return "Pick a day and a time for the Planner.";
  }
  if (!d.panelBoxes.every((v) => BOX_ID.test(v))) return "Something went wrong with the Today panel boxes.";
  for (const m of d.members) {
    if (m.removed) continue;
    if (!m.name.trim()) return "Everyone needs a name.";
    if (m.name.trim().length > 40) return `${m.name.slice(0, 20)}… is too long for a name.`;
    if (m.birthYear !== null && (!Number.isInteger(m.birthYear) || m.birthYear < 1900 || m.birthYear > 2100)) return `${m.name}'s birth year should look like 2018.`;
    if (m.icon && [...m.icon].length > 8) return `${m.name}'s picture should be one emoji.`;
    if (m.pin || m.pinAgain) {
      if (m.role !== "parent") continue;
      if (!/^\d{4,8}$/.test(m.pin)) return `${m.name}'s PIN must be 4 to 8 digits.`;
      if (m.pin !== m.pinAgain) return `${m.name}'s two PINs don't match.`;
    }
  }
  return appsProblem(d.apps);
}
