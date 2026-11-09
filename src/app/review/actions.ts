"use server";

import { revalidatePath } from "next/cache";
import { dayFor } from "@/lib/day-types";
import { requireHousehold } from "@/lib/household";
import { weekDates } from "@/lib/meals";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, localDateOf } from "@/lib/time";
import { movesFor, type ReviewDraft } from "@/lib/weekly-review";
import { loadChoreDays } from "../chores/data";
import { syncHeadsUps } from "../meals/shared";
import { loadRoutines } from "../routines/data";

export type SaveReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Confirm week: saves every change on the review in one go and marks the
 * week as reviewed (so the reminder stops). Days already over are left as
 * they were.
 *
 *   - Chore days: the week's moves are replaced by the ones the draft needs.
 *   - Kinds of day: the review's own one-day breaks are replaced; a day
 *     where someone's kind of day differs from their usual one gets a
 *     one-day break that switches it.
 *   - Meals: swapped to another theme, or taken off.
 */
export async function saveReview(week: string, draft: ReviewDraft): Promise<SaveReviewResult> {
  const household = await requireHousehold();
  if (!isLocalDate(week)) return { ok: false, error: "That week isn't right." };
  const today = localDateOf(new Date(), household.settings.timeZone);
  const dates = weekDates(week).filter((d) => d >= today);
  const supabase = await createClient();
  const fail = (error: { message: string } | null) => (error ? ({ ok: false, error: error.message } as const) : null);

  if (dates.length > 0) {
    // 1. Chore days.
    const choreDays = await loadChoreDays();
    const moves = movesFor(choreDays, draft, dates);
    const bad =
      fail((await supabase.from("chore_day_moves").delete().in("date", dates)).error) ??
      (moves.length > 0 ? fail((await supabase.from("chore_day_moves").insert(moves.map((m) => ({ ...m, household_id: household.id })))).error) : null);
    if (bad) return bad;

    // 2. Kinds of day, compared with each person's usual day (without the review's own breaks).
    const routines = await loadRoutines(dates[0]);
    const own = routines.breaks.filter((b) => b.from_review && b.start_date === b.end_date && dates.includes(b.start_date));
    if (own.length > 0) {
      const gone = fail((await supabase.from("breaks").delete().in("id", own.map((b) => b.id))).error);
      if (gone) return gone;
    }
    const usual = { ...routines, breaks: routines.breaks.filter((b) => !own.includes(b)) };
    const typeById = new Map(routines.dayTypes.map((t) => [t.id, t]));
    for (const date of dates) {
      const switched = routines.members.flatMap((m) => {
        const want = draft.dayTypes[date]?.[m.id];
        const type = want ? typeById.get(want) : undefined;
        if (!type || type.member_id !== m.id || dayFor(m, usual, date).dayType?.id === type.id) return [];
        return [{ member_id: m.id, type }];
      });
      if (switched.length === 0) continue;
      const names = new Set(switched.map((s) => s.type.name.trim().toLowerCase()));
      const first = switched[0].type;
      const { data, error } = await supabase
        .from("breaks")
        .insert({
          household_id: household.id,
          name: names.size === 1 ? first.name : "Switched days",
          icon: names.size === 1 ? first.icon : "🔀",
          start_date: date,
          end_date: date,
          from_review: true,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      const people = switched.map((s) => ({ household_id: household.id, break_id: data.id, member_id: s.member_id, day_type_id: s.type.id, week_plan_id: null }));
      const bad2 = fail((await supabase.from("break_members").insert(people)).error);
      if (bad2) return bad2;
    }

    // 3. Meals.
    const changed = Object.entries(draft.meals);
    if (changed.length > 0) {
      const [mealRows, links] = await Promise.all([
        supabase.from("meals").select("id, date").in("id", changed.map(([id]) => id)),
        supabase.from("recipe_categories").select("recipe_id, category_id"),
      ]);
      for (const r of [mealRows, links]) if (r.error) return { ok: false, error: r.error.message };
      const dateOf = new Map((mealRows.data ?? []).map((m) => [m.id, m.date]));
      for (const [id, categoryId] of changed) {
        const date = dateOf.get(id);
        if (!date || date < today) continue;
        if (categoryId === null) {
          const bad3 = fail((await supabase.from("meals").delete().eq("id", id)).error);
          if (bad3) return bad3;
          continue;
        }
        // A theme with one variant needs no choosing.
        const variants = (links.data ?? []).filter((l) => l.category_id === categoryId).map((l) => l.recipe_id);
        const bad3 = fail(
          (await supabase.from("meals").update({ category_id: categoryId, recipe_id: variants.length === 1 ? variants[0] : null, from_preset: false }).eq("id", id)).error,
        );
        if (bad3) return bad3;
        await syncHeadsUps(household.id, id, household.settings.timeZone);
      }
    }
  }

  // 4. The week is reviewed.
  const done = fail(
    (await supabase.from("weekly_reviews").upsert({ household_id: household.id, week_start: week, reviewed_at: new Date().toISOString(), dismissed: draft.dismissed.slice(0, 100) }, { onConflict: "household_id,week_start" })).error,
  );
  if (done) return done;
  await supabase.from("activity_log").insert({
    household_id: household.id,
    action: "week_reviewed",
    target_type: "household",
    target_id: household.id,
    details: { week },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
