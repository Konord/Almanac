import { createClient } from "@/lib/supabase/server";
import type { Household } from "@/lib/household";
import { nextAfter, repeatLabel, isRepeatEvery } from "@/lib/grocery-repeats";
import { DEFAULT_AISLES, weekStartOf } from "@/lib/meals";
import { localDateOf } from "@/lib/time";
import { addUp, measureText, needText, type NeedPart } from "@/lib/units";

/*
 * Reading the grocery list. It's one list in the List Manager (and a chip
 * on the Today panel), but its lines live in shopping_list, because they
 * have amounts, aisles and the meals they're for.
 */

export type GroceryLine = {
  id: string;
  name: string;
  icon: string | null;
  aisle: string;
  /** "3", "2 heads", "750 ml needed for meals" or "" */
  need: string;
  /** Where it came from: "Every 2 weeks" (a repeat), or the meals' names. */
  detail: string | null;
  source: string;
  /** The meals it's for, when it was added together from more than one. */
  parts: { label: string; text: string }[];
  checked: boolean;
};

const aisleOrder = (a: string) => {
  const i = (DEFAULT_AISLES as readonly string[]).indexOf(a);
  return i < 0 ? 50 : i;
};

function partsOf(raw: unknown): NeedPart[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const x = p as Record<string, unknown>;
    return [{ label: String(x.label ?? ""), amount: typeof x.amount === "number" ? x.amount : null, unit: typeof x.unit === "string" ? x.unit : null }];
  });
}

/** A repeating grocery, as the list's Repeats card shows it. */
export type GroceryRepeat = { id: string; name: string; icon: string | null; label: string; next_on: string };

/** The household's repeating groceries, soonest first. */
export async function loadRepeats(): Promise<GroceryRepeat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("grocery_repeats").select("id, every, every_unit, next_on, items(name, icon)").order("next_on").order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const item = r.items as unknown as { name: string; icon: string | null };
    return { id: r.id, name: item.name, icon: item.icon, label: repeatLabel(r.every, isRepeatEvery(r.every_unit) ? r.every_unit : "week"), next_on: r.next_on };
  });
}

/**
 * Puts repeating groceries that have come due on the list (unless they're
 * on it already, not ticked) and works out when each comes round next.
 * Runs whenever the list is read, so there's nothing to approve.
 */
export async function addDueRepeats(household: Household): Promise<void> {
  const supabase = await createClient();
  const { timeZone, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const { data: due, error } = await supabase.from("grocery_repeats").select("id, item_id, amount, unit, every, every_unit, next_on").lte("next_on", today);
  if (error) throw error;
  if (!due || due.length === 0) return;
  const { data: open, error: openError } = await supabase
    .from("shopping_list")
    .select("item_id")
    .in("item_id", due.map((r) => r.item_id))
    .eq("checked", false)
    .eq("hidden", false);
  if (openError) throw openError;
  const there = new Set((open ?? []).map((l) => l.item_id));
  const add = due.filter((r) => !there.has(r.item_id));
  if (add.length > 0) {
    const { error: addError } = await supabase.from("shopping_list").insert(
      add.map((r) => ({
        household_id: household.id,
        item_id: r.item_id,
        amount: r.amount,
        unit: r.unit,
        source: "repeat",
        detail: repeatLabel(r.every, isRepeatEvery(r.every_unit) ? r.every_unit : "week"),
        week_of: weekStartOf(today, weekStartsOn),
        status: "approved",
      })),
    );
    if (addError) throw addError;
  }
  for (const r of due) {
    const next = nextAfter(r.next_on, r.every, isRepeatEvery(r.every_unit) ? r.every_unit : "week", today);
    // Only moves it on if nobody else has already (two screens reading at once).
    const { error: stepError } = await supabase.from("grocery_repeats").update({ next_on: next }).eq("id", r.id).eq("next_on", r.next_on);
    if (stepError) throw stepError;
  }
}

/** Everything on the list (cleared lines left out), by aisle, ticked ones last. Repeats that are due go on first. */
export async function loadGroceries(household: Household): Promise<GroceryLine[]> {
  await addDueRepeats(household);
  const { measures } = household.settings;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_list")
    .select("id, amount, unit, source, detail, parts, checked, items(name, icon, aisle)")
    .eq("hidden", false)
    .order("created_at");
  if (error) throw error;
  return (data ?? [])
    .map((l) => {
      const item = l.items as unknown as { name: string; icon: string | null; aisle: string };
      const parts = partsOf(l.parts);
      const need = parts.length > 0 ? needText(addUp(parts, measures)) : measureText(l.amount === null ? null : Number(l.amount), l.unit);
      return {
        id: l.id,
        name: item.name,
        icon: item.icon,
        aisle: item.aisle,
        need,
        detail: l.source === "manual" ? null : l.detail,
        source: l.source,
        parts: parts.length > 1 ? parts.map((p) => ({ label: p.label, text: measureText(p.amount, p.unit) })) : [],
        checked: l.checked,
      };
    })
    .toSorted((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle) || a.aisle.localeCompare(b.aisle) || Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
}
