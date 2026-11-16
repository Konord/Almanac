import { cookies } from "next/headers";
import { DAILY_OPEN_COOKIE } from "@/lib/panel-boxes";

export const PANEL_TAB_COOKIE = "almanac-panel-tab";

/** What this screen last chose: panel open (the default) and which tab (the daily list, until one is picked). */
export async function readPanelPrefs(): Promise<{
  open: boolean;
  tab: string;
}> {
  const store = await cookies();
  return {
    // Set in the browser by the Daily List drawer (drawer.tsx), so opening it needs no trip to the server.
    open: store.get(DAILY_OPEN_COOKIE)?.value !== "0",
    tab: store.get(PANEL_TAB_COOKIE)?.value ?? "today",
  };
}
