"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowDown, ArrowUp, SunHorizon, X } from "@phosphor-icons/react";
import { Emoji, kickerClass } from "@/components/ui";
import { wallTime } from "@/lib/time-text";
import { alertLevel, dayName, degrees, describeWeather, POLLEN_WORDS, pollenTone, worstPollen, type Forecast, type PollenType, type WeatherAlert, type WeatherHour } from "@/lib/weather";

/*
 * The forecast pop-up: tap the weather in a calendar header (Connor,
 * 2026-11-16, look "C" of three). Now, sunrise and sunset and today's
 * pollen on the left; a line of the next 24 hours' temperatures and the
 * next 5 days on the right. Everything fits; nothing scrolls.
 */

const POLLEN_ROWS: { type: PollenType; label: string; emoji: string }[] = [
  { type: "tree", label: "Tree", emoji: "🌳" },
  { type: "grass", label: "Grass", emoji: "🌾" },
  { type: "weed", label: "Weed", emoji: "🌿" },
];

const hourText = (h: WeatherHour, i: number, locale: string) => (i === 0 ? "Now" : wallTime(h.time.slice(11, 16), locale));
const rainText = (chance: number | null) => (chance !== null && chance >= 10 ? `${chance}%` : "");

function Shell({ forecast, onClose, width, tabs, children }: { forecast: Forecast; onClose: () => void; width: string; tabs?: ReactNode; children: ReactNode }) {
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
        style={{ width }}
        className="absolute top-1/2 left-1/2 flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-hidden rounded-[var(--radius-dialog)] bg-board px-[1.65rem] pt-6 pb-[1.4rem] shadow-dialog"
      >
        <div className="flex shrink-0 items-center gap-4">
          <h2 className="min-w-0 flex-1 truncate text-[2.25rem] leading-none font-extrabold tracking-[-0.03em] text-ink">{forecast.place}</h2>
          {tabs}
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink">
            <X size="1.5rem" weight="bold" aria-hidden />
          </button>
        </div>
        {children}
        <p className="shrink-0 text-right text-[1.125rem] text-ink-muted">Weather by Open-Meteo{forecast.alerts?.length ? " · Alerts by Environment Canada" : ""}{forecast.pollen?.length ? " · Pollen by Google" : ""}</p>
      </section>
    </div>
  );
}

/** Sunrise or sunset: a sun on the horizon with an arrow up or down (Phosphor, Connor 2026-11-26). */
function SunMark({ up }: { up: boolean }) {
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span aria-label={up ? "Sunrise" : "Sunset"} className="relative flex size-9 shrink-0 items-center justify-center text-sun-ink">
      <SunHorizon size="2.25rem" weight="duotone" aria-hidden />
      <Arrow size="1rem" weight="bold" aria-hidden className="absolute -top-1 -right-1" />
    </span>
  );
}

function SunTimes({ forecast, row = false }: { forecast: Forecast; row?: boolean }) {
  const today = forecast.days[0];
  if (!today?.sunrise || !today.sunset) return null;
  return (
    <div className={`flex shrink-0 ${row ? "flex-row gap-5" : "flex-col gap-1"} text-[1.25rem] font-semibold text-ink`}>
      <span className="flex items-center gap-2">
        <SunMark up />
        {wallTime(today.sunrise, forecast.locale)}
      </span>
      <span className="flex items-center gap-2">
        <SunMark up={false} />
        {wallTime(today.sunset, forecast.locale)}
      </span>
    </div>
  );
}

/** An alert's words without its boilerplate: drops the "### " markers and the issuing lines, joins the rest. */
function summary(text: string): string {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .filter((l) => l && !/^(issued|en|fr|please continue to monitor|for more information)/i.test(l))
    .join(" ");
}

/**
 * An alert's look, so it can be told from across the room by colour
 * (Connor, 2026-11-26): a statement or advisory is just its weather picture
 * on sky blue (its words stay in the pop-up); a warning is in Environment
 * Canada's own colour (yellow, orange or red; red if it gives none); a watch
 * has its own colour, violet. All soft, light colours (Connor's pick).
 */
