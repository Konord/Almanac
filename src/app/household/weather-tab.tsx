"use client";

import { useState } from "react";
import { CloudSun, Flower, MagnifyingGlass } from "@phosphor-icons/react";
import { Card, Emoji, editorInputClass } from "@/components/ui";
import type { PlaceMatch, WeatherPlace } from "@/lib/weather";
import { chipClass } from "./fields";
import { searchPlaces } from "./weather-actions";

/*
 * Settings › Weather (2026-11-16): where the header's weather and pollen
 * are for. Find a town by name, tap it, then Save. The pollen needs a
 * Google key in the server's .env.local (docs/weather.md); this tab
 * only says whether it's there.
 */

export type WeatherInfo = {
  /** Whether GOOGLE_POLLEN_API_KEY is in .env.local. */
  pollenKey: boolean;
};

const buttonClass = "flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-2xl px-5 text-lg font-bold";

export function WeatherTab({ value, onChange, info }: { value: WeatherPlace | null; onChange: (place: WeatherPlace | null) => void; info: WeatherInfo }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PlaceMatch[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    if (busy || query.trim().length < 2) return;
    setBusy(true);
    setProblem(null);
    const answer = await searchPlaces(query);
    setBusy(false);
    if ("error" in answer) return setProblem(answer.error);
    setFound(answer.places);
  };

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
      <Card title="Weather" icon={CloudSun} tint="blue">
        <div className="mt-2 flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-4">
            <Emoji emoji="⛅" className="size-16 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold text-ink">{value ? value.name : "No place yet"}</p>
              <p className="text-lg text-ink-muted">
                {value ? "The calendar screens show the weather here. Tap it for the next 5 days." : "Find your town so the calendar screens can show its weather."}
              </p>
            </div>
          </div>
          <form
            className="flex gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void find();
            }}
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Town or city" aria-label="Town or city" maxLength={80} className={`${editorInputClass} min-w-0 flex-1`} />
            <button type="submit" disabled={busy} className={`${buttonClass} bg-ink text-board`}>
              <MagnifyingGlass size="1.25rem" weight="bold" aria-hidden />
              Find
            </button>
          </form>
          {problem ? <p className="rounded-2xl bg-alert-soft px-4 py-3 text-lg font-bold text-ink">{problem}</p> : null}
          {found ? (
            found.length ? (
              <div className="flex flex-wrap gap-[0.45rem]">
                {found.map((p) => {
                  const on = value?.latitude === p.latitude && value.longitude === p.longitude;
                  return (
                    <button
                      key={`${p.latitude},${p.longitude}`}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ name: p.name, latitude: p.latitude, longitude: p.longitude })}
                      className={`${chipClass(on)} max-w-full`}
                    >
                      <span className="truncate">
                        {p.name}
                        {p.detail ? <span className="font-semibold text-ink-muted">, {p.detail}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-lg text-ink-muted">Nothing by that name. Try the nearest bigger town.</p>
            )
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-2.5 border-t border-frame pt-4">
            {value ? (
              <button type="button" onClick={() => onChange(null)} className={`${buttonClass} bg-rail text-ink hover:bg-panel`}>
                Turn the weather off
              </button>
            ) : null}
            <p className="text-lg text-ink-muted">Weather by Open-Meteo, free with no account. Save to keep a new place.</p>
          </div>
        </div>
      </Card>

      <Card title="Pollen" icon={Flower} tint="green">
        <div className="mt-2 flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-4">
            <Emoji emoji="🤧" className="size-16 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold text-ink">{info.pollenKey ? "Pollen is on" : "Pollen is off"}</p>
              <p className="text-lg text-ink-muted">
                {info.pollenKey
                  ? "Tree, grass and weed pollen for 5 days, from Google. In season, today's level shows under the temperature."
                  : "Pollen comes from Google's Pollen API, which needs a key on the server."}
              </p>
            </div>
          </div>
          {info.pollenKey ? null : (
            <ol className="flex list-decimal flex-col gap-2 pl-7 text-lg text-ink marker:font-bold">
              <li>
                On <span className="font-bold">console.cloud.google.com</span>, make a project, add billing, and enable <span className="font-bold">Pollen API</span>.
              </li>
              <li>Make an API key and limit it to Pollen API.</li>
              <li>
                Put it in the server&apos;s <span className="font-bold">.env.local</span> as GOOGLE_POLLEN_API_KEY, then restart Almanac.
              </li>
            </ol>
          )}
          <p className="mt-auto border-t border-frame pt-4 text-lg text-ink-muted">Free up to 5,000 checks a month. Almanac checks every 3 hours, about 250 a month. Steps: docs/weather.md.</p>
        </div>
      </Card>
    </div>
  );
}
