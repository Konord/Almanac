import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireHousehold } from "@/lib/household";
import { authorizeUrl, CALLBACK_PATH, isLoopbackHost, spotifyApp, STATE_COOKIE, visitedOrigin } from "@/lib/spotify";

/*
 * Settings › Spotify › Connect: sends you to Spotify to say "allow".
 *
 * A random "state" goes along and is kept in a cookie for ten minutes.
 * When Spotify sends you back, the callback checks the two match, so only
 * a sign-in started here can connect an account.
 */
export async function GET(request: NextRequest) {
  await requireHousehold();
  const origin = visitedOrigin(request.headers, request.nextUrl);
  const settings = new URL("/household?tab=spotify", origin);
  const app = spotifyApp();
  if (!app) {
    settings.searchParams.set("spotify", "not-set-up");
    return NextResponse.redirect(settings);
  }
  if (!isLoopbackHost(new URL(origin).host)) {
    settings.searchParams.set("spotify", "not-here");
    return NextResponse.redirect(settings);
  }

  const state = randomUUID();
  const redirectUri = new URL(CALLBACK_PATH, origin).toString();
  const response = NextResponse.redirect(authorizeUrl(app.clientId, redirectUri, state));
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/api/spotify", maxAge: 600 });
  return response;
}
