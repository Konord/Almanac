// Shared sample data for every mockup (Sat Nov 14, 2026, 8:40 am).
window.D = {
  now: "8:40", nowMin: 8 * 60 + 40,
  dateLong: "Saturday, November 14", weekday: "Saturday", day: 14, month: "November", year: 2026,
  weather: { temp: 6, hi: 9, lo: 2, cond: "Cloudy, clearing later", icon: "sun_behind_cloud.png" },
  sky: { sunrise: "7:03 am", sunset: "4:52 pm", daylight: "9 h 49 m", moon: "Waxing crescent", moonPct: 22, moonIcon: "waxing_crescent_moon.webp" },
  people: [
    { id: "c", name: "Connor", short: "Connor", col: "blue", role: "Parent" },
    { id: "a", name: "Alexandra-Margaret", short: "Alexandra", col: "pink", role: "Parent" },
    { id: "s", name: "Sam", short: "Sam", col: "teal", role: "Child", icon: "fox.webp" },
    { id: "x", name: "Christopher", short: "Christopher", col: "purple", role: "Child" },
  ],
  // day: 0 = today (Sat 14). s/e in minutes.
  events: [
    { id: 1, t: "Dentist appointment downtown with Dr. Kowalczyk", day: 0, s: 540, e: 600, who: ["c"], icon: "tooth.png", place: "Bloor St W" },
    { id: 2, t: "Team standup", day: 0, s: 540, e: 570, who: ["a"], icon: "calendar.png" },
    { id: 3, t: "Swim lessons", day: 0, s: 960, e: 1020, who: ["s", "x"], icon: "person_swimming.webp", place: "Community pool" },
    { id: 4, t: "Parent–teacher interviews (bring report cards)", day: 0, s: 1080, e: 1140, who: ["c", "a"], icon: "teacher.webp", place: "Riverdale P.S." },
    { id: 5, t: "Hockey practice", day: 1, s: 420, e: 480, who: ["x"], icon: "ice_hockey.png" },
    { id: 6, t: "Grandma's birthday dinner", day: 2, s: 1020, e: 1200, who: ["c", "a", "s", "x"], icon: "birthday_cake.png" },
    { id: 7, t: "Piano", day: 3, s: 900, e: 960, who: ["s"], icon: "musical_note.png" },
  ],
  todos: [
    { t: "Call the plumber about the kitchen sink", who: "c", today: true },
    { t: "Renew passport", who: "a" },
    { t: "Book summer camp", who: "a", today: true },
    { t: "Return library books", who: "s", today: true },
    { t: "Fix bike tire", who: "x" },
  ],
  chores: [
    { t: "Feed the cat", who: "s", icon: "cat.webp", done: true },
    { t: "Take out recycling", who: "x", icon: "recycling_symbol.webp" },
    { t: "Rake the leaves", who: "c", icon: "fallen_leaf.png" },
    { t: "Water the plants", who: "a", icon: "potted_plant.png" },
  ],
  routines: [
    { who: "s", t: "Morning routine", done: 4, total: 6, next: "Brush teeth" },
    { who: "x", t: "Morning routine", done: 2, total: 6, next: "Get dressed" },
  ],
  meals: [
    { day: "Sat", t: "Sheet-pan chicken fajitas", icon: "taco.png", cook: "c", today: true },
    { day: "Sun", t: "Spaghetti and meatballs", icon: "spaghetti.webp", cook: "a" },
    { day: "Mon", t: "Grandma's birthday dinner", icon: "birthday_cake.png", cook: null, note: "Out" },
    { day: "Tue", t: "Slow-cooker beef stew", icon: "pot_of_food.webp", cook: "c" },
    { day: "Wed", t: "Fish tacos", icon: "taco.png", cook: "a" },
    { day: "Thu", t: "Leftovers night", icon: "shallow_pan_of_food.webp", cook: null },
    { day: "Fri", t: "Homemade pizza", icon: "shallow_pan_of_food.webp", cook: "x" },
  ],
  week: [ // Sun 15 .. Sat 21 would be next week; we show Sun 8 .. Sat 14? Use the coming 7 days from today.
    { d: "Sat", n: 14 }, { d: "Sun", n: 15 }, { d: "Mon", n: 16 }, { d: "Tue", n: 17 }, { d: "Wed", n: 18 }, { d: "Thu", n: 19 }, { d: "Fri", n: 20 },
  ],
  nav: [
    { id: "home", label: "Today", icon: "house_with_garden.png" },
    { id: "calendar", label: "Calendar", icon: "spiral_calendar.webp" },
    { id: "planner", label: "Planner", icon: "clipboard.webp" },
    { id: "routines", label: "Routines", icon: "alarm_clock.webp" },
    { id: "lists", label: "Lists", icon: "memo.png" },
    { id: "chores", label: "Chores", icon: "broom.png" },
    { id: "meals", label: "Meals", icon: "fork_and_knife_with_plate.png" },
    { id: "habits", label: "Habits", icon: "bar_chart.webp" },
    { id: "settings", label: "Settings", icon: "gear.webp" },
  ],
};
window.P = (id) => D.people.find((p) => p.id === id);
window.img = (f, cls = "e") => `<img class="${cls}" src="../assets/${f}" alt="">`;
window.hm = (m) => { const h = Math.floor(m / 60), mm = m % 60, h12 = ((h + 11) % 12) + 1; return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""}`; };
window.ap = (m) => (m < 720 ? "am" : "pm");
window.range = (e) => `${hm(e.s)}${ap(e.s) !== ap(e.e) ? " " + ap(e.s) : ""}–${hm(e.e)} ${ap(e.e)}`;
window.initial = (p) => p.name[0];
window.avatar = (p, cls = "av") => p.icon ? `<span class="${cls} av-pic" style="--pc:var(--p-${p.col});--ps:var(--p-${p.col}-soft)">${img(p.icon)}</span>` : `<span class="${cls}" style="--pc:var(--p-${p.col});--ps:var(--p-${p.col}-soft)">${initial(p)}</span>`;
window.I = { // tiny inline icons (Phosphor-like strokes)
  plus: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  left: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  close: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  pin: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  sidebar: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9 4.5v15"/></svg>',
  repeat: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/></svg>',
};
window.render = (sel, html) => { document.querySelector(sel).innerHTML = html; };
