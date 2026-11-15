import { NextResponse, type NextRequest } from "next/server";
import { requireHousehold } from "@/lib/household";
import { CALLBACK_PATH, exchangeCode, expiresAt, spotifyProfile, STATE_COOKIE, visitedOrigin } from "@/lib/spotify";
import { createClient } from "@/lib/supabase/server";

/*
 * Where Spotify sends you back after "allow" (or "cancel"). Swaps the
 * one-time code for the keys, finds out whose account it is, saves it
 * all, and goes back to Settings › Spotify with a short note to show.
 */
export async function GET(request: NextRequest) {
  const household = await requireHousehold();
  const params = request.nextUrl.searchParams;
  const origin = visitedOrigin(request.headers, request.nextUrl);
  const settings = new URL("/household?tab=spotify", origin);
  const done = (note: string) => {
    settings.searchParams.set("spotify", note);
    const response = NextResponse.redirect(settings);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/spotify" });
    return response;
  };

  const state = request.cookies.get(STATE_COOKIE)?.value;
  if (!state || state !== params.get("state")) return done("try-again");
  if (params.get("error") === "access_denied") return done("cancelled");
  const code = params.get("code");
  if (!code) return done("try-again");

  try {
    const redirectUri = new URL(CALLBACK_PATH, origin).toString();
    const now = new Date();
    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.refresh_token) return done("try-again");
    const profile = await spotifyProfile(tokens.access_token);
    const supabase = await createClient();
    const { error } = await supabase.from("spotify_connections").upsert({
      household_id: household.id,
      spotify_user_id: profile.id,
      display_name: profile.display_name,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt(now, tokens.expires_in).toISOString(),
      scopes: tokens.scope ?? "",
      connected_at: now.toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    console.error("Spotify connect failed:", e);
    return done("failed");
  }
  return done("connected");
}
