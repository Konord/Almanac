"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, SkipForward } from "@phosphor-icons/react";
import { Emoji } from "@/components/ui";
import type { NowPlaying, SpotifyButton } from "@/lib/spotify";
import type { NowAnswer } from "@/app/api/spotify/now/route";

/*
 * The Today panel's bottom box, when Spotify is connected (2026-11-15).
 *
 * The music plays from Connor's phone; this only shows the song and
 * sends pause, play and skip to wherever it's playing. While a song
 * plays the box shows it; after a pause it stays for 15 minutes so it can
 * be started again, then the next meal comes back (the `meal` box passed
 * in), as agreed for the panel's bottom box on 2026-11-07.
 *
 * It asks the server what's on every 5 seconds while playing and every
 * 15 seconds otherwise, and not at all while the screen is hidden.
 */

const PLAYING_EVERY = 5_000;
const IDLE_EVERY = 15_000;
const KEEP_AFTER_PAUSE = 15 * 60_000;

export function SpotifyBox({ meal }: { meal: ReactNode }) {
  const [now, setNow] = useState<NowPlaying | null>(null);
  // When `now` arrived, to move the bar along between asks.
  const [gotAt, setGotAt] = useState(0);
  const [lastPlaying, setLastPlaying] = useState(0);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const askSoon = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let playing = false;

    const ask = async () => {
      clearTimeout(timer);
      if (!document.hidden) {
        try {
          const res = await fetch("/api/spotify/now", { cache: "no-store" });
          const answer = (await res.json()) as NowAnswer;
          if (stopped) return;
          const fresh = "now" in answer ? answer.now : null;
          const at = Date.now();
          playing = Boolean(fresh?.playing);
          setNow(fresh);
          setGotAt(at);
          setClock(at);
          if (playing) setLastPlaying(at);
        } catch {
          // The server or Spotify didn't answer: keep what's showing and try again.
        }
      }
      if (!stopped) timer = setTimeout(ask, playing ? PLAYING_EVERY : IDLE_EVERY);
    };
    askSoon.current = () => {
      clearTimeout(timer);
      timer = setTimeout(ask, 700);
    };
    const onShow = () => {
      if (!document.hidden) void ask();
    };

    void ask();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  // Moves the bar along once a second while a song plays.
  useEffect(() => {
    if (!now?.playing) return;
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [now?.playing]);

  const show = now && (now.playing || clock - lastPlaying < KEEP_AFTER_PAUSE);
  if (!show) return <>{meal}</>;

  const press = async (button: SpotifyButton) => {
    setBusy(true);
    // Show the change straight away; the next ask puts it right if Spotify disagrees.
    if (button !== "next") {
      const at = Date.now();
      setNow({ ...now, playing: button === "play", progressMs: now.progressMs + (now.playing ? at - gotAt : 0) });
      setGotAt(at);
      setLastPlaying(at);
    }
    await fetch("/api/spotify/button", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ button }) }).catch(() => null);
    setBusy(false);
    askSoon.current();
  };

  const progress = Math.min(now.durationMs, now.progressMs + (now.playing ? clock - gotAt : 0));
  const percent = now.durationMs > 0 ? (progress / now.durationMs) * 100 : 0;

  return (
    <section aria-label="Now playing on Spotify" className="mt-4 flex min-h-22 items-center gap-3 rounded-[1.375rem] border border-frame bg-board px-3.5 py-2.5">
      {now.art ? (
        // eslint-disable-next-line @next/next/no-img-element -- Spotify's album cover, already small
        <img src={now.art} alt="" aria-hidden className="size-14 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-rail">
          <Emoji emoji="🎵" className="size-10" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-lg leading-tight font-extrabold text-ink">{now.title}</span>
        <span className="truncate text-base text-ink-muted">{now.artist}</span>
        <span className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rail" aria-hidden>
          <span className="block h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
        </span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => press(now.playing ? "pause" : "play")}
        aria-label={now.playing ? "Pause" : "Play"}
        className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-ink text-board disabled:opacity-60"
      >
        {now.playing ? <Pause size="1.5rem" weight="fill" aria-hidden /> : <Play size="1.5rem" weight="fill" aria-hidden />}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => press("next")}
        aria-label="Next song"
        className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full text-ink hover:bg-rail disabled:opacity-60"
      >
        <SkipForward size="1.5rem" weight="fill" aria-hidden />
      </button>
    </section>
  );
}
