/*
 * Spotify (2026-11-15, thread "Build the Spotify widget").
 *
 * Almanac talks to Spotify's "Web API" from the server, never from the
 * browser, so the keys stay on the server. Connor's account is connected
 * once in Settings › Spotify, and Almanac keeps a long-lived "refresh
 * token" so it can get a fresh one-hour key whenever it needs one.
 *
 * Spotify only sends a sign-in back to a secure (https) address or to
 * 127.0.0.1, "this computer" (Spotify's rule since 2025). Almanac runs on
 * plain http on the home network, so connecting is done once from
 * http://127.0.0.1:3001: on the server through an SSH tunnel, or on the
 * PC where Almanac runs. See docs/spotify.md.
 *
 * The pure helpers at the top have tests in spotify.test.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** What Almanac asks to be allowed to do: see what's playing, and play/pause/skip. */
export const SPOTIFY_SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state"];

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

/** The address Spotify sends the sign-in back to. Must be listed in the Spotify app's settings. */
export const CALLBACK_PATH = "/api/spotify/callback";

/** The cookie that remembers the sign-in's random "state" while you're over at Spotify. */
export const STATE_COOKIE = "almanac-spotify-state";

/** Whether an address's host is "this computer", the only plain-http address Spotify accepts. */
export function isLoopbackHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "127.0.0.1" || name === "::1";
}

/**
 * The address the visitor actually typed, like http://127.0.0.1:3001.
 * Next's own idea of the address can say "localhost" instead, which
 * Spotify wouldn't accept, so this reads the browser's Host header.
 */
export function visitedOrigin(headers: Headers, fallback: URL): string {
  const host = headers.get("host") ?? fallback.host;
  const proto = headers.get("x-forwarded-proto") ?? fallback.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

/** The page on Spotify that asks Connor to allow Almanac. */
export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
  });
  return `${ACCOUNTS}/authorize?${params.toString()}`;
}

/** When a key that lasts `seconds` from `now` should be treated as run out (a minute early, to be safe). */
export function expiresAt(now: Date, seconds: number): Date {
  return new Date(now.getTime() + Math.max(0, seconds - 60) * 1000);
}

/** The Spotify app's id and secret from .env.local, or null if they aren't filled in yet. */
export function spotifyApp(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

type TokenAnswer = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

async function askForToken(body: Record<string, string>): Promise<TokenAnswer> {
  const app = spotifyApp();
  if (!app) throw new Error("Spotify isn't set up: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are missing from .env.local.");
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify said no (${res.status}): ${await res.text()}`);
  return (await res.json()) as TokenAnswer;
}

/** Swaps the one-time code Spotify sends back for the keys. */
export function exchangeCode(code: string, redirectUri: string): Promise<TokenAnswer> {
  return askForToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/** Whose account the key belongs to. */
export async function spotifyProfile(accessToken: string): Promise<{ id: string; display_name: string | null }> {
  const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't read the Spotify account (${res.status}).`);
  return (await res.json()) as { id: string; display_name: string | null };
}

type Db = SupabaseClient<Database>;

/**
 * A working one-hour key for the household's Spotify, getting a new one
 * first if it has run out. Null if Spotify isn't connected.
 */
export async function spotifyAccessToken(supabase: Db, householdId: string, now = new Date()): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  if (new Date(row.expires_at) > now) return row.access_token;

  const fresh = await askForToken({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  const { error: saveError } = await supabase
    .from("spotify_connections")
    .update({
      access_token: fresh.access_token,
      // Spotify sometimes hands out a new refresh token too; keep the old one if not.
      refresh_token: fresh.refresh_token ?? row.refresh_token,
      expires_at: expiresAt(now, fresh.expires_in).toISOString(),
    })
    .eq("household_id", householdId);
  if (saveError) throw saveError;
  return fresh.access_token;
}

// ---------------------------------------------------------------------------
// What's playing, and the buttons (step 2)
// ---------------------------------------------------------------------------

/** The song on Connor's account right now, ready to show. */
export type NowPlaying = {
  title: string;
  /** The artists, joined with commas (or the show, for a podcast). */
  artist: string;
  /** The album cover (the smallest one Spotify has that's big enough), or null. */
  art: string | null;
  playing: boolean;
  /** Where it's playing, e.g. "Connor's iPhone". */
  device: string | null;
  progressMs: number;
  durationMs: number;
};

type Image = { url: string; width: number | null; height: number | null };
type PlayerAnswer = {
  is_playing: boolean;
  progress_ms: number | null;
  currently_playing_type?: string;
  device?: { name?: string | null } | null;
  item: {
    name: string;
    duration_ms: number;
    artists?: { name: string }[];
    album?: { images?: Image[] };
    show?: { name: string; images?: Image[] };
    images?: Image[];
  } | null;
};

/** Picks a cover at least `min` pixels wide, as small as possible, so the box loads quickly. */
export function pickImage(images: Image[] | undefined, min = 128): string | null {
  if (!images?.length) return null;
  const bigEnough = images.filter((i) => (i.width ?? 0) >= min).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (bigEnough[0] ?? images[0]).url;
}

/** Turns Spotify's long answer into the few things the box shows. Null when nothing is loaded. */
export function readPlayer(answer: PlayerAnswer | null): NowPlaying | null {
  const item = answer?.item;
  if (!answer || !item) return null;
  const artist = item.artists?.length ? item.artists.map((a) => a.name).join(", ") : (item.show?.name ?? "");
  return {
    title: item.name,
    artist,
    art: pickImage(item.album?.images ?? item.images ?? item.show?.images),
    playing: answer.is_playing,
    device: answer.device?.name ?? null,
    progressMs: answer.progress_ms ?? 0,
    durationMs: item.duration_ms,
  };
}

/** Asks Spotify what's on. Null when nothing is playing or loaded anywhere. */
export async function fetchNowPlaying(accessToken: string): Promise<NowPlaying | null> {
  const res = await fetch(`${API}/me/player?additional_types=episode`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (res.status === 204) return null; // no device has Spotify open
  if (!res.ok) throw new Error(`Spotify didn't say what's playing (${res.status}).`);
  return readPlayer((await res.json()) as PlayerAnswer);
}

export type SpotifyButton = "play" | "pause" | "next";

/** Presses play, pause or skip on whatever device is playing. */
export async function pressButton(accessToken: string, button: SpotifyButton): Promise<void> {
  const [method, path] = button === "next" ? ["POST", "/me/player/next"] : ["PUT", `/me/player/${button}`];
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  // 204 (done) and 200 are fine. Anything else: tell the box so it can say so.
  if (!res.ok) throw new Error(`Spotify didn't take the button (${res.status}).`);
}
