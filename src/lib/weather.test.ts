import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayName,
  degrees,
  describeWeather,
  forecastUrl,
  parseOpenMeteo,
  parsePlaces,
  parsePollen,
  parseWeatherPlace,
  pollenTone,
  pollenUrl,
  worstPollen,
} from "./weather.ts";

const toronto = { name: "Toronto", latitude: 43.70011, longitude: -79.4163 };

test("a weather place needs a name and real coordinates", () => {
  assert.deepEqual(parseWeatherPlace(toronto), toronto);
  assert.equal(parseWeatherPlace(null), null);
  assert.equal(parseWeatherPlace({ name: "", latitude: 1, longitude: 1 }), null);
  assert.equal(parseWeatherPlace({ name: "X", latitude: 91, longitude: 1 }), null);
  assert.equal(parseWeatherPlace({ name: "X", latitude: 1, longitude: "2" }), null);
});

test("the forecast address asks for 5 days in the household's units", () => {
  const url = new URL(forecastUrl(toronto, "America/Toronto", false, false));
  assert.equal(url.host, "api.open-meteo.com");
  assert.equal(url.searchParams.get("forecast_days"), "5");
  assert.equal(url.searchParams.get("timezone"), "America/Toronto");
  assert.equal(url.searchParams.get("temperature_unit"), "celsius");
  assert.equal(url.searchParams.get("wind_speed_unit"), "kmh");
  const us = new URL(forecastUrl(toronto, "America/Toronto", true, true));
  assert.equal(us.searchParams.get("temperature_unit"), "fahrenheit");
  assert.equal(us.searchParams.get("wind_speed_unit"), "mph");
});

test("Open-Meteo's answer becomes now + days", () => {
  const parsed = parseOpenMeteo({
    current: { temperature_2m: 3.6, apparent_temperature: -0.4, weather_code: 3, is_day: 1, wind_speed_10m: 14.2 },
    daily: {
      time: ["2026-11-16", "2026-11-17"],
      weather_code: [3, 61],
      temperature_2m_max: [5.1, 7],
      temperature_2m_min: [-1, 2.2],
      precipitation_probability_max: [10, 80],
      sunrise: ["2026-11-16T07:03", "2026-11-17T07:04"],
      sunset: ["2026-11-16T16:50", "2026-11-17T16:49"],
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.now.temp, 3.6);
  assert.equal(parsed.now.isDay, true);
  assert.equal(parsed.days.length, 2);
  assert.deepEqual(parsed.days[1], { date: "2026-11-17", code: 61, high: 7, low: 2.2, rainChance: 80, sunrise: "07:04", sunset: "16:49" });
  assert.equal(parseOpenMeteo({ error: true, reason: "bad" }), null);
});

test("place search keeps up to 5 places with their province and country", () => {
  const places = parsePlaces({
    results: [
      { name: "Oakville", latitude: 43.45, longitude: -79.68, admin1: "Ontario", country: "Canada" },
      { name: "Broken", latitude: "x", longitude: 0 },
      { name: "Oakville", latitude: 38.47, longitude: -90.3, admin1: "Missouri", country: "United States" },
    ],
  });
  assert.equal(places.length, 2);
  assert.equal(places[0].detail, "Ontario, Canada");
  assert.deepEqual(parsePlaces({}), []);
});

test("weather codes become a picture and words, with the moon at night", () => {
  assert.deepEqual(describeWeather(0), { emoji: "☀️", label: "Clear" });
  assert.equal(describeWeather(0, false).emoji, "🌙");
  assert.equal(describeWeather(63).label, "Rain");
  assert.equal(describeWeather(73).emoji, "🌨️");
  assert.equal(describeWeather(95).label, "Thunderstorms");
});

test("the pollen address doesn't carry the key", () => {
  const url = new URL(pollenUrl(toronto));
  assert.equal(url.host, "pollen.googleapis.com");
  assert.equal(url.searchParams.get("days"), "5");
  assert.equal(url.searchParams.get("key"), null);
});

test("Google's pollen answer becomes tree, grass and weed for each day", () => {
  const days = parsePollen({
    regionCode: "CA",
    dailyInfo: [
      {
        date: { year: 2026, month: 5, day: 4 },
        pollenTypeInfo: [
          { code: "GRASS", inSeason: true, indexInfo: { code: "UPI", value: 2, category: "Low" } },
          { code: "TREE", inSeason: true, indexInfo: { code: "UPI", value: 4, category: "High" } },
          { code: "WEED", inSeason: false },
        ],
        plantInfo: [
          { code: "OAK", displayName: "Oak", indexInfo: { value: 3 } },
          { code: "BIRCH", displayName: "Birch", inSeason: true, indexInfo: { value: 4 } },
          { code: "ALDER", displayName: "Alder" },
        ],
      },
    ],
  });
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-05-04");
  assert.deepEqual(
    days[0].levels.map((l) => [l.type, l.index]),
    [["tree", 4], ["grass", 2], ["weed", null]],
  );
  assert.deepEqual(days[0].plants, ["Birch", "Oak"]);
  assert.equal(worstPollen(days[0]), 4);
  assert.deepEqual(parsePollen({ error: { code: 403 } }), []);
});

test("pollen with nothing known is quiet", () => {
  assert.equal(worstPollen(undefined), null);
  assert.equal(pollenTone(null), "bg-panel text-ink-muted");
  assert.equal(pollenTone(5), "bg-danger text-board");
});

test("degrees round and never show minus zero", () => {
  assert.equal(degrees(3.6), "4°");
  assert.equal(degrees(-0.4), "0°");
  assert.equal(degrees(-7.5), "-7°");
});

test("forecast columns are named Today, then short weekdays", () => {
  assert.equal(dayName("2026-11-16", "2026-11-16"), "Today");
  assert.equal(dayName("2026-11-17", "2026-11-16"), "Tue");
});
