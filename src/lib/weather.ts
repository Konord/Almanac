/*
 * Weather and pollen (2026-11-16, thread "Add weather and pollen count").
 *
 * Two outside services, both asked from the server, never the browser:
 *
 *   - Open-Meteo (open-meteo.com) for the weather: free for home use, no
 *     account and no key. Asked at most every 15 minutes.
 *   - Google's Pollen API for pollen (tree, grass and weed, 5 days). It
 *     needs a key (GOOGLE_POLLEN_API_KEY in .env.local) and is free up to
 *     5,000 asks a month; Almanac asks at most every 3 hours (~250 a
 *     month). Open-Meteo has pollen too, but only for Europe.
 *
 * Where the weather is for is a household setting (Settings › Weather),
 * found by name with Open-Meteo's free place search.
 *
 * This file holds the shapes and the pure helpers (tested in
 * weather.test.ts); src/lib/weather-server.ts does the asking.
 */

/** Where the weather is for (households.settings.weather). */
export type WeatherPlace = { name: string; latitude: number; longitude: number };

export type WeatherNow = {
  temp: number;
  feelsLike: number;
  /** The WMO weather code Open-Meteo uses (0 = clear … 99 = thunder with hail). */
  code: number;
  isDay: boolean;
  /** km/h, or mph for imperial households. */
  wind: number;
};

export type WeatherDay = {
  /** YYYY-MM-DD in the household's time zone. */
  date: string;
  code: number;
  high: number;
  low: number;
  /** Chance of rain or snow, 0–100, or null if not given. */
  rainChance: number | null;
  /** Local times like "07:12". */
  sunrise: string;
  sunset: string;
};

export type PollenType = "tree" | "grass" | "weed";

/**
 * Google's Universal Pollen Index, 0–5: None, Very low, Low, Moderate,
 * High, Very high. Null when Google says nothing for that day (out of
 * season and nothing in the air).
 */
export type PollenLevel = { type: PollenType; index: number | null; inSeason: boolean };

export type PollenDay = {
  date: string;
  levels: PollenLevel[];
  /** The plants with pollen in the air that day, worst first, like "Ragweed". */
  plants: string[];
};

export type Forecast = {
  place: string;
  /** The household's locale, for times like "7:03 am". */
  locale: string;
  unit: "C" | "F";
  windUnit: "km/h" | "mph";
  now: WeatherNow;
  /** Today first, 5 days. */
  days: WeatherDay[];
  /** Null when there's no pollen key; [] when Google didn't answer. */
  pollen: PollenDay[] | null;
};

/** What /api/weather answers. */
export type WeatherAnswer = { forecast: Forecast } | { error: "signed-out" | "no-place" | "weather" };

export const WEATHER_DAYS = 5;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Reads the weather place from settings JSON, or null if it's missing or wrong. */
export function parseWeatherPlace(raw: unknown): WeatherPlace | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const { name, latitude, longitude } = r;
  if (typeof name !== "string" || !name.trim() || name.length > 120) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { name: name.trim(), latitude, longitude };
}

// ---------------------------------------------------------------------------
// Open-Meteo: the forecast
// ---------------------------------------------------------------------------

export const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_PLACES = "https://geocoding-api.open-meteo.com/v1/search";

