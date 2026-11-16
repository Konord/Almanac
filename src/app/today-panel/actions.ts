"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { BOX_ID } from "@/lib/panel-boxes";
import { PANEL_TAB_COOKIE } from "./prefs";

/**
 * The Today panel remembers which list it showed last, per screen (per
 * browser, in a cookie). Whether the Daily List is open is kept by the
 * drawer itself (drawer.tsx). A wall screen
 * and a phone each keep their own.
 */

const YEAR = 60 * 60 * 24 * 400;

/** Only our own calendar and Today pages, never another website. */
function back(formData: FormData): never {
  const value = String(formData.get("returnTo") ?? "");
  redirect(/^\/(calendar)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/calendar");
}

/** Shows "Up next", the daily list ("today") or one list in the working part of the panel. */
export async function pickPanelTab(formData: FormData) {
  await requireHousehold();
  const tab = String(formData.get("tab") ?? "");
  const store = await cookies();
  if (BOX_ID.test(tab)) {
    store.set(PANEL_TAB_COOKIE, tab, {
      path: "/",
      maxAge: YEAR,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  back(formData);
}
