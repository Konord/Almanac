"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { weekStartOf } from "@/lib/meals";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { findOrCreateItem } from "../meals/shared";
import { isRepeatEvery } from "@/lib/grocery-repeats";
import { loadGroceries, loadRepeats, type GroceryLine, type GroceryRepeat } from "./data";

/*
 * Changing the grocery list. Every tap saves straight away: it's a live
 * list you carry to the store, not an editor with a Save button.
 */

export type GroceriesResult = { ok: true; lines: GroceryLine[] } | { ok: false; error: string };

async function lines(): Promise<GroceriesResult> {
  const household = await requireHousehold();
  try {
    return { ok: true, lines: await loadGroceries(household) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't read the list." };
  }
}

function refresh() {
  revalidatePath("/", "layout");
}

/** The list as it is now. */
export async function readGroceries(): Promise<GroceriesResult> {
  return lines();
}

/** Ticks a line off (got it, or already have it), or back on. */
export async function tickGrocery(id: string, checked: boolean): Promise<GroceriesResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { data: line, error } = await supabase
    .from("shopping_list")
    .update({ checked, checked_at: checked ? new Date().toISOString() : null })
    .eq("id", id)
    .select("backup_part_id, amount")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  // A backup part bought here goes back into its count.
  if (line?.backup_part_id && checked) {
    const { data: part } = await supabase.from("backup_parts").select("on_hand").eq("id", line.backup_part_id).maybeSingle();
    if (part) await supabase.from("backup_parts").update({ on_hand: Number(part.on_hand) + Number(line.amount ?? 1) }).eq("id", line.backup_part_id);
  }
  refresh();
  return lines();
}

/** Adds something by hand ("birthday candles"); it goes straight on the list. */
export async function addGrocery(name: string): Promise<GroceriesResult> {
  const household = await requireHousehold();
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) return { ok: false, error: "What do you need?" };
  const supabase = await createClient();
  const itemId = await findOrCreateItem(supabase, household.id, clean);
  // Already on the list and not ticked: don't add it twice.
  const { data: there } = await supabase.from("shopping_list").select("id").eq("item_id", itemId).eq("checked", false).eq("hidden", false).limit(1);
  if (!there || there.length === 0) {
    const { error } = await supabase.from("shopping_list").insert({
      household_id: household.id,
      item_id: itemId,
      source: "manual",
      week_of: weekStartOf(localDateOf(new Date(), household.settings.timeZone), household.settings.weekStartsOn),
      status: "approved",
    });
    if (error) return { ok: false, error: error.message };
  }
  refresh();
  return lines();
}

/**
 * Clears the ticked lines off the list. Lines from the week's menu are
 * kept out of sight (so saving the review again doesn't bring them back);
 * the rest go.
 */
export async function clearTickedGroceries(): Promise<GroceriesResult> {
  await requireHousehold();
  const supabase = await createClient();
  const hide = await supabase.from("shopping_list").update({ hidden: true }).eq("checked", true).eq("source", "meal");
  if (hide.error) return { ok: false, error: hide.error.message };
  const gone = await supabase.from("shopping_list").delete().eq("checked", true).neq("source", "meal");
  if (gone.error) return { ok: false, error: gone.error.message };
  refresh();
  return lines();
}

// ---------------------------------------------------------------------------
// Repeating groceries: milk every week, coffee every 3 weeks
// ---------------------------------------------------------------------------

export type RepeatsResult = { ok: true; repeats: GroceryRepeat[]; lines: GroceryLine[] } | { ok: false; error: string };

async function repeatsAndLines(): Promise<RepeatsResult> {
  const household = await requireHousehold();
  try {
    // The list first: reading it moves on any repeats that have just gone on it.
    const lines = await loadGroceries(household);
    const repeats = await loadRepeats();
    return { ok: true, repeats, lines };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't read the repeats." };
  }
}

/** The repeating groceries (and the list, which may have just had some added). */
export async function readRepeats(): Promise<RepeatsResult> {
  return repeatsAndLines();
}

/**
 * Makes something repeat ("Milk", every 1 week). It goes on the list now
 * if it isn't there, then again each time it comes round. Already
 * repeating: its timing changes.
 */
export async function addRepeat(input: { name: string; every: number; unit: string }): Promise<RepeatsResult> {
  const household = await requireHousehold();
  const clean = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) return { ok: false, error: "What do you buy?" };
  if (!Number.isInteger(input.every) || input.every < 1 || input.every > 365) return { ok: false, error: "Pick how often." };
  if (!isRepeatEvery(input.unit)) return { ok: false, error: "Pick days, weeks or months." };
  const supabase = await createClient();
  const itemId = await findOrCreateItem(supabase, household.id, clean);
  const today = localDateOf(new Date(), household.settings.timeZone);
  const { error } = await supabase
    .from("grocery_repeats")
    .upsert({ household_id: household.id, item_id: itemId, every: input.every, every_unit: input.unit, next_on: today }, { onConflict: "household_id,item_id" });
  if (error) return { ok: false, error: error.message };
  refresh();
  return repeatsAndLines();
}

/** Stops something repeating (what's on the list stays). */
export async function removeRepeat(id: string): Promise<RepeatsResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("grocery_repeats").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return repeatsAndLines();
}
