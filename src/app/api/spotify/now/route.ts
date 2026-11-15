import { getHousehold } from "@/lib/household";
import { fetchNowPlaying, spotifyAccessToken, type NowPlaying } from "@/lib/spotify";
import { createClient } from "@/lib/supabase/server";

/*
 * What's playing on the household's Spotify, for the Today panel's box,
 * which asks every few seconds. Answers { now: null } when nothing is on,
 * and { error } when Spotify isn't connected or didn't answer.
 */
export type NowAnswer = { now: NowPlaying | null } | { error: string };

export async function GET() {
  const household = await getHousehold();
  if (!household) return Response.json({ error: "signed-out" } satisfies NowAnswer, { status: 401 });
  try {
    const token = await spotifyAccessToken(await createClient(), household.id);
    if (!token) return Response.json({ error: "not-connected" } satisfies NowAnswer);
    return Response.json({ now: await fetchNowPlaying(token) } satisfies NowAnswer);
  } catch (e) {
    console.error("Spotify now playing:", e);
    return Response.json({ error: "spotify" } satisfies NowAnswer, { status: 502 });
  }
}
