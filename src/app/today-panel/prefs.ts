import { cookies } from "next/headers";
import { DAILY_OPEN_COOKIE } from "@/lib/panel-boxes";

/** Whether this screen last had the Daily List pulled out on Week and Month. */
export async function readPanelPrefs(): Promise<{ open: boolean }> {
  const store = await cookies();
  // Set in the browser by the Daily List drawer (drawer.tsx), so opening it needs no trip to the server.
  return { open: store.get(DAILY_OPEN_COOKIE)?.value !== "0" };
}
