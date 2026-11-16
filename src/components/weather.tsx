"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "@phosphor-icons/react";
import { Emoji, kickerClass } from "@/components/ui";
import { wallTime } from "@/lib/time-text";
import {
  dayName,
  degrees,
  describeWeather,
  POLLEN_WORDS,
  pollenTone,
  type Forecast,
  type PollenType,
  type WeatherAnswer,
} from "@/lib/weather";

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

  if (!forecast) return <div data-weather-slot aria-hidden className="hidden w-[7.5rem] shrink-0 lg:block" />;

  const { now } = forecast;
  const look = describeWeather(now.code, now.isDay);

  return (
    <>
      <button
        type="button"
        data-weather-slot
        onClick={() => setOpen(true)}
        aria-label={`${look.label}, ${degrees(now.temp)}. Show the forecast`}
        className="hidden h-[var(--touch-target)] min-w-[7.5rem] shrink-0 items-center gap-[0.45rem] rounded-[var(--radius)] px-[0.4rem] lg:flex"
      >
        <Emoji emoji={look.emoji} className="size-[3.25rem] shrink-0" />
        <span className="text-[2.5rem] leading-none font-extrabold tracking-[-0.03em] text-title">{degrees(now.temp)}</span>
      </button>
      {open ? <ForecastCard forecast={forecast} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const POLLEN_ROWS: { type: PollenType; label: string; emoji: string }[] = [
  { type: "tree", label: "Tree", emoji: "🌳" },
  { type: "grass", label: "Grass", emoji: "🌾" },
  { type: "weed", label: "Weed", emoji: "🌿" },
];

/** Tap the weather: now, the next 5 days, and their pollen. Everything fits; nothing scrolls. */
function ForecastCard({ forecast, onClose }: { forecast: Forecast; onClose: () => void }) {
  const { now, days, pollen } = forecast;
  const today = days[0];
  const look = describeWeather(now.code, now.isDay);
  const todayPollen = pollen?.find((p) => p.date === today?.date);
  const cols = { gridTemplateColumns: `9.5rem repeat(${days.length}, minmax(0, 1fr))` };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgb(35_38_43/0.18)]" />
      <section
        role="dialog"
        aria-label={`Weather for ${forecast.place}`}
        className="absolute top-[8.5rem] right-2 flex max-h-[calc(100dvh-9.5rem)] w-[62rem] max-w-[calc(100vw-1rem)] flex-col gap-5 overflow-hidden rounded-[var(--radius-dialog)] bg-board px-[1.65rem] pt-6 pb-[1.4rem] shadow-dialog lg:right-12"
      >
        <div className="flex shrink-0 items-center justify-between gap-4">
          <h2 className="min-w-0 truncate text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">{forecast.place}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink">
            <X size="1.5rem" weight="bold" aria-hidden />
          </button>
        </div>

        {/* Now */}
        <div className="flex shrink-0 items-center gap-5">
          <Emoji emoji={look.emoji} className="size-[6.5rem] shrink-0" />
          <span className="text-[5rem] leading-none font-extrabold tracking-[-0.045em] text-title">{degrees(now.temp)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-[1.75rem] leading-tight font-bold text-ink">{look.label}</p>
            <p className="text-[1.25rem] text-ink-muted">
              Feels like {degrees(now.feelsLike)} · Wind {Math.round(now.wind)} {forecast.windUnit}
            </p>
          </div>
          {today?.sunrise && today.sunset ? (
            <div className="flex shrink-0 flex-col gap-1 text-[1.25rem] font-semibold text-ink">
              <span className="flex items-center gap-2">
                <Emoji emoji="🌅" className="size-8" />
                {wallTime(today.sunrise, forecast.locale)}
              </span>
              <span className="flex items-center gap-2">
                <Emoji emoji="🌇" className="size-8" />
                {wallTime(today.sunset, forecast.locale)}
              </span>
            </div>
          ) : null}
        </div>

        {/* The next 5 days, with pollen lined up under each */}
        <div className="grid shrink-0 gap-x-[0.6rem] gap-y-[0.5rem]" style={cols}>
          <span />
          {days.map((d) => {
            const day = describeWeather(d.code);
            return (
              <div key={d.date} className={`flex flex-col items-center gap-1 rounded-[var(--radius)] px-2 py-3 ${d.date === today?.date ? "bg-panel" : "bg-rail"}`}>
                <span className="text-[1.35rem] font-bold text-ink">{dayName(d.date, today?.date ?? "")}</span>
                <Emoji emoji={day.emoji} className="size-14" />
                <span className="text-[1.5rem] leading-none font-extrabold text-ink">
                  {degrees(d.high)} <span className="font-bold text-ink-muted">{degrees(d.low)}</span>
                </span>
                <span className="text-[1.125rem] font-semibold text-ink-muted">{d.rainChance !== null && d.rainChance >= 10 ? `${d.rainChance}% rain` : day.label}</span>
              </div>
            );
          })}

          {pollen && pollen.length > 0 ? (
            <>
              <p className={`${kickerClass} col-span-full mt-2 flex items-baseline justify-between gap-4`}>
                <span>Pollen</span>
                {todayPollen && todayPollen.plants.length > 0 ? (
                  <span className="truncate font-semibold tracking-normal normal-case">Today: {todayPollen.plants.slice(0, 3).join(", ")}</span>
                ) : null}
              </p>
              {POLLEN_ROWS.map((row) => (
                <PollenRow key={row.type} row={row} forecast={forecast} />
              ))}
            </>
          ) : null}
        </div>

        {pollen === null ? (
          <p className="shrink-0 text-[1.125rem] text-ink-muted">Pollen shows here once the Google pollen key is added (see docs/weather.md).</p>
        ) : pollen.length === 0 ? (
          <p className="shrink-0 text-[1.125rem] text-ink-muted">The pollen count didn&apos;t load. Almanac will try again soon.</p>
        ) : null}
        <p className="shrink-0 text-right text-[1.125rem] text-ink-muted">Weather by Open-Meteo{pollen && pollen.length ? " · Pollen by Google" : ""}</p>
      </section>
    </div>
  );
}

function PollenRow({ row, forecast }: { row: (typeof POLLEN_ROWS)[number]; forecast: Forecast }) {
  return (
    <>
      <span className="flex items-center gap-2 text-[1.35rem] font-bold text-ink">
        <Emoji emoji={row.emoji} className="size-9" />
        {row.label}
      </span>
      {forecast.days.map((d) => {
        const level = forecast.pollen?.find((p) => p.date === d.date)?.levels.find((l) => l.type === row.type);
        const index = level?.index ?? null;
        return (
          <span key={d.date} className={`flex min-h-[2.75rem] items-center justify-center rounded-full px-2 text-[1.2rem] font-bold whitespace-nowrap ${pollenTone(index)}`}>
            {level ? (index === null ? (level.inSeason ? "None" : "Off season") : POLLEN_WORDS[index]) : "–"}
          </span>
        );
      })}
    </>
  );
}
