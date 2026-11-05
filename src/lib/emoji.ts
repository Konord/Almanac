/**
 * Pictures for content (events, routine steps, meals) are emoji, drawn
 * with Microsoft's Fluent 3D emoji images bundled in public/emoji/.
 * An emoji we don't have a picture for is shown as the normal emoji.
 * Only imports plain .ts files so `node --test` can run the tests.
 */

import { EMOJI_DATA, EMOJI_GROUPS } from "./emoji-data.ts";

export { EMOJI_GROUPS };

/** Emoji → image file in public/emoji (e.g. "pizza.png"). */
const FILES: Record<string, string> = Object.fromEntries(EMOJI_DATA.map(([emoji, file]) => [emoji, file]));

/** Drops the invisible "show as emoji" marker (U+FE0F) so 🛏️ and 🛏 match. */
function plain(emoji: string): string {
  return emoji.replace(/️/g, "").trim();
}

/** The image path for an emoji, or null if we don't bundle one. */
export function emojiImage(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  const file = FILES[plain(emoji)];
  return file ? `/emoji/${file}` : null;
}

/** Words in an event's title → a picture, used when the event has none. */
const GUESSES: [RegExp, string][] = [
  [/\b(court|trial|hearing|lawyer|legal)\b/i, "⚖️"],
  [/\b(dentist|dental|ortho)/i, "🦷"],
  [/\b(doctor|physio|clinic|checkup|check-up|appointment|vaccine|shots?)\b/i, "🩺"],
  [/\b(hospital)\b/i, "🏥"],
  [/\b(swim|swimming|pool)\b/i, "🥽"],
  [/\b(hockey|skat)/i, "🏒"],
  [/\b(soccer|football)\b/i, "⚽"],
  [/\b(run|running|gym|yoga|workout|track)\b/i, "👟"],
  [/\b(piano|music|guitar|band|choir|violin|concert)\b/i, "🎵"],
  [/\b(school|class|parent night|field trip)\b/i, "🎒"],
  [/\b(library|book club|book|reading|homework|study)\b/i, "📚"],
  [/\b(birthday|bday)\b/i, "🎂"],
  [/\b(party|celebrat)/i, "🎉"],
  [/\b(gift|present)s?\b/i, "🎁"],
  [/\b(work|meeting|office|lunch with)\b/i, "💼"],
  [/\b(movie|film|cinema)\b/i, "🍿"],
  [/\b(game night|video game)\b/i, "🎮"],
  [/\b(pizza)\b/i, "🍕"],
  [/\b(taco)s?\b/i, "🌮"],
  [/\b(brunch|breakfast|pancake)s?\b/i, "🥞"],
  [/\b(dinner|supper|lunch)\b/i, "🍽️"],
  [/\b(grocer|shopping|costco|store)/i, "🛒"],
  [/\b(haircut|hair|barber|salon)\b/i, "💇"],
  [/\b(vet|dog|puppy|walk the dog)\b/i, "🐶"],
  [/\b(flight|airport|trip|vacation|holiday)\b/i, "✈️"],
  [/\b(drive|car|pick ?up|drop ?off)\b/i, "🚗"],
  [/\b(grandma|grandpa|grandparents|visit|home)\b/i, "🏡"],
  [/\b(remembrance)\b/i, "🍁"],
  [/\b(halloween|trick or treat)\b/i, "🎃"],
  [/\b(christmas)\b/i, "🎄"],
  [/\b(leaves|rake|yard)\b/i, "🍂"],
  [/\b(laundry)\b/i, "🧺"],
  [/\b(clean|tidy|chores?)\b/i, "🧽"],
  [/\b(bed|sleep|nap)\b/i, "🛏️"],
];

/** The picture to show for an event: its own, else one guessed from its title. */
export function eventEmoji(icon: string | null | undefined, title: string): string {
  if (icon && icon.trim()) return icon.trim();
  return GUESSES.find(([pattern]) => pattern.test(title))?.[1] ?? "📅";
}

// ---------------------------------------------------------------------------
// Picking a picture: suggestions from a title, and search by name
// ---------------------------------------------------------------------------

export type EmojiChoice = {
  emoji: string;
  /** A short name, e.g. "ice hockey". */
  name: string;
  /** Which tab it lives in: an index into EMOJI_GROUPS. */
  group: number;
  /** Words it can be found by: its name, Unicode's keywords, and our own. */
  words: string[];
};

