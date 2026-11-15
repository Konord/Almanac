"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { LinkSimple, MusicNotes, PlugsConnected } from "@phosphor-icons/react";
import { Card, Emoji } from "@/components/ui";
import { disconnectSpotify } from "./spotify-actions";

/*
 * Settings › Spotify (2026-11-15): connect Connor's Spotify account once,
 * so the Today panel can show what's playing (step 2).
 *
 * Spotify only lets the sign-in come back to http://127.0.0.1, "this
 * computer", so Connect only works when Almanac is open at that address.
 * Anywhere else this tab explains how to get there (docs/spotify.md).
 */

export type SpotifyInfo = {
  /** Whether SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are in .env.local. */
  setUp: boolean;
  account: { name: string; connectedAt: string } | null;
};

const NOTES: Record<string, string> = {
  connected: "Spotify is connected.",
  cancelled: "Spotify wasn't connected: the sign-in was cancelled.",
  failed: "Spotify couldn't be connected. Check the app's id, secret and address, then try again.",
  "try-again": "That sign-in had run out. Tap Connect again.",
  "not-here": "Connect only works from http://127.0.0.1:3001. See the steps.",
  "not-set-up": "Add the Spotify app's id and secret to .env.local first.",
};

const noChange = () => () => {};

const buttonClass = "flex min-h-[var(--touch-target)] items-center gap-2 self-start rounded-2xl px-5 text-lg font-bold";

export function SpotifyTab({ info }: { info: SpotifyInfo }) {
  const note = useSearchParams().get("spotify");
  // Only known after the page has loaded in the browser.
  const here = useSyncExternalStore(
    noChange,
    () => window.location.hostname === "127.0.0.1" || window.location.hostname === "[::1]",
    () => null,
  );
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
      <Card title="Spotify" icon={MusicNotes} tint="green">
        <div className="mt-2 flex flex-1 flex-col gap-4">
          {note && NOTES[note] ? <p className={`rounded-2xl px-4 py-3 text-lg font-bold ${note === "connected" ? "bg-rail text-ink" : "bg-alert-soft text-ink"}`}>{NOTES[note]}</p> : null}
          <div className="flex items-center gap-4">
            <Emoji emoji="🎵" className="size-16 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold text-ink">{info.account ? info.account.name : "Not connected"}</p>
              <p className="text-lg text-ink-muted">
                {info.account
                  ? `Connected ${new Date(info.account.connectedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`
                  : "The Today panel shows the song playing on this account, with pause and skip."}
              </p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2.5 border-t border-frame pt-4">
            {!info.setUp ? (
              <p className="text-lg text-ink-muted">Spotify isn&apos;t set up on this server yet. Follow steps 1 and 2.</p>
            ) : here ? (
              <a href="/api/spotify/connect" className={`${buttonClass} bg-ink text-board`}>
                <PlugsConnected size="1.25rem" weight="bold" aria-hidden />
                {info.account ? "Connect again" : "Connect Spotify"}
              </a>
            ) : here === false ? (
              <p className="text-lg text-ink-muted">To connect, open Almanac at http://127.0.0.1:3001 (step 3).</p>
            ) : null}
            {info.account ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!sure) return setSure(true);
                  setBusy(true);
                  await disconnectSpotify();
                  setBusy(false);
                  setSure(false);
                }}
                className={`${buttonClass} ${sure ? "bg-danger text-board" : "bg-rail text-ink hover:bg-panel"}`}
              >
                {sure ? "Yes, disconnect" : "Disconnect"}
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card title="How to connect" icon={LinkSimple} tint="slate">
        <ol className="mt-2 flex list-decimal flex-col gap-3 pl-7 text-lg text-ink marker:font-bold">
          <li>
            On <span className="font-bold">developer.spotify.com</span>, make an app (Web API). Add this redirect address:
            <span className="mt-1 block font-bold break-all">http://127.0.0.1:3001/api/spotify/callback</span>
          </li>
          <li>
            Put the app&apos;s Client ID and Client secret in the server&apos;s <span className="font-bold">.env.local</span> as SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET, then restart Almanac.
          </li>
          <li>
            On the PC, open a tunnel to the server: <span className="font-bold">ssh -L 3001:127.0.0.1:3001 hub</span>. Leave it open and go to <span className="font-bold">http://127.0.0.1:3001</span>.
          </li>
          <li>Sign in, come back to this tab and tap Connect Spotify. Then close the tunnel: Almanac stays connected.</li>
        </ol>
      </Card>
    </div>
  );
}
