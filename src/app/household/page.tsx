import { Suspense } from "react";
import { AppFrame, LoadingOutline } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { allBoxes, panelBoxes } from "@/lib/panel-boxes";
import { createClient } from "@/lib/supabase/server";
import type { SettingsDraft } from "./draft";
import { SettingsEditor } from "./editor";

/**
 * Settings: the people in the household and the household's settings.
 * One Save for the whole screen; nothing scrolls (2026-11-10).
 */
export default function HouseholdPage() {
  return (
    <AppFrame section="settings">
      <Suspense fallback={<LoadingOutline />}>
        <HouseholdContent />
      </Suspense>
    </AppFrame>
  );
}

async function HouseholdContent() {
  const household = await requireHousehold();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("members")
    .select("id, name, role, colour, icon, birth_year")
    .order("role", { ascending: false }) // parents first
    .order("sort_order")
    .order("name");
  if (error) throw error;
  const pins = await Promise.all(rows.map((row) => supabase.rpc("member_has_pin", { member_id: row.id })));

  // The activity log is still kept, but no history shows for now (Connor, 2026-11-10).
  const { data: lists } = await supabase.from("task_lists").select("id, name, is_chores").order("sort_order").order("name");
  const { settings } = household;

  const initial: SettingsDraft = {
    name: household.name,
    timeZone: settings.timeZone,
    currency: settings.currency,
    weekStartsOn: settings.weekStartsOn,
    monthStyle: settings.monthStyle,
    units: settings.units,
    temperatureUnit: settings.temperatureUnit,
    measures: settings.measures,
    handwriting: settings.handwriting,
    reviewWeekday: settings.weeklyReview.weekday,
    reviewTime: settings.weeklyReview.time,
    panelBoxes: panelBoxes(settings.panelBoxes, lists ?? [], false).map((b) => b.id),
    members: rows.map((row, i) => ({
      id: row.id,
      name: row.name,
      role: row.role === "child" ? "child" : "parent",
      colour: row.colour,
      icon: row.icon,
      birthYear: row.birth_year,
      hasPin: Boolean(pins[i].data),
      pin: "",
      pinAgain: "",
      removed: false,
    })),
  };

  return <SettingsEditor key={JSON.stringify(initial)} initial={initial} boxes={allBoxes(lists ?? [])} />;
}
