"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { isHolidayRule, type Birthday, type Holiday } from "@/lib/holidays";

/** Everything on the Holidays and birthdays screen, saved with its one Save. */
export type HolidayDraft = { holidays: Holiday[]; birthdays: Birthday[] };

/** Ids made on the screen start with this until they're saved. */
const NEW = "new-";

/** What's wrong with the screen's changes, if anything. */
export async function draftProblem(draft: HolidayDraft): Promise<string | null> {
  for (const h of draft.holidays) {
    if (!h.name.trim()) return "Every holiday needs a name.";
    if (h.name.trim().length > 40) return `${h.name} is too long a name.`;
    if (!isHolidayRule(h.rule)) return `Check the date for ${h.name}.`;
  }
  for (const b of draft.birthdays) {
    if (!b.name.trim()) return "Every birthday needs a name.";
    if (b.name.trim().length > 40) return `${b.name} is too long a name.`;
    if (!(b.month >= 1 && b.month <= 12 && b.day >= 1 && b.day <= 31)) return `Check ${b.name}'s birthday.`;
    if (b.birth_year !== null && !(Number.isInteger(b.birth_year) && b.birth_year >= 1900 && b.birth_year <= 2100)) return `Check the year ${b.name} was born.`;
  }
  return null;
}

export async function saveHolidays(draft: HolidayDraft): Promise<{ ok: true } | { ok: false; error: string }> {
  const household = await requireHousehold();
  const problem = await draftProblem(draft);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const [hNow, bNow] = await Promise.all([supabase.from("holidays").select("id"), supabase.from("birthdays").select("id")]);
  if (hNow.error || bNow.error) return { ok: false, error: (hNow.error ?? bNow.error)!.message };

  // Take away the ones removed on the screen.
  const keepH = new Set(draft.holidays.map((h) => h.id));
  const goneH = hNow.data.filter((r) => !keepH.has(r.id)).map((r) => r.id);
  if (goneH.length) {
    const { error } = await supabase.from("holidays").delete().in("id", goneH);
    if (error) return { ok: false, error: error.message };
  }
  const keepB = new Set(draft.birthdays.map((b) => b.id));
  const goneB = bNow.data.filter((r) => !keepB.has(r.id)).map((r) => r.id);
  if (goneB.length) {
    const { error } = await supabase.from("birthdays").delete().in("id", goneB);
    if (error) return { ok: false, error: error.message };
  }

  // Add the new ones and save the rest.
  for (const [i, h] of draft.holidays.entries()) {
    const row = { name: h.name.trim(), icon: h.icon || null, rule: h.rule, public_key: h.public_key, sort_order: i };
    const { error } = h.id.startsWith(NEW)
      ? await supabase.from("holidays").insert({ ...row, household_id: household.id })
      : await supabase.from("holidays").update(row).eq("id", h.id);
    if (error) return { ok: false, error: error.code === "23505" ? `${h.name} is on the list twice.` : error.message };
  }
  for (const b of draft.birthdays) {
    const row = { name: b.name.trim(), icon: b.icon || null, month: b.month, day: b.day, birth_year: b.birth_year };
    const { error } = b.id.startsWith(NEW)
      ? await supabase.from("birthdays").insert({ ...row, household_id: household.id })
      : await supabase.from("birthdays").update(row).eq("id", b.id);
    if (error) return { ok: false, error: error.message };
  }

  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "holidays_saved",
    target_type: "holidays",
    target_id: household.id,
    details: { holidays: draft.holidays.length, birthdays: draft.birthdays.length },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