/** Extra search words for family-calendar things, beyond the standard ones. */
const EXTRA_WORDS: Record<string, string[]> = {
  "🎒": ["school", "bag"],
  "💼": ["work", "office", "meeting", "job"],
  "📅": ["calendar", "date", "event"],
  "🏡": ["home", "house", "work from home", "wfh"],
  "🩺": ["doctor", "appointment", "checkup"],
  "🥽": ["swim", "swimming", "pool"],
  "👟": ["run", "gym", "sports", "walk"],
  "🎵": ["music", "piano", "lesson", "band"],
  "🍽": ["dinner", "lunch", "meal", "restaurant"],
  "💇": ["haircut", "hair", "barber", "salon"],
  "🐶": ["dog", "vet", "pet"],
  "✈": ["flight", "trip", "travel", "vacation"],
  "🚗": ["car", "drive", "pickup", "dropoff"],
  "⚖": ["court", "lawyer", "legal"],
  "🧽": ["clean", "cleaning", "chores"],
  "🎂": ["birthday", "cake"],
  "🎉": ["party", "celebrate"],
  "🍿": ["movie", "film"],
  "🛒": ["groceries", "shopping", "store"],
  "🛏": ["bed", "sleep", "nap"],
  "📚": ["books", "library", "homework", "reading"],
  "🧺": ["laundry", "basket"],
  "🍕": ["pizza day"],
  "🦷": ["dentist"],
  "🏒": ["hockey"],
};

/** Every picture we have, in the standard emoji order. */
export const EMOJI_CHOICES: EmojiChoice[] = EMOJI_DATA.map(([emoji, , name, group, extra]) => {
  const words = new Set([name, ...name.split(" "), ...extra.split(" ").filter(Boolean), ...(EXTRA_WORDS[emoji] ?? [])]);
  return { emoji, name, group, words: [...words] };
});

const BY_EMOJI = new Map(EMOJI_CHOICES.map((c) => [c.emoji, c]));

/** Everyday pictures to offer when the title doesn't suggest anything. */
const EVERYDAY = ["📅", "💼", "🏡", "🍽", "🚗", "🎉", "⭐", "🩺", "🎒", "🛒", "👟", "🎂"];

function choiceFor(emoji: string): EmojiChoice | undefined {
  return BY_EMOJI.get(plain(emoji));
}

/**
 * A short list of pictures for a title: the one Almanac would guess first,
 * then any whose name or words appear in the title, then everyday ones.
 * Each comes with the reason it was suggested.
 */
export function suggestEmoji(title: string, limit = 6): (EmojiChoice & { why: string })[] {
  const result: (EmojiChoice & { why: string })[] = [];
  const add = (choice: EmojiChoice | undefined, why: string) => {
    if (choice && !result.some((r) => r.emoji === choice.emoji) && result.length < limit) result.push({ ...choice, why });
  };
  for (const [pattern, emoji] of GUESSES) {
    const match = pattern.exec(title);
    if (match) add(choiceFor(emoji), `"${match[0].toLowerCase()}"`);
  }
  // Whole words of the title that name a picture ("dog", "cake").
  const titleWords = title.toLowerCase().match(/[a-z']{3,}/g) ?? [];
  for (const word of titleWords) {
    const named = EMOJI_CHOICES.find((c) => c.name === word) ?? EMOJI_CHOICES.find((c) => c.name.split(" ").includes(word));
    add(named ?? EMOJI_CHOICES.find((c) => c.words.includes(word)), `"${word}"`);
  }
  for (const emoji of EVERYDAY) add(choiceFor(emoji), "everyday");
  return result;
}

/**
 * Pictures matching what's typed, best first: the name starts with it, then
 * a word starts with it, then it appears anywhere. Every typed word has to
 * match. Optionally only one tab (group).
 */
export function searchEmoji(query: string, limit = 18, group?: number): EmojiChoice[] {
  const pool = group === undefined ? EMOJI_CHOICES : EMOJI_CHOICES.filter((c) => c.group === group);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return pool.slice(0, limit);
  const q = terms.join(" ");
  // A term matches a word it starts, or appears inside the name ("cake" in "cupcake").
  const matches = (c: EmojiChoice, t: string) => c.name.includes(t) || c.words.some((w) => w.startsWith(t));
  const score = (c: EmojiChoice): number => {
    if (!terms.every((t) => matches(c, t))) return -1;
    if (c.name === q) return 0;
    // Our own family-calendar words ("hockey" is ice hockey) come before the rest.
    if ((EXTRA_WORDS[c.emoji] ?? []).some((w) => w.startsWith(q))) return 1;
    if (c.name.startsWith(q)) return 2;
    if (c.name.split(" ").some((w) => w.startsWith(terms[0]))) return 3;
    if (terms.every((t) => c.words.some((w) => w.startsWith(t)))) return 4;
    return 5;
  };
  return pool
    .map((c, i) => ({ c, s: score(c), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** One page of a tab's pictures, for browsing without a search. */
export function emojiPage(group: number, page: number, perPage: number): { choices: EmojiChoice[]; pages: number } {
  const all = EMOJI_CHOICES.filter((c) => c.group === group);
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const p = Math.min(Math.max(page, 0), pages - 1);
  return { choices: all.slice(p * perPage, (p + 1) * perPage), pages };
}
