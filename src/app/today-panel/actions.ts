"use server";

import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/household";
import { BOX_ID } from "@/lib/panel-boxes";
import { boxedHref } from "@/lib/panel-boxes";

/**
 * Which box the Today panel shows is in the page's address (?box=), not
 * remembered: arriving on a calendar page always shows the Daily List
 * (Connor, 2026-11-26), and flipping to another box only lasts while you
 * stay on that page.
 */

/** Only our own calendar and Today pages, never another website. */
function safe(value: string): string {
  return /^\/(calendar)?(\?[\w=&%.:-]*)?$/.test(value) ? value : "/calendar";
}

/** Shows "Up next", the daily list ("today") or one list in the working part of the panel. */
export async function pickPanelTab(formData: FormData) {
  await requireHousehold();
  const tab = String(formData.get("tab") ?? "");
  const back = safe(String(formData.get("returnTo") ?? ""));
  redirect(BOX_ID.test(tab) ? boxedHref(back, tab) : back);
}
