"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { PANEL_OPEN_COOKIE, PANEL_TAB_COOKIE } from "./prefs";

/**
 * The Today panel remembers two things per screen (per browser, in a
 * cookie): whether it's open, and which list it showed last. A wall screen
 * and a phone each keep their own.
 */

const YEAR = 60 * 60 * 24 * 400;

/** Only our own calendar and Today pages, never another website. */
function back(formData: FormData): never {
  const value = String(formData.get("returnTo") ?? "");
  redirect(/^\/(calendar)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/calendar");
}

/** Opens or closes the panel. */
export async function setPanelOpen(formData: FormData) {
  await requireHousehold();
  const store = await cookies();
  store.set(PANEL_OPEN_COOKIE, formData.get("open") === "1" ? "1" : "0", {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: true,
  });
  back(formData);
}

/** Shows "Up next" or one list in the working part of the panel. */
export async function pickPanelTab(formData: FormData) {
  await requireHousehold();
  const tab = String(formData.get("tab") ?? "");
  const store = await cookies();
  if (/^(upnext|[0-9a-f-]{36})$/.test(tab)) {
    store.set(PANEL_TAB_COOKIE, tab, {
      path: "/",
      maxAge: YEAR,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  back(formData);
}