type AlertTone = "statement" | "watch" | "yellow" | "orange" | "red";
export function toneOf(a: WeatherAlert): AlertTone {
  const level = a.level ?? alertLevel(a.kind, a.name);
  if (level !== "warning") return level;
  return a.colour === "yellow" || a.colour === "orange" ? a.colour : "red";
}
export const ALERT_PILL: Record<AlertTone, string> = {
  statement: "bg-alert-info text-ink",
  watch: "bg-[color-mix(in_srgb,var(--color-alert-watch)_16%,white)] text-alert-watch",
  yellow: "bg-[color-mix(in_srgb,var(--color-alert-yellow)_35%,white)] text-alert-yellow-ink",
  orange: "bg-[color-mix(in_srgb,var(--color-alert-orange)_28%,white)] text-alert-orange-ink",
  red: "bg-alert-soft text-now-on-tint",
};
/** The pop-up's box: the same soft colour, with a stronger edge. */
const ALERT_BOX: Record<AlertTone, string> = {
  statement: "border-alert-info-edge",
  watch: "border-alert-watch",
  yellow: "border-alert-yellow",
  orange: "border-alert-orange",
  red: "border-danger",
};

/** Government weather alerts, under sunrise and sunset (Connor, 2026-11-26): the worst two, and how many more. */
function Alerts({ forecast }: { forecast: Forecast }) {
  const alerts = forecast.alerts ?? [];
  if (alerts.length === 0) return null;
  const until = (iso: string | null) => {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return `Until ${new Intl.DateTimeFormat(forecast.locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(at)}`;
  };
  return (
    <div className="flex shrink-0 flex-col gap-2">
      {alerts.slice(0, 2).map((a) => (
        <div key={a.name} className={`flex flex-col rounded-[var(--radius)] border-l-[0.5rem] px-3 py-2 ${ALERT_PILL[toneOf(a)]} ${ALERT_BOX[toneOf(a)]}`}>
          <span className="flex min-w-0 flex-col">
            <b className="text-[1.35rem] leading-tight text-ink">{a.name}</b>
            {until(a.until) ? <span className="text-[1.125rem] text-ink-muted">{until(a.until)}</span> : null}
            {/* What it says, in Environment Canada's words (the first lines; the rest is on weather.gc.ca). */}
            {a.text ? <span className={`${alerts.length > 1 ? "line-clamp-2" : "line-clamp-4"} text-[1.125rem] leading-snug text-ink`}>{summary(a.text)}</span> : null}
          </span>
        </div>
      ))}
      {alerts.length > 2 ? <p className="text-[1.125rem] text-ink-muted">and {alerts.length - 2} more</p> : null}
    </div>
  );
}

/** One day: name, picture, high and low, rain or words. */
function DayTile({ forecast, date, size = "md", pollenPill = false }: { forecast: Forecast; date: string; size?: "md" | "lg"; pollenPill?: boolean }) {
  const d = forecast.days.find((x) => x.date === date)!;
  const today = forecast.days[0]?.date ?? "";
  const look = describeWeather(d.code);
  const pollen = worstPollen(forecast.pollen?.find((p) => p.date === date));
  return (
    <div className={`flex flex-col items-center gap-1 rounded-[var(--radius)] px-2 ${size === "lg" ? "py-5" : "py-3"} ${d.date === today ? "bg-panel" : "bg-rail"}`}>
      <span className={`${size === "lg" ? "text-[1.6rem]" : "text-[1.35rem]"} font-bold text-ink`}>{dayName(d.date, today)}</span>
      <Emoji emoji={look.emoji} className={size === "lg" ? "size-20" : "size-14"} />
      <span className={`${size === "lg" ? "text-[2rem]" : "text-[1.5rem]"} leading-none font-extrabold text-ink`}>
        {degrees(d.high)} <span className="font-bold text-ink-muted">{degrees(d.low)}</span>
      </span>
      <span className="text-[1.125rem] font-semibold whitespace-nowrap text-ink-muted">{d.rainChance !== null && d.rainChance >= 10 ? `${d.rainChance}% rain` : look.label}</span>
      {pollenPill && forecast.pollen?.length ? (
        <span className={`mt-1 flex items-center gap-[0.3rem] rounded-full py-[0.1rem] pr-[0.6rem] pl-[0.4rem] text-[1.125rem] font-bold whitespace-nowrap ${pollenTone(pollen)}`}>
          <Emoji emoji="🌿" className="size-[1.3rem]" />
          {pollen === null ? "No pollen" : POLLEN_WORDS[pollen]}
        </span>
      ) : null}
    </div>
  );
}

