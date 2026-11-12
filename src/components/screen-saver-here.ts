"use client";

import { useSyncExternalStore } from "react";

/*
 * Whether this screen uses the art screen saver. It's kept in this
 * browser, not the household's settings, because it's about this one
 * screen: on for the kitchen screen, off for the iPad and phones. Until
 * it's set, it's on wherever the launcher helper runs (the kitchen PC).
 */

const KEY = "almanac-screen-saver-here";
const EVENT = "almanac-screen-saver-here";

export type Here = "on" | "off" | null;

function read(): Here {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function setScreenSaverHere(value: "on" | "off") {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Private browsing: it just won't be remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useScreenSaverHere(): Here {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener(EVENT, l);
      window.addEventListener("storage", l);
      return () => {
        window.removeEventListener(EVENT, l);
        window.removeEventListener("storage", l);
      };
    },
    read,
    () => null,
  );
}
