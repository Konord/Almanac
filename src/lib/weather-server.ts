import type { HouseholdSettings } from "@/lib/household";
import {
  alertsUrl,
  forecastUrl,
  inCanadaArea,
  parseAlerts,
  type WeatherAlert,
  OPEN_METEO_PLACES,
  parseOpenMeteo,
  parsePlaces,
  parsePollen,
  pollenUrl,
  type Forecast,
  type PlaceMatch,
  type PollenDay,
  type WeatherDay,
  type WeatherHour,
  type WeatherNow,
  type WeatherPlace,
} from "@/lib/weather";

/*
 * Asks Open-Meteo and Google for the weather and pollen (see weather.ts),
 * and remembers the answers in the server's memory so every screen and
 * every tablet shares one ask:
 *
 *   - the weather for 15 minutes,
 *   - Environment Canada's weather alerts for 10 minutes,
 *   - the pollen for 3 hours (Google updates it about once a day, and
 *     each ask counts toward the free 5,000 a month).
 *
 * If a service doesn't answer, the last answer is kept for up to 12
 * hours rather than showing nothing.
 */

const WEATHER_FOR = 15 * 60_000;
const POLLEN_FOR = 3 * 60 * 60_000;
const ALERTS_FOR = 10 * 60_000;
const KEEP_OLD_FOR = 12 * 60 * 60_000;
const ASK_TIMEOUT = 10_000;

type Kept<T> = { value: T; at: number };
const weatherKept = new Map<string, Kept<{ now: WeatherNow; hours: WeatherHour[]; days: WeatherDay[] }>>();
const pollenKept = new Map<string, Kept<PollenDay[]>>();
const alertsKept = new Map<string, Kept<WeatherAlert[]>>();
/** When an ask last failed, so a broken service isn't asked on every screen load. */
const failedAt = new Map<string, number>();
const RETRY_AFTER = 5 * 60_000;

/** The pollen key from .env.local, or null to leave pollen off. */
export function pollenKey(): string | null {
  const key = process.env.GOOGLE_POLLEN_API_KEY?.trim();
  return key ? key : null;
}

async function askJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(ASK_TIMEOUT) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

/** Remembered, or asked again when it's old. Old answers stand in when an ask fails. */
async function kept<T>(store: Map<string, Kept<T>>, key: string, freshFor: number, ask: () => Promise<T | null>): Promise<T | null> {
  const old = store.get(key);
  const now = Date.now();
  if (old && now - old.at < freshFor) return old.value;
  const failed = failedAt.get(key);
  if (failed && now - failed < RETRY_AFTER) return old && now - old.at < KEEP_OLD_FOR ? old.value : null;
  try {
    const value = await ask();
    if (value === null) throw new Error("the answer didn't look right");
    store.set(key, { value, at: now });
    failedAt.delete(key);
    return value;
  } catch (e) {
    console.error(`Weather (${key}):`, e instanceof Error ? e.message : e);
    failedAt.set(key, now);
    return old && now - old.at < KEEP_OLD_FOR ? old.value : null;
  }
}

/** The forecast for the household's place, or null if the weather service didn't answer. */
export async function getForecast(place: WeatherPlace, settings: HouseholdSettings): Promise<Forecast | null> {
  const imperial = settings.units === "imperial";
  const fahrenheit = settings.temperatureUnit === "fahrenheit";
  const where = `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;

  const url = forecastUrl(place, settings.timeZone, imperial, fahrenheit);
  const key = pollenKey();
  const [weather, pollen, alerts] = await Promise.all([
    kept(weatherKept, `weather ${where} ${settings.timeZone} ${imperial} ${fahrenheit}`, WEATHER_FOR, async () => parseOpenMeteo(await askJson(url))),
    key
      ? kept(pollenKept, `pollen ${where}`, POLLEN_FOR, async () => {
          const days = parsePollen(await askJson(pollenUrl(place), { "X-Goog-Api-Key": key }));
          return days.length ? days : null;
        })
      : Promise.resolve(null),
    inCanadaArea(place)
      ? kept(alertsKept, `alerts ${where}`, ALERTS_FOR, async () => parseAlerts(await askJson(alertsUrl(place)), new Date()))
      : Promise.resolve(null),
  ]);
  if (!weather) return null;
  return {
    place: place.name,
    locale: settings.locale,
    unit: fahrenheit ? "F" : "C",
    windUnit: imperial ? "mph" : "km/h",
    now: weather.now,
    hours: weather.hours,
    days: weather.days,
    pollen: key ? (pollen ?? []) : null,
    // A remembered alert that has since run out drops off.
    alerts: (alerts ?? []).filter((a) => !a.until || Date.parse(a.until) > Date.now()),
  };
}

/** Places matching a name, for Settings › Weather (Open-Meteo's free place search). */
export async function findPlaces(name: string): Promise<PlaceMatch[]> {
  const params = new URLSearchParams({ name: name.trim().slice(0, 80), count: "5", language: "en", format: "json" });
  return parsePlaces(await askJson(`${OPEN_METEO_PLACES}?${params.toString()}`));
}
