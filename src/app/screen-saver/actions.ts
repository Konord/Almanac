"use server";

import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { artSrc, listArt, pictureSize } from "@/lib/art-folder";
import { isHolidayRule } from "@/lib/holidays";
import { dayFor } from "@/lib/day-types";
import { blocksOn } from "@/lib/meal-blocks";
import { artChoices, dinnerBlocks, pickPainting, slotFor, toMinutes, type MealWindow, type ScreenSaverSettings } from "@/lib/screen-saver";
import { localDateOf, localTimeOf } from "@/lib/time";
import { loadRoutines } from "../routines/data";

/*
 * What the screen saver needs, asked for by the kitchen screen every few
 * minutes: the settings, today's meal times it comes on for, and the
 * painting for now. The painting is picked once per "slot" (a day, half a
 * day, two hours, or each start) and saved, so every screen shows the same
 * one and it doesn't change on a reload.
 */

export type Painting = { src: string; width: number; height: number };

export type SaverPlan = {
  settings: ScreenSaverSettings;
  timeZone: string;
  meals: MealWindow[];
  painting: Painting | null;
};

/** Null when nobody is signed in (the sign-in page has no screen saver). */
export async function screenSaverPlan(startedAt: string | null): Promise<SaverPlan | null> {
  const household = await getHousehold();
  if (!household) return null;
  const { timeZone } = household.settings;
  const settings = household.settings.screenSaver;
  const now = new Date();
  const today = localDateOf(now, timeZone);
  const minute = toMinutes(localTimeOf(now, timeZone));

  const [meals, painting] = await Promise.all([
    mealWindows(today, settings.duringMeals).catch(() => []),
    paintingFor(household.id, today, slotFor(settings.every, today, minute, settings.every === "start" ? startedAt : null), settings.seasonal),
  ]);
  return { settings, timeZone, meals, painting };
}

/** When today's chosen meals are eaten: a planned meal's own time, or the block's usual time if someone has it today. */
async function mealWindows(today: string, during: string[] | null): Promise<MealWindow[]> {
  const supabase = await createClient();
  const { data: times, error } = await supabase.from("meal_times").select("id, name, usual_time, minutes");
  if (error) throw error;
  const ids = during ?? dinnerBlocks(times);
  const chosen = times.filter((t) => ids.includes(t.id));
  if (chosen.length === 0) return [];
  const [planned, uses] = await Promise.all([
    supabase.from("meals").select("meal_time_id, eat_at, status").eq("date", today).in("meal_time_id", chosen.map((t) => t.id)),
    supabase.from("meal_time_uses").select("meal_time_id, member_id, day_type_id").in("meal_time_id", chosen.map((t) => t.id)),
  ]);
  if (planned.error) throw planned.error;
  if (uses.error) throw uses.error;
  const routines = await loadRoutines(today);
  const kinds = Object.fromEntries(routines.members.map((m) => [m.id, dayFor(m, routines, today).dayType?.id ?? null]));
  const on = blocksOn(uses.data, kinds);

  const out: MealWindow[] = [];
  for (const t of chosen) {
    const mine = planned.data.filter((m) => m.meal_time_id === t.id && m.status !== "skipped" && m.status !== "swapped");
    const starts = mine.length ? mine.map((m) => (m.eat_at ?? t.usual_time).slice(0, 5)) : on.has(t.id) ? [t.usual_time.slice(0, 5)] : [];
    for (const s of new Set(starts)) out.push({ start: toMinutes(s), end: Math.min(24 * 60, toMinutes(s) + t.minutes) });
  }
  return out;
}

/** The painting for a slot: the one already picked, or a new pick saved for every screen. */
async function paintingFor(householdId: string, today: string, slot: string, seasonal: ScreenSaverSettings["seasonal"]): Promise<Painting | null> {
  const art = await listArt();
  if (art.folders.length === 0) return null;
  const all = new Set(art.folders.flatMap((f) => f.files));
  const supabase = await createClient();

  const { data: picked } = await supabase.from("art_shown").select("file").eq("slot", slot).maybeSingle();
  let file = picked && all.has(picked.file) ? picked.file : null;

  if (!file) {
    const [h, b, shown] = await Promise.all([
      supabase.from("holidays").select("id, name, rule, art_only_days, art_mix_days"),
      supabase.from("birthdays").select("id, name, month, day"),
      supabase.from("art_shown").select("file, shown_at").order("shown_at", { ascending: false }).limit(5000),
    ]);
    const holidays = (h.data ?? []).flatMap((row) => (isHolidayRule(row.rule) ? [{ ...row, rule: row.rule }] : []));
    const lastShown = new Map<string, string>();
    for (const row of shown.data ?? []) if (!lastShown.has(row.file)) lastShown.set(row.file, row.shown_at);
    const pick = pickPainting(artChoices(today, art.folders, holidays, b.data ?? [], seasonal), lastShown);
    if (!pick) return null;
    file = pick.file;
    // A picture that has gone from the folder is picked again in place of the old one.
    if (picked) await supabase.from("art_shown").delete().eq("slot", slot);
    const { error } = await supabase.from("art_shown").insert({ household_id: householdId, slot, file });
    if (error) {
      // Another screen picked at the same moment: show theirs.
      const { data: theirs } = await supabase.from("art_shown").select("file").eq("slot", slot).maybeSingle();
      if (theirs && all.has(theirs.file)) file = theirs.file;
    }
  }

  const size = await pictureSize(file);
  if (!size) return null;
  return { src: artSrc(file), ...size };
}
