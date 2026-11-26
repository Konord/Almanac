"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Emoji } from "@/components/ui";
import { ALERT_ICON, ALERT_PILL, ForecastCard, levelOf, toneOf } from "./forecast-card";
import { degrees, describeWeather, type Forecast, type WeatherAnswer } from "@/lib/weather";

/*
 * The weather in the calendar screens' header (2026-11-16): a picture and
 * the temperature, nothing else (Connor: no pollen on the calendar). Tap
 * it for the forecast and the pollen.
 *
 * Every screen's header shares one answer, asked from /api/weather every
 * 15 minutes while the screen is showing. Before a place is picked in
 * Settings › Weather (or if the weather can't be had) the place stays
 * empty, so nothing moves when it arrives.
 */

const ASK_EVERY = 15 * 60_000;

// One shared answer for every header on the page.
let shared: { forecast: Forecast | null; at: number } = { forecast: null, at: 0 };
let asking: Promise<void> | null = null;
const listeners = new Set<() => void>();

function ask(): Promise<void> {
  asking ??= (async () => {
    try {
      const res = await fetch("/api/weather", { cache: "no-store" });
      const answer = (await res.json()) as WeatherAnswer;
      // A failed ask keeps what's showing; a missing place clears it.
      if ("forecast" in answer) shared = { forecast: answer.forecast, at: Date.now() };
      else if (answer.error === "no-place") shared = { forecast: null, at: Date.now() };
      else shared = { ...shared, at: Date.now() - ASK_EVERY + 60_000 }; // try again in a minute
    } catch {
      shared = { ...shared, at: Date.now() - ASK_EVERY + 60_000 };
    }
    asking = null;
    listeners.forEach((l) => l());
  })();
  return asking;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useForecast(): Forecast | null {
  const value = useSyncExternalStore(
    subscribe,
    () => shared.forecast,
    () => null,
  );
  useEffect(() => {
    const askIfOld = () => {
      if (!document.hidden && Date.now() - shared.at >= ASK_EVERY) void ask();
    };
    askIfOld();
    const timer = setInterval(askIfOld, 60_000);
    document.addEventListener("visibilitychange", askIfOld);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", askIfOld);
    };
  }, []);
  return value;
}

/** The header's weather: picture, temperature, and pollen (or today's high and low). */
export function WeatherSlot() {
  const forecast = useForecast();
  const [open, setOpen] = useState(false);

  if (!forecast) return <div data-weather-slot aria-hidden className="hidden w-[10rem] shrink-0 lg:block" />;

  const { now } = forecast;
  const look = describeWeather(now.code, now.isDay);

  // A government weather alert goes to the left of the weather, coloured by
  // how serious it is, with its weather as a picture (Connor, 2026-11-26). Tap it for the forecast.
  const alert = forecast.alerts?.[0];
  return (
    <>
      {alert ? (
        toneOf(alert) === "statement" ? (
          // A statement or advisory: just the picture; what it says is in the pop-up.
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`${alert.name}: ${alert.short}`}
            className={`relative hidden size-13 shrink-0 items-center justify-center rounded-full lg:flex ${ALERT_PILL.statement}`}
          >
            <AlertSign alert={alert} size="3rem" />
            {forecast.alerts.length > 1 ? (
              <span className="absolute -top-1 -right-1 rounded-full bg-board px-1.5 text-[1.125rem] font-bold leading-tight text-ink shadow-raised">+{forecast.alerts.length - 1}</span>
            ) : null}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`hidden min-h-13 max-w-[26rem] min-w-0 shrink items-center gap-[0.5rem] rounded-full px-5 text-[1.5rem] font-bold lg:flex ${ALERT_PILL[toneOf(alert)]}`}
          >
            <AlertSign alert={alert} size="2.2rem" />
            <span className="truncate">{alert.short ?? alert.name}</span>
            {forecast.alerts.length > 1 ? <span className="shrink-0">+{forecast.alerts.length - 1}</span> : null}
          </button>
        )
      ) : null}
      <button
        type="button"
        data-weather-slot
        onClick={() => setOpen(true)}
        aria-label={`${look.label}, ${degrees(now.temp)}. Show the forecast`}
        className="hidden h-[5.5rem] min-w-[10rem] shrink-0 items-center gap-[0.6rem] rounded-[var(--radius)] px-[0.4rem] lg:flex"
      >
        <Emoji emoji={look.emoji} className="size-[4.75rem] shrink-0" />
        <span className="text-[3.5rem] leading-none font-extrabold tracking-[-0.03em] text-title">{degrees(now.temp)}</span>
      </button>
      {open ? <ForecastCard forecast={forecast} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The level's Phosphor sign: circle, diamond or triangle. */
function AlertSign({ alert, size }: { alert: Forecast["alerts"][number]; size: string }) {
  const Sign = ALERT_ICON[levelOf(alert)];
  return <Sign size={size} weight="fill" aria-hidden className="shrink-0" />;
}
