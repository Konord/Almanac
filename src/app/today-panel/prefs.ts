import { cookies } from "next/headers";

export const PANEL_OPEN_COOKIE = "almanac-panel-open";
export const PANEL_TAB_COOKIE = "almanac-panel-tab";

/** What this screen last chose: panel open (the default) and which tab (the daily list, until one is picked). */
export async function readPanelPrefs(): Promise<{
  open: boolean;
  tab: string;
}> {
  const store = await cookies();
  return {
    open: store.get(PANEL_OPEN_COOKIE)?.value !== "0",
    tab: store.get(PANEL_TAB_COOKIE)?.value ?? "today",
  };
}
