// Dev-only sample household for the Glance redesign.
//
//   node --env-file=.env.local scripts/dev/seed-sample.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// SUPABASE_SERVICE_ROLE_KEY (local only). SEED_PASSWORD is optional.
//
// What it does, every run (safe to run again):
//   1. Deletes the login glance@example.test and every household it had.
//   2. Makes the login again (email confirmed) and signs in as it.
//   3. Calls create_household, exactly like the app's /setup page, so the
//      database's own starter triggers run (theme, routines, menu, holidays,
//      lists, Free day, …).
//   4. Adds the family and sample data dated around TODAY in Toronto time,
//      so every screen has something to show, like the Glance mockups.
//
// Never point this at a real project: it refuses any URL that isn't local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = "glance@example.test";
const PASSWORD = process.env.SEED_PASSWORD || "glance-local-only";
const HOUSEHOLD_NAME = "The Glance Family";
const TZ = "America/Toronto";

if (!URL_ || !SERVICE_KEY || !PUBLIC_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL_)) {
  console.error(`Refusing to seed ${URL_}: this script is for the local Supabase only.`);
  process.exit(1);
}

const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Throws on a Supabase error, returns data. */
function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
async function insert(table, rows, select = "id") {
  const many = Array.isArray(rows);
  if (many && rows.length === 0) return [];
  // Rows in one call may leave out different columns: those get their defaults.
  const q = admin.from(table).insert(rows, { defaultToNull: false }).select(select);
  const data = must(await q, `insert ${table}`);
  return many ? data : data[0];
}

const pad = (n) => String(n).padStart(2, "0");
/** Minutes from UTC for an instant in a time zone. */
function tzOffsetMs(ms, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms;
}
/** A local date ("2026-11-15") and time ("09:30") in Toronto → a Date. */
function at(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [H, M] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, H, M);
  let t = guess - tzOffsetMs(guess, TZ);
  const again = guess - tzOffsetMs(t, TZ);
  if (again !== t) t = again;
  return new Date(t);
}
function localNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute };
}
function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const RRULE_DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Every emoji used here should have a bundled Fluent picture.
// (Read as text: src/lib/emoji-data.ts is TypeScript.)
const KNOWN_EMOJI = new Set(
  [...readFileSync(new URL("../../src/lib/emoji-data.ts", import.meta.url), "utf8").matchAll(/^\s*\["([^"]+)", "/gm)].map((m) => m[1].replace(/\uFE0F/g, "")),
);
const missingEmoji = new Set();
function e(emoji) {
  if (emoji && !KNOWN_EMOJI.has(emoji.replace(/️/g, "").trim())) missingEmoji.add(emoji);
  return emoji;
}

// ---------------------------------------------------------------------------
// 1–3. Login and household
// ---------------------------------------------------------------------------

async function resetLogin() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of (data?.users ?? []).filter((u) => u.email === EMAIL)) {
    const logins = must(await admin.from("household_logins").select("household_id").eq("auth_user_id", user.id), "read logins");
    for (const { household_id } of logins) must(await admin.from("households").delete().eq("id", household_id), "delete household");
    must(await admin.auth.admin.deleteUser(user.id), "delete login");
  }
  must(await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }), "create login");
  const user = createClient(URL_, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await user.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }), "sign in");
  const householdId = must(await user.rpc("create_household", { household_name: HOUSEHOLD_NAME }), "create_household");
  return { user, householdId };
}

// ---------------------------------------------------------------------------
// 4. Sample data
// ---------------------------------------------------------------------------