/** The address that asks Open-Meteo for now + 5 days. */
export function forecastUrl(place: WeatherPlace, timeZone: string, imperial: boolean, fahrenheit: boolean): string {
  const params = new URLSearchParams({
    latitude: place.latitude.toFixed(4),
    longitude: place.longitude.toFixed(4),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: timeZone,
    forecast_days: String(WEATHER_DAYS),
    temperature_unit: fahrenheit ? "fahrenheit" : "celsius",
    wind_speed_unit: imperial ? "mph" : "kmh",
  });
  return `${OPEN_METEO}?${params.toString()}`;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "2026-11-16T07:12" → "07:12". */
function clockOf(v: unknown): string {
  return typeof v === "string" && /T\d{2}:\d{2}/.test(v) ? v.slice(v.indexOf("T") + 1, v.indexOf("T") + 6) : "";
}

/** Open-Meteo's answer → now + days, or null if it doesn't look right. */
export function parseOpenMeteo(raw: unknown): { now: WeatherNow; days: WeatherDay[] } | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> };
  const c = r.current;
  const d = r.daily;
  if (!c || !d || !Array.isArray(d.time)) return null;
  const temp = num(c.temperature_2m);
  const code = num(c.weather_code);
  if (temp === null || code === null) return null;
  const now: WeatherNow = {
    temp,
    feelsLike: num(c.apparent_temperature) ?? temp,
    code,
    isDay: c.is_day !== 0,
    wind: num(c.wind_speed_10m) ?? 0,
  };
  const days: WeatherDay[] = [];
  d.time.forEach((date, i) => {
    const high = num(d.temperature_2m_max?.[i]);
    const low = num(d.temperature_2m_min?.[i]);
    const dayCode = num(d.weather_code?.[i]);
    if (typeof date !== "string" || high === null || low === null || dayCode === null) return;
    days.push({
      date,
      code: dayCode,
      high,
      low,
      rainChance: num(d.precipitation_probability_max?.[i]),
      sunrise: clockOf(d.sunrise?.[i]),
      sunset: clockOf(d.sunset?.[i]),
    });
  });
  if (days.length === 0) return null;
  return { now, days: days.slice(0, WEATHER_DAYS) };
}

/** A place found by name, for Settings › Weather. */
export type PlaceMatch = WeatherPlace & { detail: string };

