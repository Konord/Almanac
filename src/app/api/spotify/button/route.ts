import { getHousehold } from "@/lib/household";
import { pressButton, spotifyAccessToken, type SpotifyButton } from "@/lib/spotify";
import { createClient } from "@/lib/supabase/server";

/* Play, pause or skip, from the Today panel's Spotify box. Body: { button }. */
export async function POST(request: Request) {
  const household = await getHousehold();
  if (!household) return Response.json({ ok: false }, { status: 401 });
  const { button } = (await request.json().catch(() => ({}))) as { button?: string };
  if (button !== "play" && button !== "pause" && button !== "next") return Response.json({ ok: false }, { status: 400 });
  try {
    const token = await spotifyAccessToken(await createClient(), household.id);
    if (!token) return Response.json({ ok: false }, { status: 409 });
    await pressButton(token, button satisfies SpotifyButton);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Spotify button:", e);
    return Response.json({ ok: false }, { status: 502 });
  }
}
