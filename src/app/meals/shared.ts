import { createClient } from "@/lib/supabase/server";
import { guessAisle, weekDates, weekdayOf } from "@/lib/meals";
import { addDays, zonedToUtc, localDateOf, type LocalDate } from "@/lib/time";

/*
 * Server-side helpers shared by the Meals actions and pages. (Not actions
 * themselves, so a browser can't call them directly.)
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The grocery item with this name, made (with a guessed aisle) if it's new. */
export async function findOrCreateItem(supabase: Supabase, householdId: string, rawName: string): Promise<string> {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 60);
  const { data: found, error } = await supabase.from("items").select("id, name").ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (error) throw error;
  if (found && found.length > 0) return found[0].id;
  const { data, error: insertError } = await supabase
    .from("items")
    .insert({ household_id: householdId, name, aisle: guessAisle(name) })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id;
}

/**
 * Places the week's presets ("Tuesday dinner is Tacos") the first time a
 * week is opened. Days already past are left alone, and a week is only
 * filled once, so a preset meal you removed doesn't come back.
 */
export async function ensurePresets(householdId: string, weekStart: LocalDate, today: LocalDate): Promise<void> {
  if (addDays(weekStart, 6) < today) return;
  const supabase = await createClient();
  const { data: claimed, error } = await supabase
    .from("meal_weeks")
    .upsert({ household_id: householdId, week_start: weekStart }, { onConflict: "household_id,week_start", ignoreDuplicates: true })
    .select("week_start");
  if (error) throw error;
  if (!claimed || claimed.length === 0) return; // filled before
  await applyPresets(supabase, householdId, weekDates(weekStart).filter((d) => d >= today));
}

/** Adds preset meals to these dates where that meal time doesn't already have that category. */
export async function applyPresets(supabase: Supabase, householdId: string, dates: LocalDate[]): Promise<void> {
  if (dates.length === 0) return;
  const [presets, existing, links] = await Promise.all([
    supabase.from("meal_presets").select("weekday, meal_time_id, category_id"),
    supabase.from("meals").select("date, meal_time_id, category_id").gte("date", dates[0]).lte("date", dates[dates.length - 1]),
    supabase.from("recipe_categories").select("recipe_id, category_id"),
  ]);
  for (const r of [presets, existing, links]) if (r.error) throw r.error;
  const have = new Set((existing.data ?? []).map((m) => `${m.date}|${m.meal_time_id}|${m.category_id}`));
  const variantsOf = new Map<string, string[]>();
  for (const l of links.data ?? []) variantsOf.set(l.category_id, [...(variantsOf.get(l.category_id) ?? []), l.recipe_id]);
  const rows = dates.flatMap((date) =>
    (presets.data ?? [])
      .filter((p) => p.weekday === weekdayOf(date) && !have.has(`${date}|${p.meal_time_id}|${p.category_id}`))
      .map((p) => {
        const variants = variantsOf.get(p.category_id) ?? [];
        return {
          household_id: householdId,
          date,
          meal_time_id: p.meal_time_id,
          category_id: p.category_id,
          // A category with one variant needs no choosing.
          recipe_id: variants.length === 1 ? variants[0] : null,
          from_preset: true,
        };
      }),
  );
  if (rows.length === 0) return;
  const { error } = await supabase.from("meals").insert(rows);
  if (error) throw error;
}

/** Future weeks that already had their presets placed (so a new preset can join them). */
export async function seededDatesFrom(supabase: Supabase, today: LocalDate): Promise<LocalDate[]> {
  const { data, error } = await supabase.from("meal_weeks").select("week_start").gte("week_start", addDays(today, -6));
  if (error) throw error;
  return (data ?? []).flatMap((w) => weekDates(w.week_start)).filter((d) => d >= today).sort();
}

/**
 * Heads-ups ("Thaw the beef the night before") become to-dos on the first
 * list, due on the right day, and are made again whenever the meal changes.
 */
export async function syncHeadsUps(householdId: string, mealId: string, timeZone: string): Promise<void> {
  const supabase = await createClient();
  const { data: meal, error } = await supabase
    .from("meals")
    .select("id, date, status, recipe_id, meal_times(usual_time), recipes(name, icon)")
    .eq("id", mealId)
    .maybeSingle();
  if (error) throw error;
  // Clear the old ones that aren't done yet.
  await supabase.from("task_instances").delete().eq("meal_id", mealId).eq("must_do", false).eq("status", "open");
  if (!meal || meal.status !== "planned" || !meal.recipe_id) return;

  const today = localDateOf(new Date(), timeZone);
  const { data: helpers, error: helperError } = await supabase
    .from("step_helpers")
    .select("minutes, label, recipe_steps!inner(recipe_id)")
    .eq("kind", "heads_up")
    .eq("recipe_steps.recipe_id", meal.recipe_id);
  if (helperError) throw helperError;
  if (!helpers || helpers.length === 0) return;

  const { data: list } = await supabase.from("task_lists").select("id").order("sort_order").limit(1).maybeSingle();
  if (!list) return;

  const usual = (meal.meal_times as unknown as { usual_time: string } | null)?.usual_time?.slice(0, 5) ?? "18:00";
  const recipe = meal.recipes as unknown as { name: string; icon: string | null } | null;
  const eatAt = zonedToUtc(meal.date, usual, timeZone);
  const rows = helpers
    .map((h) => {
      const due = new Date(eatAt.getTime() - (h.minutes ?? 0) * 60_000);
      const dueDate = localDateOf(due, timeZone);
      const time = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", minute: "2-digit" }).format(due).replace(":00", "");
      return {
        household_id: householdId,
        list_id: list.id,
        meal_id: mealId,
        title: `${h.label ?? "Get ready"} by ${time} (${recipe?.name ?? "dinner"})`.slice(0, 120),
        icon: recipe?.icon ?? "🍽️",
        due_date: dueDate,
      };
    })
    .filter((r) => r.due_date >= today);
  if (rows.length > 0) await supabase.from("task_instances").insert(rows);
}

/** The next date after this one (within two weeks) with nothing planned at that meal time. */
export async function nextFreeDate(supabase: Supabase, after: LocalDate, mealTimeId: string): Promise<LocalDate> {
  const { data } = await supabase
    .from("meals")
    .select("date")
    .eq("meal_time_id", mealTimeId)
    .in("status", ["planned", "cooked"])
    .gt("date", after)
    .lte("date", addDays(after, 14));
  const taken = new Set((data ?? []).map((m) => m.date));
  for (let i = 1; i <= 14; i++) {
    const d = addDays(after, i);
    if (!taken.has(d)) return d;
  }
  return addDays(after, 1);
}