async function seed() {
  const { user, householdId: H } = await resetLogin();
  const { date: today, minutes: nowMin } = localNow();
  const weekStart = addDays(today, -weekdayOf(today)); // weeks start on Sunday (the default setting)
  const comingWeek = addDays(weekStart, 7);
  const monthStart = today.slice(0, 8) + "01";
  const todayDay = +today.slice(8);

  // Settings: the defaults already match (Toronto, Sunday weeks, handwriting on); just say so.
  const hh = must(await admin.from("households").select("settings").eq("id", H).single(), "read settings");
  must(await admin.from("households").update({ settings: { ...hh.settings, timeZone: TZ, weekStartsOn: 0, handwriting: true } }).eq("id", H), "settings");

  // --- People -------------------------------------------------------------
  const people = await insert(
    "members",
    [
      { household_id: H, name: "Connor", role: "parent", colour: "blue", birth_year: 1984, sort_order: 0 },
      { household_id: H, name: "Alexandra", role: "parent", colour: "pink", birth_year: 1986, sort_order: 1 },
      { household_id: H, name: "Sam", role: "child", colour: "teal", birth_year: 2016, sort_order: 2, icon: e("🦊") },
      { household_id: H, name: "Christopher", role: "child", colour: "purple", birth_year: 2018, sort_order: 3 },
    ],
    "id, name",
  );
  const P = Object.fromEntries(people.map((p) => [p.name, p.id]));
  const { Connor: C, Alexandra: A, Sam: S, Christopher: X } = P;
  // Parent PINs go through the app's own function (it hashes them).
  must(await user.rpc("set_member_pin", { member_id: C, pin: "1234" }), "Connor PIN");
  must(await user.rpc("set_member_pin", { member_id: A, pin: "5678" }), "Alexandra PIN");

  // Kinds of day: the members trigger gave everyone Weekday + Weekend. Add
  // School day naming for the kids and a PA day kind.
  const dayTypes = must(await admin.from("day_types").select("id, member_id, name").eq("household_id", H), "day types");
  const dt = (member, name) => dayTypes.find((d) => d.member_id === member && d.name === name)?.id;
  for (const kid of [S, X]) {
    must(await admin.from("day_types").update({ name: "School day", icon: e("🎒") }).eq("id", dt(kid, "Weekday")), "rename school day");
    must(await admin.from("day_types").update({ name: "Free day", icon: e("🏡") }).eq("id", dt(kid, "Weekend")), "rename free day");
  }
  for (const adult of [C, A]) {
    must(await admin.from("day_types").update({ name: "Work day", icon: e("💼"), errands: false }).eq("id", dt(adult, "Weekday")), "rename work day");
    must(await admin.from("day_types").update({ name: "Family day", icon: e("🏡"), errands: true }).eq("id", dt(adult, "Weekend")), "rename family day");
  }
  await insert(
    "day_types",
    [S, X].map((m) => ({ household_id: H, member_id: m, name: "PA day", icon: e("🏫"), wake_time: "07:30", bed_time: "20:00", sort_order: 3 })),
    "id, member_id",
  );
  const refreshed = must(await admin.from("day_types").select("id, member_id, name").eq("household_id", H), "day types again");
  const typeOf = (member, name) => refreshed.find((d) => d.member_id === member && d.name === name)?.id;

  // --- Routines -------------------------------------------------------------
  const templates = must(await admin.from("routine_templates").select("id, name").eq("household_id", H), "routines");
  const tpl = (name) => templates.find((t) => t.name === name).id;
  const assign = [];
  for (const kid of [S, X]) {
    for (const r of ["School morning", "After school", "Bedtime"]) assign.push({ template_id: tpl(r), member_id: kid, day_type_id: typeOf(kid, "School day") });
    for (const r of ["Weekend morning", "Bedtime"]) assign.push({ template_id: tpl(r), member_id: kid, day_type_id: typeOf(kid, "Free day") });
    for (const r of ["Weekend morning", "Bedtime"]) assign.push({ template_id: tpl(r), member_id: kid, day_type_id: typeOf(kid, "PA day") });
  }
  for (const adult of [C, A]) for (const k of ["Work day", "Family day"]) assign.push({ template_id: tpl("Evening reset"), member_id: adult, day_type_id: typeOf(adult, k) });
  await insert("routine_assignments", assign.map((a) => ({ household_id: H, ...a })));
  // A few routine steps on the Daily List; a couple already ticked today.
  const steps = must(await admin.from("routine_steps").select("id, text, template_id").eq("household_id", H), "steps");
  const step = (tname, text) => steps.find((s) => s.template_id === tpl(tname) && s.text === text)?.id;
  for (const [t, s] of [["Weekend morning", "Tidy bedroom"], ["Evening reset", "Pack lunches"], ["Bedtime", "Story"]]) {
    must(await admin.from("routine_steps").update({ daily_list: true }).eq("id", step(t, s)), "daily list step");
  }
  const weekendKids = weekdayOf(today) === 0 || weekdayOf(today) === 6 ? "Weekend morning" : "School morning";
  const tickable = steps.filter((s) => s.template_id === tpl(weekendKids)).slice(0, 3);
  await insert("routine_checks", tickable.map((s) => ({ household_id: H, member_id: S, step_id: s.id, check_date: today })));

  // A family routine (Connor's morning) with its own steps.
  const coffee = await insert("routine_templates", { household_id: H, name: "Morning kitchen", kind: "morning", audience: "adult", anchor: "wake", anchor_offset: 10, usual_minutes: 30 });
  await insert(
    "routine_steps",
    [
      ["Start the coffee", "☕"],
      ["Empty the dishwasher", "🍽️"],
      ["Check the calendar", "📅"],
      ["Make lunches", "🥪"],
    ].map(([text, icon], i) => ({ household_id: H, template_id: coffee.id, text, icon: e(icon), position: i })),
  );
  await insert("routine_assignments", [{ household_id: H, template_id: coffee.id, member_id: C, day_type_id: typeOf(C, "Work day") }]);

  // --- Events ---------------------------------------------------------------
  const eventMembers = [];
  async function event({ title, icon, date, start, end, minutes = 60, allDay = false, endDate, who = [], rule = null, dayKind = null, notes = null, visibility = "everyone" }) {
    let starts, ends;
    if (allDay) {
      starts = at(date, "00:00");
      ends = at(addDays(endDate ?? date, 1), "00:00");
    } else {
      starts = at(date, start);
      ends = end ? at(endDate ?? date, end) : new Date(starts.getTime() + minutes * 60000);
    }
    const row = await insert("events", {
      household_id: H,
      title,
      icon: icon ? e(icon) : null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      all_day: allDay,
      timezone: TZ,
      recurrence_rule: rule,
      day_kind: dayKind,
      notes,
      visibility,
    });
    for (const m of who) eventMembers.push({ household_id: H, event_id: row.id, member_id: m });
    return row.id;
  }

  // Today: times hang off "now" so some are finished and one is "in 20 min".
  const anchor = Math.min(Math.max(Math.round(nowMin / 15) * 15, 10 * 60), 15 * 60);
  const T = (offset) => hhmm(anchor + offset);
  const dentist = await event({ title: "Dentist appointment downtown with Dr. Kowalczyk", icon: "🦷", date: today, start: T(-150), minutes: 60, who: [C], notes: "Bloor St W" });
  await event({ title: "Team standup", icon: "📅", date: today, start: T(-60), minutes: 30, who: [A] });
  await event({ title: "Pick up the coats", icon: "🧥", date: today, start: T(20), minutes: 30, who: [C] });
  await event({ title: "Swim lessons", icon: "🏊", date: today, start: T(120), minutes: 60, who: [S, X], notes: "Community pool" });
  await event({ title: "Parent–teacher interviews (bring report cards)", icon: "🧑‍🏫", date: today, start: T(240), minutes: 60, who: [C, A], notes: "Riverdale P.S." });
  await event({ title: "Evening walk", icon: "🚶", date: today, start: T(330), minutes: 45, who: [A] });
  // Today's all-day strip: a kind-of-day item and user all-day items.
  await event({ title: "PA day", icon: "🏫", date: today, allDay: true, who: [S, X], dayKind: "PA day" });
  await event({ title: "Recycling pickup", icon: "♻️", date: today, allDay: true, who: [C] });
  await event({ title: "Library books due", icon: "📚", date: today, allDay: true, who: [S] });

  // The rest of the month (and a bit either side for week / rolling month views).
  const at3 = (d) => addDays(today, d);
  await event({ title: "Hockey practice", icon: "🏒", date: at3(1), start: "07:00", minutes: 60, who: [X] });
  await event({ title: "Grandma's birthday dinner", icon: "🎂", date: at3(2), start: "17:00", end: "20:00", who: [C, A, S, X] });
  await event({ title: "Costco run", icon: "🛒", date: at3(3), start: "10:30", minutes: 90, who: [C] });
  await event({ title: "Haircut", icon: "💇", date: at3(4), start: "16:15", minutes: 45, who: [S] });
  await event({ title: "Book club", icon: "📚", date: at3(5), start: "19:30", minutes: 120, who: [A] });
  await event({ title: "Field trip to the science centre", icon: "🔬", date: at3(6), start: "09:00", end: "14:30", who: [X] });
  await event({ title: "Movie night", icon: "🍿", date: at3(6), start: "19:00", minutes: 120, who: [] });
  await event({ title: "Vet check-up for Biscuit", icon: "🐶", date: at3(8), start: "11:00", minutes: 45, who: [A] });
  await event({ title: "Soccer tryouts", icon: "⚽", date: at3(9), start: "17:30", minutes: 90, who: [S] });
  await event({ title: "Date night", icon: "🍷", date: at3(11), start: "19:00", minutes: 150, who: [C, A], visibility: "adults" });
  await event({ title: "Cottage weekend", icon: "🏕️", date: at3(12), endDate: at3(13), allDay: true, who: [C, A, S, X] });
  await event({ title: "Furnace service", icon: "🔧", date: at3(15), start: "08:00", minutes: 120, who: [C] });
  await event({ title: "Class party", icon: "🎉", date: at3(17), start: "13:00", minutes: 90, who: [S, X] });
  // Earlier this month, so past days have something.
  await event({ title: "Family breakfast", icon: "🥞", date: at3(-7), start: "08:30", minutes: 60, who: [C, A, S, X] });
  await event({ title: "Flu shots", icon: "💉", date: at3(-5), start: "16:00", minutes: 30, who: [S, X] });
  await event({ title: "Parent council", icon: "🏫", date: at3(-4), start: "18:30", minutes: 90, who: [A] });
  await event({ title: "Pumpkin compost day", icon: "🎃", date: at3(-10), allDay: true, who: [] });
  await event({ title: "Dinner at the Patels'", icon: "🍽️", date: at3(-3), start: "18:00", minutes: 150, who: [C, A, S, X] });
  await event({ title: "Bake sale", icon: "🧁", date: at3(-2), allDay: true, who: [A] });
  // Repeating events.
  const fromDay = (n) => addDays(weekStart, n - 14); // started a couple of weeks ago
  await event({ title: "Piano", icon: "🎵", date: fromDay(3), start: "15:30", minutes: 45, who: [S], rule: "FREQ=WEEKLY;BYDAY=WE" });
  await event({ title: "Hockey practice", icon: "🏒", date: fromDay(6), start: "08:00", minutes: 60, who: [X], rule: "FREQ=WEEKLY;BYDAY=SA" });
  await event({ title: "Yoga", icon: "🧘", date: fromDay(2), start: "06:30", minutes: 45, who: [A], rule: "FREQ=WEEKLY;BYDAY=TU,TH" });
  await event({ title: "Garbage night", icon: "🗑️", date: fromDay(weekdayOf(today) === 4 ? 3 : 4), start: "20:00", minutes: 15, who: [C], rule: `FREQ=WEEKLY;BYDAY=${RRULE_DAY[weekdayOf(today) === 4 ? 3 : 4]}` });
  await insert("event_members", eventMembers, "event_id");

  // A heads-up on the dentist (the app makes the to-do from it).
  await insert("heads_ups", { household_id: H, event_id: dentist, label: "Bring the insurance card", minutes_before: 720, makes: "todo", assignee_id: C });

  // Event templates for the Add sheet.
  await insert(
    "event_templates",
    [
      { title: "Swim lessons", icon: "🏊", start_time: "16:00", minutes: 60, member_ids: [S, X], sort_order: 0 },
      { title: "Dentist", icon: "🦷", start_time: "09:00", minutes: 60, member_ids: [], sort_order: 1 },
      { title: "Date night", icon: "🍷", start_time: "19:00", minutes: 150, member_ids: [C, A], sort_order: 2 },
      { title: "Playdate", icon: "🧸", start_time: "14:00", minutes: 120, member_ids: [], sort_order: 3 },
      { title: "PA day", icon: "🏫", all_day: true, minutes: 0, member_ids: [S, X], day_kind: "PA day", sort_order: 4 },
    ].map((t) => ({ household_id: H, ...t, icon: e(t.icon) })),
  );

  // --- Holidays and birthdays ----------------------------------------------
  // The starter list (Remembrance Day, Christmas, …) is already there. Add one
  // on a day in this month that isn't today.
  const holidayDay = todayDay <= 20 ? todayDay + 7 : todayDay - 7;
  await insert("holidays", { household_id: H, name: "Friendsgiving", icon: e("🦃"), rule: { kind: "fixed", month: +today.slice(5, 7), day: holidayDay }, sort_order: 99 });
  const md = (d) => ({ month: +d.slice(5, 7), day: +d.slice(8, 10) });
  await insert("birthdays", [
    { household_id: H, name: "Leo", icon: e("🎂"), ...md(today) },
    { household_id: H, name: "Grandma", icon: e("💐"), ...md(at3(2)), birth_year: 1951 },
    { household_id: H, name: "Sam", icon: e("🦊"), ...md(at3(10)), birth_year: 2016 },
  ]);

  // --- Lists, Daily List, groceries -----------------------------------------
  const lists = must(await admin.from("task_lists").select("id, name, is_chores, is_groceries").eq("household_id", H), "lists");
  const listId = (name) => lists.find((l) => l.name === name).id;
  const more = await insert(
    "task_lists",
    [
      ["Hardware", "🔨"],
      ["Packing", "🧳"],
      ["Birthday", "🎁"],
      ["Christmas", "🎄"],
      ["School trips", "🚌"],
      ["Party food", "🍕"],
      ["Library holds", "📚"],
    ].map(([name, icon], i) => ({ household_id: H, name, icon: e(icon), sort_order: 10 + i })),
    "id, name",
  );
  for (const l of more) lists.push(l);
  const todo = listId("To-do");
  const task = (t) => ({ household_id: H, list_id: todo, date_kind: "start", status: "open", ...t, icon: t.icon ? e(t.icon) : null });
  await insert("task_instances", [
    // On today's Daily List.
    task({ title: "Call the plumber about the kitchen sink", icon: "🔧", assignee_id: C, due_date: today }),
    task({ title: "Book summer camp", icon: "⛺", due_date: today }),
    task({ title: "Return library books", icon: "📚", assignee_id: S, due_date: today }),
    task({ title: "Order Grandma's cake", icon: "🎂", assignee_id: A, due_date: today, at_time: hhmm(Math.min(anchor + 90, 21 * 60)) }),
    task({ title: "Pack the swim bag", icon: "🎒", assignee_id: X, due_date: today }),
    task({ title: "Water the plants", icon: "🪴", assignee_id: A, due_date: at3(-1) }), // carried over
    task({ title: "Sign the field trip form", assignee_id: C, due_date: at3(6), date_kind: "due", lead_days: 7 }),
    // On the list, no date yet.
    task({ title: "Renew passport", assignee_id: A }),
    task({ title: "Fix bike tire", icon: "🚲", assignee_id: X }),
    task({ title: "Hang the new shelf" }),
    // Done.
    task({ title: "Buy birthday card", icon: "💌", assignee_id: A, due_date: at3(-1), status: "done", completed_on: at3(-1), completed_at: at(at3(-1), "15:00").toISOString(), completed_by: A }),
    // Other lists.
    { household_id: H, list_id: listId("Errands"), title: "Drop off dry cleaning", icon: e("👔"), assignee_id: C, due_date: at3(1), date_kind: "start" },
    { household_id: H, list_id: listId("Errands"), title: "Return the folding chairs", assignee_id: null },
    ...["Wood screws", "Furnace filter 16×25", "Light bulbs", "Weatherstripping"].map((title, i) => ({ household_id: H, list_id: listId("Hardware"), title, assignee_id: i === 1 ? C : null })),
    ...["Swimsuits", "Snow pants", "Phone chargers", "Board games"].map((title, i) => ({ household_id: H, list_id: listId("Packing"), title, assignee_id: [S, X, C, null][i] })),
    ...["Lego set for Leo", "Wrapping paper", "Candles"].map((title) => ({ household_id: H, list_id: listId("Birthday"), title })),
    ...["Advent calendars", "Outdoor lights", "Cards for the teachers"].map((title, i) => ({ household_id: H, list_id: listId("Christmas"), title, assignee_id: i === 2 ? A : null })),
    { household_id: H, list_id: listId("Chores"), title: "Clean out the garage", icon: e("🧹"), tags: ["big"] },
    { household_id: H, list_id: listId("Chores"), title: "Wash the car", icon: e("🚗"), tags: ["outdoor"] },
  ]);

  // Items (the grocery catalogue) — make or reuse by name.
  const itemRows = must(await admin.from("items").select("id, name").eq("household_id", H), "items");
  const items = new Map(itemRows.map((i) => [i.name.toLowerCase(), i.id]));
  async function item(name, aisle = "Other", icon = null) {
    const key = name.toLowerCase();
    if (!items.has(key)) items.set(key, (await insert("items", { household_id: H, name, aisle, icon: icon ? e(icon) : null })).id);
    return items.get(key);
  }

  // --- Dishes, meals, backups ----------------------------------------------
  const recipes = must(await admin.from("recipes").select("id, name").eq("household_id", H), "recipes");
  const recipe = (name) => recipes.find((r) => r.name === name)?.id;
  async function ingredients(dish, list) {
    const rid = recipe(dish);
    must(await admin.from("recipe_ingredients").delete().eq("recipe_id", rid), "clear ingredients");
    const rows = [];
    for (const [i, [name, aisle, amount, unit]] of list.entries()) rows.push({ household_id: H, recipe_id: rid, item_id: await item(name, aisle), amount, unit, position: i });
    await insert("recipe_ingredients", rows);
  }
  await ingredients("Beef tacos", [
    ["Ground beef", "Meat", 500, "g"],
    ["Taco shells", "Pantry", 12, null],
    ["Cheddar", "Dairy", 200, "g"],
    ["Lettuce", "Produce", 1, "head"],
    ["Tomatoes", "Produce", 2, null],
    ["Onions", "Produce", 1, null],
    ["Sour cream", "Dairy", 1, "cup"],
  ]);
  await ingredients("Spaghetti", [
    ["Spaghetti noodles", "Pantry", 450, "g"],
    ["Ground beef", "Meat", 500, "g"],
    ["Crushed tomatoes", "Pantry", 1, "can"],
    ["Onions", "Produce", 1, null],
    ["Parmesan", "Dairy", 50, "g"],
  ]);
  await ingredients("Chicken stir-fry", [
    ["Chicken breasts", "Meat", 600, "g"],
    ["Bell peppers", "Produce", 2, null],
    ["Broccoli", "Produce", 1, "head"],
    ["Soy sauce", "Pantry", 0.25, "cup"],
    ["Rice", "Pantry", 2, "cup"],
  ]);
  await ingredients("Homemade pizza", [
    ["Pizza dough", "Bakery", 2, null],
    ["Mozzarella", "Dairy", 300, "g"],
    ["Pizza sauce", "Pantry", 1, "jar"],
    ["Pepperoni", "Meat", 100, "g"],
  ]);
  await ingredients("Chili", [
    ["Ground beef", "Meat", 500, "g"],
    ["Kidney beans", "Pantry", 2, "can"],
    ["Crushed tomatoes", "Pantry", 1, "can"],
    ["Onions", "Produce", 2, null],
    ["Cheddar", "Dairy", 100, "g"],
  ]);
  await ingredients("Chicken noodle soup", [
    ["Chicken thighs", "Meat", 500, "g"],
    ["Egg noodles", "Pantry", 250, "g"],
    ["Carrots", "Produce", 3, null],
    ["Celery", "Produce", 2, "stalk"],
  ]);
  await ingredients("Pancakes", [
    ["Flour", "Pantry", 2, "cup"],
    ["Eggs", "Dairy", 2, null],
    ["Milk", "Dairy", 1.5, "cup"],
    ["Maple syrup", "Pantry", 1, "bottle"],
  ]);

  // Tonight's fajitas: a full dish with steps and helpers (for Cook mode).
  const kinds = must(await admin.from("dish_kinds").select("id, name").eq("household_id", H), "dish kinds");
  const kind = (n) => kinds.find((k) => k.name === n).id;
  const cats = must(await admin.from("meal_categories").select("id, name").eq("household_id", H), "meal kinds");
  const cat = (n) => cats.find((c) => c.name === n)?.id;
  const fajitas = await insert("recipes", {
    household_id: H,
    name: "Sheet-pan chicken fajitas",
    icon: e("🌮"),
    serves: 4,
    hands_on_minutes: 15,
    total_minutes: 35,
    notes: "Warm the tortillas in the oven for the last 5 minutes.",
  });
  recipes.push({ id: fajitas.id, name: "Sheet-pan chicken fajitas" });
  await insert("recipe_kinds", [{ household_id: H, recipe_id: fajitas.id, kind_id: kind("Main") }], "recipe_id");
  await insert("recipe_categories", [{ household_id: H, recipe_id: fajitas.id, category_id: cat("Tacos") }], "recipe_id");
  await ingredients("Sheet-pan chicken fajitas", [
    ["Chicken breasts", "Meat", 700, "g"],
    ["Bell peppers", "Produce", 3, null],
    ["Onions", "Produce", 1, null],
    ["Fajita seasoning", "Pantry", 2, "tbsp"],
    ["Olive oil", "Pantry", 2, "tbsp"],
    ["Flour tortillas", "Bakery", 8, null],
    ["Sour cream", "Dairy", 0.5, "cup"],
  ]);
  const fajitaSteps = await insert(
    "recipe_steps",
    [
      "Heat the oven to 425°F (220°C) and line a sheet pan.",
      "Slice the chicken, peppers and onion into thin strips.",
      "Toss everything with the oil and seasoning and spread it out on the pan.",
      "Roast for 20 minutes, stirring halfway, until the chicken reaches 165°F (74°C).",
      "Warm the tortillas and serve with sour cream.",
    ].map((text, position) => ({ household_id: H, recipe_id: fajitas.id, position, text })),
    "id, position",
  );
  const stepAt = (n) => fajitaSteps.find((s) => s.position === n).id;
  await insert("step_helpers", [
    { household_id: H, step_id: stepAt(0), kind: "oven", temperature: 220 },
    { household_id: H, step_id: stepAt(3), kind: "timer", minutes: 20, label: "Roast" },
    { household_id: H, step_id: stepAt(3), kind: "doneness", temperature: 74, label: "Chicken" },
  ]);
  const fajitaMeal = await insert("menu_meals", { household_id: H, name: null, icon: null, sort_order: 50 });
  await insert("menu_meal_spots", [{ household_id: H, menu_meal_id: fajitaMeal.id, position: 0, recipe_id: fajitas.id }]);
  await insert("menu_meal_categories", [{ household_id: H, menu_meal_id: fajitaMeal.id, category_id: cat("Tacos") }], "menu_meal_id");

  // Menu meals by their main dish, to plan the weeks.
  const spots = must(await admin.from("menu_meal_spots").select("menu_meal_id, recipe_id, position").eq("household_id", H), "spots");
  const menuFor = (dish) => spots.find((s) => s.position === 0 && s.recipe_id === recipe(dish))?.menu_meal_id ?? null;
  const times = must(await admin.from("meal_times").select("id, name").eq("household_id", H), "meal times");
  const dinner = times.find((t) => t.name === "Dinner").id;
  const lunch = times.find((t) => t.name === "Lunch").id;

  async function meal(date, dish, { cook = null, time = dinner, category = null, name = null, sides = [] } = {}) {
    const rid = dish ? recipe(dish) : null;
    const row = await insert("meals", {
      household_id: H,
      date,
      meal_time_id: time,
      category_id: category ? cat(category) : null,
      menu_meal_id: dish ? menuFor(dish) : null,
      recipe_id: rid,
      cook_id: cook,
      name,
      sort_order: 10,
    });
    const dishes = [rid, ...sides.map(recipe)].filter(Boolean);
    await insert("meal_dishes", dishes.map((recipe_id, position) => ({ household_id: H, meal_id: row.id, recipe_id, position, batches: 1, spot_position: position })));
    return row.id;
  }
  // This week (already reviewed), today = fajitas with no cook assigned.
  const thisWeek = [
    ["Spaghetti", A, "Pasta"],
    ["Chicken stir-fry", C, "Stir-fry"],
    ["Chili", C, "Slow cooker"],
    ["Beef tacos", A, "Tacos"],
    ["Pancakes", null, "Breakfast for dinner"],
    ["Homemade pizza", X, "Pizza"],
    ["Chicken noodle soup", C, "Soup"],
  ];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (date === today) await meal(date, "Sheet-pan chicken fajitas", { category: "Tacos" });
    else {
      const [dish, cook, category] = thisWeek[i];
      await meal(date, dish, { cook, category, sides: dish === "Chili" ? ["Green salad"] : [] });
    }
  }
  await meal(today, "Grilled cheese", { time: lunch, category: "Sandwiches" });
  // The coming week (for the Planner): meals set, not reviewed yet, so the
  // "review what to buy" step has lines (Tacos → Cheddar, Onions from 3 meals).
  const nextWeek = [
    ["Beef tacos", A, "Tacos"],
    ["Spaghetti", C, "Pasta"],
    [null, null, "Leftovers"],
    ["Chili", C, "Slow cooker"],
    ["Sheet-pan chicken fajitas", A, "Tacos"],
    ["Homemade pizza", X, "Pizza"],
    ["Pancakes", null, "Breakfast for dinner"],
  ];
  for (let i = 0; i < 7; i++) {
    const [dish, cook, category] = nextWeek[i];
    await meal(addDays(comingWeek, i), dish, { cook, category });
  }
  must(await admin.from("weekly_reviews").insert({ household_id: H, week_start: weekStart, reviewed_at: at(addDays(weekStart, -1), "09:30").toISOString() }), "this week reviewed");

  // Backups (ready-meal kits).
  for (const [name, icon, parts] of [
    ["Pasta and jar sauce", "🍝", [["Spaghetti noodles", "Pantry", 1, 2, 1], ["Jar of pasta sauce", "Pantry", 1, 0, 1], ["Parmesan", "Dairy", 1, 1, 1]]],
    ["Frozen pizza night", "🍕", [["Frozen pizza", "Frozen", 2, 3, 2]]],
    ["Mac and cheese box", "🧀", [["Boxed mac and cheese", "Pantry", 2, 4, 2], ["Frozen peas", "Frozen", 1, 1, 1]]],
  ]) {
    const r = await insert("recipes", { household_id: H, name, icon: e(icon), is_backup: true, serves: 4 });
    const rows = [];
    for (const [i, [part, aisle, uses, onHand, keep]] of parts.entries()) rows.push({ household_id: H, recipe_id: r.id, item_id: await item(part, aisle), uses, on_hand: onHand, keep_at_least: keep, position: i });
    await insert("backup_parts", rows);
  }

  // This week's grocery list: menu lines (one combined from several meals),
  // hand-added lines, and a couple already ticked.
  const shortDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short" }).format(at(d, "12:00"));
  const later = [1, 2, 3, 4, 5, 6].map((n) => addDays(today, n)).filter((d) => d < comingWeek);
  const dayA = shortDay(later[0] ?? today);
  const dayB = shortDay(later[1] ?? today);
  const grocery = async (name, aisle, extra) => ({ household_id: H, item_id: await item(name, aisle), week_of: weekStart, status: "approved", ...extra });
  await insert("shopping_list", [
    await grocery("Onions", "Produce", { amount: 3, source: "meal", detail: "Chili, Beef tacos", parts: [{ label: `Chili · ${dayA}`, amount: 2, unit: null }, { label: `Beef tacos · ${dayB}`, amount: 1, unit: null }] }),
    await grocery("Ground beef", "Meat", { amount: 1000, unit: "g", source: "meal", detail: "Chili, Beef tacos", parts: [{ label: `Chili · ${dayA}`, amount: 500, unit: "g" }, { label: `Beef tacos · ${dayB}`, amount: 500, unit: "g" }] }),
    await grocery("Kidney beans", "Pantry", { amount: 2, unit: "can", source: "meal", detail: "Chili", parts: [{ label: `Chili · ${dayA}`, amount: 2, unit: "can" }] }),
    await grocery("Taco shells", "Pantry", { amount: 12, source: "meal", detail: "Beef tacos", parts: [{ label: `Beef tacos · ${dayB}`, amount: 12, unit: null }] }),
    await grocery("Bell peppers", "Produce", { amount: 3, source: "meal", detail: "Sheet-pan chicken fajitas", parts: [{ label: `Sheet-pan chicken fajitas · ${shortDay(today)}`, amount: 3, unit: null }] }),
    await grocery("Apples", "Produce", { amount: 6, source: "manual" }),
    await grocery("Coffee beans", "Pantry", { source: "manual" }),
    await grocery("Dish soap", "Other", { source: "manual" }),
    await grocery("Yogurt", "Dairy", { amount: 2, unit: "tub", source: "manual" }),
    await grocery("Frozen peas", "Frozen", { source: "manual", checked: true, checked_at: at(at3(-1), "18:00").toISOString() }),
    await grocery("Ice cream", "Frozen", { source: "manual", checked: true, checked_at: at(at3(-1), "18:00").toISOString() }),
  ]);
  // One more repeating grocery besides the starter milk/eggs/bread/bananas.
  await insert("grocery_repeats", { household_id: H, item_id: await item("Coffee beans", "Pantry"), every: 2, every_unit: "week", next_on: at3(4) });

  // --- Chores -----------------------------------------------------------------
  const wd = weekdayOf(today);
  const midweek = [3];
  if (![0, 3, 5, 6].includes(wd)) midweek.push(wd); // make sure today has a chore day
  const choreDays = await insert(
    "chore_days",
    [
      { name: "Friday recycling", icon: "♻️", weekdays: [5], max_tasks: 2, max_big: 0, sort_order: 1 },
      { name: "Midweek house", icon: "🧽", weekdays: midweek, max_tasks: 2, max_big: 0, sort_order: 2 },
      { name: "Saturday jobs", icon: "🧹", weekdays: [6], max_tasks: 4, max_big: 1, errands: true, sort_order: 3 },
      { name: "Sunday reset", icon: "🧺", weekdays: [0], max_tasks: 3, max_big: 1, sort_order: 4 },
    ].map((d) => ({ household_id: H, ...d, icon: e(d.icon) })),
    "id, name",
  );
  const cd = (n) => choreDays.find((d) => d.name === n).id;
  const regular = [
    ["Friday recycling", "Put the bins out", "🗑️", C, "19:00"],
    ["Friday recycling", "Rinse the recycling", "♻️", X, null],
    ["Midweek house", "Wipe the bathroom", "🧽", A, null],
    ["Midweek house", "Feed the fish", "🐟", S, null],
    ["Saturday jobs", "Vacuum the living room", "🧹", C, null],
    ["Saturday jobs", "Change the sheets", "🛏️", A, null],
    ["Sunday reset", "Laundry", "🧺", A, null],
    ["Sunday reset", "Tidy your room", "🧸", S, null],
    ["Sunday reset", "Feed the cat", "🐈", X, "08:00"],
    ["Sunday reset", "Water the plants", "🪴", C, null],
  ];
  for (const [i, [day, name, icon, who, time]] of regular.entries()) {
    const t = await insert("task_templates", { household_id: H, kind: "preset", name, icon: e(icon), default_assignee_id: who, at_time: time, snap: "none", repeat_every: 1, repeat_unit: "week", repeat_from: "done", sort_order: i });
    await insert("task_template_chore_days", [{ household_id: H, template_id: t.id, chore_day_id: cd(day) }], "template_id");
  }
  const occasional = [
    { name: "Rake the leaves", icon: "🍂", default_assignee_id: C, repeat_every: 1, repeat_unit: "week", tags: ["outdoor", "big"], only_seasons: ["fall"], first_due: at3(0) },
    { name: "Clean the fridge", icon: "🧊", default_assignee_id: A, repeat_every: 1, repeat_unit: "month", tags: [], first_due: at3(3) },
    { name: "Change the furnace filter", icon: "🔧", default_assignee_id: C, repeat_every: 3, repeat_unit: "month", tags: ["essential"], first_due: at3(6) },
    { name: "Wash the windows", icon: "🪟", default_assignee_id: null, repeat_every: 2, repeat_unit: "month", tags: ["big"], first_due: at3(9) },
    { name: "Drop off donations", icon: "🛍️", default_assignee_id: A, repeat_every: 6, repeat_unit: "week", tags: ["errand"], first_due: at3(5) },
  ];
  for (const [i, o] of occasional.entries()) {
    await insert("task_templates", { household_id: H, kind: "generated", snap: "none", repeat_from: "done", sort_order: 20 + i, ...o, icon: e(o.icon) });
  }

  // --- Habits and health -------------------------------------------------------
  const habitDefs = [
    { name: "Read for 20 minutes", icon: "📖", who: [S, X], frequency: "daily" },
    { name: "Practise piano", icon: "🎹", who: [S], frequency: "days", weekdays: [1, 3, 5] },
    { name: "Drink water", icon: "💧", who: [C, A], measure: "count", goal: 8, unit: "glasses" },
    { name: "Stretch", icon: "🧘", who: [A], frequency: "week", times: 3 },
    { name: "Walk 30 minutes", icon: "🚶", who: [C], frequency: "daily" },
  ];
  const since = addDays(monthStart, -30);
  const logs = [];
  for (const [i, h] of habitDefs.entries()) {
    const row = await insert("habits", {
      household_id: H,
      name: h.name,
      icon: e(h.icon),
      measure: h.measure ?? "check",
      goal: h.goal ?? 1,
      unit: h.unit ?? null,
      frequency: h.frequency ?? "daily",
      weekdays: h.weekdays ?? [],
      times: h.times ?? 1,
      since,
      sort_order: i,
    });
    await insert("habit_members", h.who.map((member_id) => ({ household_id: H, habit_id: row.id, member_id })), "habit_id");
    for (const m of h.who) {
      for (let d = -40; d <= 0; d++) {
        const date = addDays(today, d);
        // A steady pattern with a few misses, the latest days kept going (a streak).
        const seed = (i * 7 + d * 3 + m.charCodeAt(0)) % 10;
        if (d < -6 && seed < 2) continue;
        if (h.frequency === "days" && !h.weekdays.includes(weekdayOf(date))) continue;
        if (h.frequency === "week" && ![1, 3, 5].includes(weekdayOf(date))) continue;
        if (d === 0 && i % 2 === 1) continue; // not every habit done yet today
        logs.push({ household_id: H, habit_id: row.id, member_id: m, log_date: date, amount: h.measure === "count" ? (d === 0 ? 3 : 8 + (seed % 3)) : 1 });
      }
    }
  }
  await insert("habit_logs", logs);

  const vitamin = await insert("health_trackers", { household_id: H, name: "Vitamin D", icon: e("💊"), kind: "medicine", sort_order: 0 });
  const meds = await insert("health_trackers", { household_id: H, name: "Fever medicine", icon: e("🌡️"), kind: "medicine", sort_order: 1 });
  const temp = await insert("health_trackers", { household_id: H, name: "Temperature", icon: e("🌡️"), kind: "number", unit: "°C", alert_above: 38.5, sort_order: 2 });
  await insert("health_tracker_members", [S, X].flatMap((m) => [vitamin.id, meds.id, temp.id].map((tracker_id) => ({ household_id: H, tracker_id, member_id: m }))), "tracker_id");
  const [vitD] = await insert("health_choices", [{ household_id: H, tracker_id: vitamin.id, name: "Vitamin D drops", icon: e("💧"), wait_minutes: 1200, max_per_day: 1 }]);
  const [tylenol, advil] = await insert("health_choices", [
    { household_id: H, tracker_id: meds.id, name: "Children's Tylenol", wait_minutes: 240, max_per_day: 5, sort_order: 0 },
    { household_id: H, tracker_id: meds.id, name: "Children's Advil", wait_minutes: 360, max_per_day: 4, sort_order: 1 },
  ]);
  await insert(
    "health_choice_amounts",
    [
      { choice_id: vitD.id, member_id: S, amount: "1 drop" },
      { choice_id: vitD.id, member_id: X, amount: "1 drop" },
      { choice_id: tylenol.id, member_id: S, amount: "10 ml" },
      { choice_id: tylenol.id, member_id: X, amount: "7.5 ml" },
      { choice_id: advil.id, member_id: S, amount: "10 ml" },
      { choice_id: advil.id, member_id: X, amount: "7.5 ml" },
    ].map((r) => ({ household_id: H, ...r })),
    "choice_id",
  );
  await insert("health_logs", [
    ...[-2, -1].flatMap((d) => [S, X].map((m) => ({ household_id: H, tracker_id: vitamin.id, member_id: m, choice_id: vitD.id, choice_name: "Vitamin D drops", amount: "1 drop", logged_at: at(at3(d), "08:15").toISOString() }))),
    { household_id: H, tracker_id: meds.id, member_id: X, choice_id: tylenol.id, choice_name: "Children's Tylenol", amount: "7.5 ml", logged_at: at(at3(-1), "19:30").toISOString() },
    { household_id: H, tracker_id: temp.id, member_id: X, value: 38.1, logged_at: at(at3(-1), "19:25").toISOString() },
    { household_id: H, tracker_id: temp.id, member_id: X, value: 37.2, logged_at: at(today, hhmm(Math.max(nowMin - 60, 7 * 60))).toISOString(), note: "Feeling better" },
  ]);

  // --- A kitchen app for the launcher tier ------------------------------------
  await insert("launcher_apps", [
    { household_id: H, name: "YouTube Kids", icon: e("📺"), colour: "pink", kind: "web", address: "https://www.youtubekids.com", sort_order: 0 },
    { household_id: H, name: "Weather", icon: e("🌤️"), colour: "blue", kind: "web", address: "https://weather.gc.ca", sort_order: 1 },
  ]);

  return { H, today, nowMin, anchor };
}

const started = Date.now();
const { H, today, anchor } = await seed();
console.log(`Seeded "${HOUSEHOLD_NAME}" (${H}) for ${today}, today's events around ${hhmm(anchor)}, in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
console.log(`Sign in at http://localhost:3100/login as ${EMAIL} / ${process.env.SEED_PASSWORD ? "$SEED_PASSWORD" : PASSWORD}`);
if (missingEmoji.size) console.warn(`Emoji with no bundled picture (shown as plain emoji): ${[...missingEmoji].join(" ")}`);
