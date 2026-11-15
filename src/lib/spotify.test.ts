import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, expiresAt, isLoopbackHost, SPOTIFY_SCOPES, visitedOrigin } from "./spotify.ts";

test("only 127.0.0.1 and ::1 count as this computer", () => {
  assert.equal(isLoopbackHost("127.0.0.1:3001"), true);
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("[::1]:3001"), true);
  // Spotify doesn't accept "localhost", only the number.
  assert.equal(isLoopbackHost("localhost:3001"), false);
  assert.equal(isLoopbackHost("192.168.2.42:3001"), false);
});

test("the sign-in page asks for the right things", () => {
  const url = new URL(authorizeUrl("abc", "http://127.0.0.1:3001/api/spotify/callback", "xyz"));
  assert.equal(url.origin + url.pathname, "https://accounts.spotify.com/authorize");
  assert.equal(url.searchParams.get("client_id"), "abc");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:3001/api/spotify/callback");
  assert.equal(url.searchParams.get("state"), "xyz");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), SPOTIFY_SCOPES);
});

test("keys count as run out a minute early", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  assert.equal(expiresAt(now, 3600).toISOString(), "2026-11-15T12:59:00.000Z");
  assert.equal(expiresAt(now, 10).toISOString(), now.toISOString());
});

test("the visited address comes from the Host header, not Next's guess", () => {
  const fallback = new URL("http://localhost:3001/api/spotify/connect");
  assert.equal(visitedOrigin(new Headers({ host: "127.0.0.1:3001" }), fallback), "http://127.0.0.1:3001");
  assert.equal(visitedOrigin(new Headers(), fallback), "http://localhost:3001");
});