/** Open-Meteo's place search answer → up to 5 places. */
export function parsePlaces(raw: unknown): PlaceMatch[] {
  if (raw === null || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const out: PlaceMatch[] = [];
  for (const item of results) {
    if (item === null || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const place = parseWeatherPlace({ name: p.name, latitude: p.latitude, longitude: p.longitude });
    if (!place) continue;
    const detail = [p.admin1, p.country].filter((x): x is string => typeof x === "string" && x.length > 0).join(", ");
    out.push({ ...place, detail });
    if (out.length === 5) break;
  }
  return out;
}

/**
 * A WMO weather code → a picture and a few words. Night swaps the sun
 * for the moon on clear and partly cloudy skies.
 */
export function describeWeather(code: number, isDay = true): { emoji: string; label: string } {
  if (code === 0) return { emoji: isDay ? "☀️" : "🌙", label: "Clear" };
  if (code === 1) return { emoji: isDay ? "🌤️" : "🌙", label: "Mostly clear" };
  if (code === 2) return { emoji: isDay ? "⛅" : "☁️", label: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "Cloudy" };
  if (code === 45 || code === 48) return { emoji: "🌫️", label: "Fog" };
  if (code >= 51 && code <= 55) return { emoji: "🌧️", label: "Drizzle" };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { emoji: "🌧️", label: "Freezing rain" };
  if (code >= 61 && code <= 65) return { emoji: "🌧️", label: code === 65 ? "Heavy rain" : "Rain" };
  if (code >= 71 && code <= 77) return { emoji: "🌨️", label: code === 75 ? "Heavy snow" : "Snow" };
  if (code >= 80 && code <= 82) return { emoji: "🌦️", label: "Showers" };
  if (code === 85 || code === 86) return { emoji: "🌨️", label: "Snow showers" };
  if (code >= 95) return { emoji: "⛈️", label: "Thunderstorms" };
  return { emoji: "☁️", label: "Cloudy" };
}

// ---------------------------------------------------------------------------
// Google: pollen
// ---------------------------------------------------------------------------

export const GOOGLE_POLLEN = "https://pollen.googleapis.com/v1/forecast:lookup";

/** The address that asks Google for 5 days of pollen (the key goes in a header, not here). */
export function pollenUrl(place: WeatherPlace): string {
  const params = new URLSearchParams({
    "location.latitude": place.latitude.toFixed(4),
    "location.longitude": place.longitude.toFixed(4),
    days: String(WEATHER_DAYS),
    languageCode: "en",
    plantsDescription: "false",
  });
  return `${GOOGLE_POLLEN}?${params.toString()}`;
}

const TYPES: Record<string, PollenType> = { TREE: "tree", GRASS: "grass", WEED: "weed" };
const TYPE_ORDER: PollenType[] = ["tree", "grass", "weed"];

function indexOf(info: unknown): number | null {
  if (info === null || typeof info !== "object") return null;
  const value = num((info as { value?: unknown }).value);
  return value === null ? null : Math.max(0, Math.min(5, Math.round(value)));
}

const pad = (n: unknown) => String(typeof n === "number" ? n : 0).padStart(2, "0");

/** Google's pollen answer → one entry per day, tree / grass / weed in that order. */
export function parsePollen(raw: unknown): PollenDay[] {
  if (raw === null || typeof raw !== "object") return [];
  const daily = (raw as { dailyInfo?: unknown }).dailyInfo;
  if (!Array.isArray(daily)) return [];
  const out: PollenDay[] = [];
  for (const day of daily) {
    if (day === null || typeof day !== "object") continue;
    const d = day as { date?: { year?: number; month?: number; day?: number }; pollenTypeInfo?: unknown; plantInfo?: unknown };
    if (!d.date || typeof d.date.year !== "number") continue;
    const date = `${d.date.year}-${pad(d.date.month)}-${pad(d.date.day)}`;
    const found = new Map<PollenType, PollenLevel>();
    if (Array.isArray(d.pollenTypeInfo)) {
      for (const t of d.pollenTypeInfo as Record<string, unknown>[]) {
        const type = typeof t?.code === "string" ? TYPES[t.code] : undefined;
        if (!type) continue;
        found.set(type, { type, index: indexOf(t.indexInfo), inSeason: t.inSeason === true });
      }
    }
    const plants: { name: string; index: number }[] = [];
    if (Array.isArray(d.plantInfo)) {
      for (const p of d.plantInfo as Record<string, unknown>[]) {
        const index = indexOf(p?.indexInfo);
        if (index === null || index < 1 || typeof p.displayName !== "string") continue;
        plants.push({ name: p.displayName, index });
      }
    }
    plants.sort((a, b) => b.index - a.index);
    out.push({
      date,
      levels: TYPE_ORDER.map((type) => found.get(type) ?? { type, index: null, inSeason: false }),
      plants: plants.map((p) => p.name),
    });
    if (out.length === WEATHER_DAYS) break;
  }
  return out;
}

export const POLLEN_WORDS = ["None", "Very low", "Low", "Moderate", "High", "Very high"] as const;

/** The day's worst pollen, 0–5, or null if Google said nothing. */
export function worstPollen(day: PollenDay | undefined): number | null {
  if (!day) return null;
  const known = day.levels.map((l) => l.index).filter((i): i is number => i !== null);
  return known.length ? Math.max(...known) : null;
}

/** Theme classes for a pollen level's pill (each pair is at least 4.5:1). */
export function pollenTone(index: number | null): string {
  if (index === null || index === 0) return "bg-panel text-ink-muted";
  if (index <= 2) return "bg-met-soft text-ink";
  if (index === 3) return "bg-meal text-meal-ink";
  if (index === 4) return "bg-missed-soft text-ink";
  return "bg-danger text-board";
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** 3.6 → "4°". */
export function degrees(value: number): string {
  return `${Math.round(value) === 0 ? 0 : Math.round(value)}°`;
}

/** The short day name for a forecast column: "Today", then "Tue", "Wed" … */
export function dayName(date: string, today: string): string {
  if (date === today) return "Today";
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", { weekday: "short", timeZone: "UTC" }).replace(/\.$/, "");
}
