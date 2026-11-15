/*
 * Sounds (Connor, 2026-11-15). The kitchen screen will make small sounds
 * (a tick when something's checked off, a chime for a timer), but there
 * are no sound files yet: Connor is choosing them himself. Until then
 * play() works out whether a sound *would* play (not muted, not in quiet
 * hours) and then does nothing.
 *
 * TODO(Connor): add the files to public/sounds/ (for example tick.mp3,
 * done.mp3, timer.mp3, alert.mp3, add.mp3) and fill in SOUND_FILES below.
 * Nothing else needs to change: the settings and the calls are in place.
 *
 * Kept free of other imports so `node --test` can run the tests.
 */

/** Where sounds come out. Only the screen's own speaker for now. */
export type SoundOutput = "screen";

export type SoundSettings = {
  /** Everything off. */
  muted: boolean;
  /** Quiet hours, "21:00" to "07:00". They may run past midnight. Equal times mean no quiet hours. */
  quietFrom: string;
  quietTo: string;
  output: SoundOutput;
};

export const DEFAULT_SOUNDS: SoundSettings = { muted: false, quietFrom: "21:00", quietTo: "07:00", output: "screen" };

export type SoundName = "tick" | "done" | "add" | "timer" | "alert";

/** The file for each sound, once Connor has added them (paths under /public). */
export const SOUND_FILES: Partial<Record<SoundName, string>> = {};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Reads the sounds setting from the database, filling gaps with defaults. */
export function parseSounds(raw: unknown): SoundSettings {
  const v = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    muted: typeof v.muted === "boolean" ? v.muted : DEFAULT_SOUNDS.muted,
    quietFrom: typeof v.quietFrom === "string" && HHMM.test(v.quietFrom) ? v.quietFrom : DEFAULT_SOUNDS.quietFrom,
    quietTo: typeof v.quietTo === "string" && HHMM.test(v.quietTo) ? v.quietTo : DEFAULT_SOUNDS.quietTo,
    output: "screen",
  };
}

/** True during quiet hours. `minute` is minutes since local midnight. */
export function inQuietHours(settings: Pick<SoundSettings, "quietFrom" | "quietTo">, minute: number): boolean {
  const from = minutesOf(settings.quietFrom);
  const to = minutesOf(settings.quietTo);
  if (from === to) return false;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Whether a sound may play now. */
export function soundAllowed(settings: SoundSettings, minute: number): boolean {
  return !settings.muted && !inQuietHours(settings, minute);
}

/**
 * Plays a sound if the settings allow it. For now nothing plays (there are
 * no files). Returns whether it would have played, which the tests use.
 * `now` is the local time as minutes since midnight in the household's
 * time zone; the caller works it out.
 */
export function play(name: SoundName, settings: SoundSettings, now: number): boolean {
  if (!soundAllowed(settings, now)) return false;
  const file = SOUND_FILES[name];
  if (!file || typeof Audio === "undefined") return true; // placeholder: allowed, but nothing to play yet
  void new Audio(file).play().catch(() => {});
  return true;
}
