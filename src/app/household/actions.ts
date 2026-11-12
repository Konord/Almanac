"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_SETTINGS, isTimeZone, requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { isLocalTime } from "@/lib/time";
import { isPersonColour } from "@/lib/colours";
import { panelBoxes } from "@/lib/panel-boxes";
import { cleanAddress } from "@/lib/launcher";
import { parseScreenSaver } from "@/lib/screen-saver";
import { draftProblem, isNewId, type SettingsDraft } from "./draft";

/*
 * The Settings screen's one Save: the household's settings and everyone
 * in it, together. It re-checks who is signed in (requireHousehold)
 * instead of trusting the screen, and the database's security rules check
 * again on top. Each change is written to the activity log.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function saveHousehold(draft: SettingsDraft): Promise<Result> {
  const household = await requireHousehold();
  const problem = draftProblem(draft);
  if (problem) return { ok: false, error: problem };
  const timeZone = draft.timeZone.trim();
  if (!isTimeZone(timeZone)) return { ok: false, error: `"${timeZone}" isn't a time zone.` };
  if (!isLocalTime(draft.reviewTime)) return { ok: false, error: "Pick a time for the Planner." };
  if (draft.members.some((m) => !m.removed && (!isPersonColour(m.colour) || (m.role !== "parent" && m.role !== "child")))) {
    return { ok: false, error: "Everyone needs a colour and a role." };
  }

  const supabase = await createClient();
  // Keep "the usual boxes" (null) unless the picks really changed, so a new list still shows up by itself.
  const { data: lists } = await supabase.from("task_lists").select("id, name, is_chores").order("sort_order").order("name");
  const before = panelBoxes(household.settings.panelBoxes, lists ?? [], false).map((b) => b.id);
  const boxesChanged = before.join() !== draft.panelBoxes.join();
  const logs: { action: string; target_type: string; target_id: string; details: Record<string, string> }[] = [];

  const settings = {
    ...DEFAULT_SETTINGS,
    ...household.settings,
    timeZone,
    currency: draft.currency.trim().toUpperCase(),
    weekStartsOn: draft.weekStartsOn === 1 ? 1 : 0,
    monthStyle: draft.monthStyle === "calendar" ? "calendar" : "rolling",
    habitsView: draft.habitsView === "rings" ? "rings" : "lines",
    units: draft.units === "imperial" ? "imperial" : "metric",
    temperatureUnit: draft.temperatureUnit === "fahrenheit" ? "fahrenheit" : "celsius",
    measures: draft.measures === "us" ? "us" : "canadian",
    handwriting: Boolean(draft.handwriting),
    weeklyReview: { weekday: draft.reviewWeekday, time: draft.reviewTime },
    panelBoxes: boxesChanged ? draft.panelBoxes : household.settings.panelBoxes,
    screenSaver: parseScreenSaver(draft.screenSaver),
  };
  const name = draft.name.trim().slice(0, 80);
  if (name !== household.name || JSON.stringify(settings) !== JSON.stringify({ ...DEFAULT_SETTINGS, ...household.settings })) {
    const { error } = await supabase.from("households").update({ name, settings }).eq("id", household.id);
    if (error) return { ok: false, error: error.message };
    logs.push({ action: "settings_updated", target_type: "household", target_id: household.id, details: {} });
  }

  for (const m of draft.members) {
    if (m.removed) {
      if (isNewId(m.id)) continue;
      const { error } = await supabase.from("members").delete().eq("id", m.id);
      if (error) return { ok: false, error: error.message };
      logs.push({ action: "member_removed", target_type: "member", target_id: m.id, details: { name: m.name } });
      continue;
    }
    const row = { name: m.name.trim(), role: m.role, colour: m.colour, icon: m.icon || null, birth_year: m.birthYear };
    let id = m.id;
    if (isNewId(m.id)) {
      const { data, error } = await supabase
        .from("members")
        .insert({ ...row, household_id: household.id })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
      logs.push({ action: "member_added", target_type: "member", target_id: id, details: { name: row.name } });
    } else {
      const { error } = await supabase.from("members").update(row).eq("id", id);
      if (error) return { ok: false, error: error.message };
    }
    if (m.role === "parent" && m.pin) {
      const { error } = await supabase.rpc("set_member_pin", { member_id: id, pin: m.pin });
      if (error) return { ok: false, error: error.message };
      logs.push({ action: "member_pin_set", target_type: "member", target_id: id, details: {} });
    }
  }

  // The kitchen screen's apps, in tray order. A new address starts its up checks afresh.
  const { data: oldApps } = await supabase.from("launcher_apps").select("id, kind, address");
  const before2 = new Map((oldApps ?? []).map((a) => [a.id, a]));
  let order = 0;
  for (const a of draft.apps) {
    if (a.removed) {
      if (isNewId(a.id)) continue;
      const { error } = await supabase.from("launcher_apps").delete().eq("id", a.id);
      if (error) return { ok: false, error: error.message };
      logs.push({ action: "app_removed", target_type: "launcher_app", target_id: a.id, details: { name: a.name } });
      continue;
    }
    const web = a.kind === "web";
    const row = {
      name: a.name.trim(),
      icon: a.icon || null,
      colour: isPersonColour(a.colour) ? a.colour : "slate",
      kind: web ? "web" : "local",
      address: web ? cleanAddress(a.address) : null,
      local_key: web ? null : a.localKey,
      check_up: web && a.checkUp,
      sort_order: order++,
    };
    if (isNewId(a.id)) {
      const { data, error } = await supabase
        .from("launcher_apps")
        .insert({ ...row, household_id: household.id })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      logs.push({ action: "app_added", target_type: "launcher_app", target_id: data.id, details: { name: row.name } });
    } else {
      const old = before2.get(a.id);
      const moved = !old || old.kind !== row.kind || old.address !== row.address;
      const fresh = moved ? { failures: 0, checked_at: null, down_since: null } : {};
      const { error } = await supabase.from("launcher_apps").update({ ...row, ...fresh }).eq("id", a.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  if (logs.length) await supabase.from("activity_log").insert(logs.map((l) => ({ ...l, household_id: household.id })));
  revalidatePath("/", "layout");
  return { ok: true };
}
