"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { DEFAULT_AISLES, weekStartOf } from "@/lib/meals";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, localDateOf } from "@/lib/time";
import { buildSuggestions } from "../meals/groceries-build";
import { findOrCreateItem } from "../meals/shared";

/*
 * The grocery list, opened from the weekly review's header. The list is
 * live: every tick saves straight away (it isn't part of the review's
 * Save). Ticked means it's on the shopping list; unticked suggestions
 * (the week's meal ingredients, weekly buys, low backup parts) wait for
 * someone to tick them, as everything Almanac suggests does.
 */

export type GroceryLine = {
  id: string;
  name: string;
  icon: string | null;
  aisle: string;
  amount: number | null;
  unit: string | null;
  /** Where it came from: "Beef tacos", "Every week", "Restock Lasagne". */
  detail: string | null;
  onList: boolean;
};

export type GroceryResult = { ok: true; lines: GroceryLine[] } | { ok: false; error: string };

const aisleOrder = (a: string) => {
  const i = (DEFAULT_AISLES as readonly string[]).indexOf(a);
  return i < 0 ? 50 : i;
};

/** What's on the list (not yet bought) plus this week's suggestions, by aisle. */
async function linesFor(week: string): Promise<GroceryResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_list")
    .select("id, amount, unit, detail, status, checked, week_of, items(name, icon, aisle)")
    .eq("checked", false)
    .order("created_at");
  if (error) return { ok: false, error: error.message };
  const lines = (data ?? [])
    .filter((l) => l.status === "approved" || l.week_of === week)
    .map((l) => {
      const item = l.items as unknown as { name: string; icon: string | null; aisle: string };
      return {
        id: l.id,
        name: item.name,
        icon: item.icon,
        aisle: item.aisle,
        amount: l.amount === null ? null : Number(l.amount),
        unit: l.unit,
        detail: l.detail,
        onList: l.status === "approved",
      };
    })
    .toSorted((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle) || a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
  return { ok: true, lines };
}

function refresh() {
  revalidatePath("/meals", "layout");
  revalidatePath("/");
}

/** Opens the list: suggestions are made afresh from the week's saved meals first. */
export async function openGroceries(week: string): Promise<GroceryResult> {
  const household = await requireHousehold();
  if (!isLocalDate(week)) return { ok: false, error: "That week isn't right." };
  try {
    await buildSuggestions(household, week);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't make the suggestions." };
  }
  return linesFor(week);
}

/** Ticks a line onto the list, or takes it off (a suggestion goes back to waiting; one added by hand goes). */
export async function setOnList(week: string, id: string, on: boolean): Promise<GroceryResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { data: line, error } = await supabase.from("shopping_list").select("id, item_id, source").eq("id", id).single();
  if (error) return { ok: false, error: error.message };
  const change =
    !on && line.source === "manual"
      ? await supabase.from("shopping_list").delete().eq("id", id)
      : await supabase.from("shopping_list").update({ status: on ? "approved" : "suggested", week_of: week }).eq("id", id);
  if (change.error) return { ok: false, error: change.error.message };
  // A weekly buy that went on the list remembers the week.
  if (on && line.source === "weekly" && isLocalDate(week)) await supabase.from("weekly_buys").update({ last_week: week }).eq("item_id", line.item_id);
  refresh();
  return linesFor(week);
}

/** Ticks every suggestion onto the list. */
export async function putAllOnList(week: string): Promise<GroceryResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { data, error } = await supabase.from("shopping_list").select("id, item_id, source").eq("status", "suggested").eq("week_of", week);
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((l) => l.id);
  if (ids.length) {
    const { error: e2 } = await supabase.from("shopping_list").update({ status: "approved" }).in("id", ids);
    if (e2) return { ok: false, error: e2.message };
    const weekly = (data ?? []).filter((l) => l.source === "weekly").map((l) => l.item_id);
    if (weekly.length && isLocalDate(week)) await supabase.from("weekly_buys").update({ last_week: week }).in("item_id", weekly);
  }
  refresh();
  return linesFor(week);
}

/** Adds something by hand: you're adding it yourself, so it goes straight on the list. */
export async function addToList(week: string, input: { name: string; amount: string; unit: string }): Promise<GroceryResult> {
  const household = await requireHousehold();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "What do you need?" };
  const amount = Number(input.amount);
  const supabase = await createClient();
  const itemId = await findOrCreateItem(supabase, household.id, name);
  const { error } = await supabase.from("shopping_list").insert({
    household_id: household.id,
    item_id: itemId,
    amount: input.amount.trim() && Number.isFinite(amount) && amount > 0 && amount <= 100000 ? Math.round(amount * 1000) / 1000 : null,
    unit: input.unit.trim().slice(0, 20) || null,
    source: "manual",
    week_of: isLocalDate(week) ? week : weekStartOf(localDateOf(new Date(), household.settings.timeZone), household.settings.weekStartsOn),
    status: "approved",
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return linesFor(week);
}
