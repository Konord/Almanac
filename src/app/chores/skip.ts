import { createClient } from "@/lib/supabase/server";
import { addDays, type LocalDate } from "@/lib/time";

/**
 * Skips a chore for now. A preset chore is skipped this chore day (it comes
 * back next time). A generated one leaves today's list and waits until
 * tomorrow, then finds another day; its due date doesn't move.
 */
export async function skipChoreNow(templateId: string, today: LocalDate) {
  const supabase = await createClient();
  const { data: chore, error } = await supabase.from("task_templates").select("kind").eq("id", templateId).maybeSingle();
  if (error) throw error;
  if (chore?.kind === "preset") {
    const { error: skipError } = await supabase
      .from("task_instances")
      .update({
        status: "skipped",
        completed_on: today,
        completed_at: new Date().toISOString(),
      })
      .eq("template_id", templateId)
      .eq("status", "open");
    if (skipError) throw skipError;
    return;
  }
  const { error: waitError } = await supabase
    .from("task_templates")
    .update({ not_before: addDays(today, 1) })
    .eq("id", templateId);
  if (waitError) throw waitError;
  const { error: deleteError } = await supabase.from("task_instances").delete().eq("template_id", templateId).eq("status", "open");
  if (deleteError) throw deleteError;
}
