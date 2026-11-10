import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AISLES } from "@/lib/meals";
import { addUp, measureText, needText, type Measures, type NeedPart } from "@/lib/units";

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
  /** Where it came from: "Every week", "Added" (by hand) or the meals' names. */
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

/** Everything on the list (cleared lines left out), by aisle, ticked ones last. */
export async function loadGroceries(measures: Measures): Promise<GroceryLine[]> {
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
