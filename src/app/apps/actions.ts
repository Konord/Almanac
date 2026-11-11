"use server";

import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { afterCheck, CHECK_TIMEOUT_MS, checkDue, upState, type LauncherApp, type LauncherKind } from "@/lib/launcher";

/*
 * The kitchen screen asks for its apps about once a minute. Each time, any
 * web app whose last check is more than 50 seconds old is checked again,
 * here on the Almanac server rather than in the screen's browser: the
 * server is next to the apps, and a browser can't read another site's
 * answer anyway. Any answer at all (even "please sign in") counts as up;
 * only no answer within 4 seconds counts as a failure.
 */

/** True if something answers at this address within the time limit. */
async function answers(address: string): Promise<boolean> {
  try {
    const res = await fetch(address, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

/** The household's apps with their latest up state, checking the ones that are due. */
export async function loadLauncher(): Promise<{ apps: LauncherApp[]; locale: string; timeZone: string } | null> {
  const household = await getHousehold();
  if (!household) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("launcher_apps")
    .select("id, name, icon, colour, kind, address, local_key, check_up, failures, checked_at, down_since")
    .order("sort_order")
    .order("name");
  if (error) throw error;

  const now = new Date();
  const rows = await Promise.all(
    data.map(async (row) => {
      if (row.kind !== "web" || !row.check_up || !row.address || !checkDue(row.checked_at, now)) return row;
      const next = afterCheck({ failures: row.failures, downSince: row.down_since }, await answers(row.address), now);
      const changes = { failures: next.failures, down_since: next.downSince, checked_at: now.toISOString() };
      await supabase.from("launcher_apps").update(changes).eq("id", row.id);
      return { ...row, ...changes };
    }),
  );

  const { locale, timeZone } = household.settings;
  return {
    locale,
    timeZone,
    apps: rows.map((row) => {
      const kind: LauncherKind = row.kind === "local" ? "local" : "web";
      const up = upState({ kind, checkUp: row.check_up, failures: row.failures, checkedAt: row.checked_at });
      return {
        id: row.id,
        name: row.name,
        icon: row.icon,
        colour: row.colour,
        kind,
        address: row.address,
        localKey: row.local_key,
        checkUp: row.check_up,
        up,
        downSince: up === false ? row.down_since : null,
      };
    }),
  };
}
