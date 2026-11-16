import { getHousehold } from "@/lib/household";
import type { WeatherAnswer } from "@/lib/weather";
import { getForecast } from "@/lib/weather-server";

/*
 * The weather and pollen for the household's place, for the header's
 * weather on the calendar screens (asked every 15 minutes). The server
 * remembers the answers (weather-server.ts), so this is cheap to ask.
 */
export async function GET() {
  const household = await getHousehold();
  if (!household) return Response.json({ error: "signed-out" } satisfies WeatherAnswer, { status: 401 });
  const place = household.settings.weather;
  if (!place) return Response.json({ error: "no-place" } satisfies WeatherAnswer);
  const forecast = await getForecast(place, household.settings);
  if (!forecast) return Response.json({ error: "weather" } satisfies WeatherAnswer, { status: 502 });
  return Response.json({ forecast } satisfies WeatherAnswer);
}
