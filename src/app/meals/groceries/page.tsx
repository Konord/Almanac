import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

/**
 * The grocery list moved to the List Manager (Connor, 2026-11-10): it's a
 * list of its own there, managed like the others. Old links land on it.
 */
export default function GroceriesPage() {
  return (
    <AppFrame section="lists">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Forward />
      </Suspense>
    </AppFrame>
  );
}

async function Forward(): Promise<never> {
  await requireHousehold();
  const supabase = await createClient();
  const { data } = await supabase.from("task_lists").select("id").eq("is_groceries", true).maybeSingle();
  redirect(data ? `/lists?list=${data.id}` : "/lists");
}
