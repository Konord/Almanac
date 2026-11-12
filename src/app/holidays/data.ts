import { createClient } from "@/lib/supabase/server";
import { isHolidayRule, specialDays, type Birthday, type Holiday, type SpecialDay } from "@/lib/holidays";
import type { LocalDate } from "@/lib/time";

/** The household's holidays and birthdays. */
export async function loadHolidays(): Promise<{ holidays: Holiday[]; birthdays: Birthday[] }> {
  const supabase = await createClient();
  const [h, b] = await Promise.all([
    supabase.from("holidays").select("id, name, icon, rule, public_key, art_only_days, art_mix_days").order("sort_order").order("name"),
    supabase.from("birthdays").select("id, name, icon, month, day, birth_year").order("month").order("day"),
  ]);
  if (h.error) throw h.error;
  if (b.error) throw b.error;
  return {
    // A rule that doesn't read right is left out rather than breaking the calendar.
    holidays: h.data.flatMap((row) => (isHolidayRule(row.rule) ? [{ ...row, rule: row.rule }] : [])),
    birthdays: b.data,
  };
}

/** Holidays and birthdays from one date to another, by date. */
export async function loadSpecialDays(from: LocalDate, to: LocalDate): Promise<Map<LocalDate, SpecialDay[]>> {
  const { holidays, birthdays } = await loadHolidays();
  const byDate = new Map<LocalDate, SpecialDay[]>();
  for (const s of specialDays(holidays, birthdays, from, to)) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  return byDate;
}
