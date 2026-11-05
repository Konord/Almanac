/**
 * Pictures for content (events, routine steps, meals) are emoji, drawn
 * with Microsoft's Fluent 3D emoji images bundled in public/emoji/.
 * An emoji we don't have a picture for is shown as the normal emoji.
 * Free of other imports so `node --test` can run the tests.
 */

/** Emoji → image file name in public/emoji (without ".png"). */
const FILES: Record<string, string> = {
  "🎒": "backpack",
  "⚖": "balance_scale",
  "🦇": "bat",
  "🎂": "birthday_cake",
  "📚": "books",
  "🥣": "bowl_with_spoon",
  "💼": "briefcase",
  "📅": "calendar",
  "📆": "calendar",
  "🕯": "candle",
  "🎄": "christmas_tree",
  "🌧": "cloud_with_rain",
  "🍂": "fallen_leaf",
  "👻": "ghost",
  "🥽": "goggles",
  "🏡": "house_with_garden",
  "🏠": "house_with_garden",
  "🏒": "ice_hockey",
  "🎃": "jack-o-lantern",
  "🍁": "maple_leaf",
  "🥞": "pancakes",
  "🎉": "party_popper",
  "🍕": "pizza",
  "👟": "running_shoe",
  "❄": "snowflake",
  "⛄": "snowman",
  "☃": "snowman",
  "🕸": "spider_web",
  "⭐": "star",
  "🌥": "sun_behind_cloud",
  "⛅": "sun_behind_cloud",
  "👕": "t-shirt",
  "🌮": "taco",
  "🦷": "tooth",
  "🪥": "toothbrush",
  "🎁": "wrapped_gift",
  "🍎": "red_apple",
  "🍽": "fork_and_knife_with_plate",
  "🎮": "video_game",
  "📖": "open_book",
  "😴": "sleeping_face",
  "🚽": "toilet",
  "🛁": "bathtub",
  "🛏": "bed",
  "🧥": "coat",
  "🧸": "teddy_bear",
  "🧺": "basket",
  "🧼": "soap",
  "🧽": "sponge",
  "⚽": "soccer_ball",
  "🎵": "musical_note",
  "🩺": "stethoscope",
  "🏫": "school",
  "✈": "airplane",
  "🚗": "automobile",
  "🛒": "shopping_cart",
  "🍿": "popcorn",
  "🐶": "dog_face",
  "✨": "sparkles",
  "🏥": "hospital",
  "💇": "person_getting_haircut",
  "🥪": "sandwich",
  "💧": "droplet",
  "🔒": "locked",
};

/** Drops the invisible "show as emoji" marker (U+FE0F) so 🛏️ and 🛏 match. */
function plain(emoji: string): string {
  return emoji.replace(/️/g, "").trim();
}

/** The image path for an emoji, or null if we don't bundle one. */
export function emojiImage(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  const file = FILES[plain(emoji)];
  return file ? `/emoji/${file}.png` : null;
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