export function ForecastCard({ forecast, onClose }: { forecast: Forecast; onClose: () => void }) {
  const { now } = forecast;
  const today = forecast.days[0];
  const look = describeWeather(now.code, now.isDay);
  const todayPollen = forecast.pollen?.find((p) => p.date === today?.date);
  return (
    <Shell forecast={forecast} onClose={onClose} width="104rem">
      <div className="grid shrink-0 grid-cols-[27rem_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-rail p-5">
          <div className="flex items-center gap-4">
            <Emoji emoji={look.emoji} className="size-[6rem] shrink-0" />
            <span className="text-[5rem] leading-none font-extrabold tracking-[-0.045em] text-title">{degrees(now.temp)}</span>
          </div>
          <div>
            <p className="text-[1.75rem] leading-tight font-bold text-ink">{look.label}</p>
            <p className="text-[1.25rem] text-ink-muted">Feels like {degrees(now.feelsLike)}</p>
            <p className="text-[1.25rem] text-ink-muted">
              Wind {Math.round(now.wind)} {forecast.windUnit}
            </p>
          </div>
          <SunTimes forecast={forecast} row />
          <Alerts forecast={forecast} />
          {forecast.pollen === null ? (
            <p className="mt-auto border-t border-frame pt-4 text-[1.125rem] text-ink-muted">Pollen shows here once the Google pollen key is added.</p>
          ) : forecast.pollen.length === 0 ? (
            <p className="mt-auto border-t border-frame pt-4 text-[1.125rem] text-ink-muted">The pollen count didn&apos;t load. Almanac will try again soon.</p>
          ) : (
            <div className="mt-auto flex flex-col gap-2 border-t border-frame pt-4">
              <p className={kickerClass}>Pollen today</p>
              {POLLEN_ROWS.map((row) => {
                const level = todayPollen?.levels.find((l) => l.type === row.type);
                const index = level?.index ?? null;
                return (
                  <div key={row.type} className="flex items-center gap-3">
                    <Emoji emoji={row.emoji} className="size-9" />
                    <span className="flex-1 text-[1.35rem] font-bold text-ink">{row.label}</span>
                    <span className={`min-w-[9rem] rounded-full px-3 py-[0.3rem] text-center text-[1.2rem] font-bold ${pollenTone(index)}`}>
                      {level ? (index === null ? (level.inSeason ? "None" : "Off season") : POLLEN_WORDS[index]) : "–"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className={kickerClass}>Next 24 hours</p>
            <TempLine hours={forecast.hours.slice(0, 24)} locale={forecast.locale} />
          </div>
          <div className="flex flex-col gap-2">
            <p className={kickerClass}>5 days</p>
            <div className="grid grid-cols-5 gap-[0.6rem]">
              {forecast.days.map((d) => (
                <DayTile key={d.date} forecast={forecast} date={d.date} pollenPill />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/**
 * The temperature over the next 24 hours as one line, labelled every 3
 * hours with the time, picture and temperature; chance of rain under it.
 */
function TempLine({ hours, locale }: { hours: WeatherHour[]; locale: string }) {
  if (hours.length < 2) return null;
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = Math.max(hi - lo, 4);
  // 0 (top) … 100 (bottom) inside the plot band; keeps a margin for labels.
  const y = (t: number) => 12 + (1 - (t - (lo + hi - span) / 2 - 0) / span) * 76;
  const x = (i: number) => ((i + 0.5) / hours.length) * 100;
  const points = hours.map((h, i) => `${x(i)},${y(h.temp)}`).join(" ");
  const marks = hours.map((h, i) => ({ h, i })).filter(({ i }) => i % 3 === 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-[13rem] rounded-[var(--radius)] bg-rail">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-[4.5rem] h-[7.5rem] w-full" aria-hidden>
          <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {marks.map(({ h, i }) => (
            <circle key={h.time} cx={x(i)} cy={y(h.temp)} r={0.8} fill="var(--color-accent)" stroke="var(--color-rail)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {marks.map(({ h, i }) => (
          <div
            key={h.time}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${x(i)}%`, top: `calc(4.5rem + ${(y(h.temp) / 100) * 7.5}rem - 4.4rem)` }}
          >
            <Emoji emoji={describeWeather(h.code, h.isDay).emoji} className="size-10" />
            <span className="text-[1.35rem] leading-none font-extrabold text-ink">{degrees(h.temp)}</span>
          </div>
        ))}
      </div>
      <div className="relative h-[3.6rem]">
        {marks.map(({ h, i }) => (
          <div key={h.time} className="absolute flex -translate-x-1/2 flex-col items-center leading-tight" style={{ left: `${x(i)}%` }}>
            <span className="text-[1.2rem] font-bold whitespace-nowrap text-ink">{hourText(h, i, locale)}</span>
            <span className="text-[1.125rem] font-bold text-accent">{rainText(h.rainChance)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
