# Glance utility screens — feature parity with live Almanac

Read-only pass of `/workspace/Almanac/src/app/**` and related components, 15 Nov 2026 (America/Toronto). The Almanac repo was not modified. Coverage marks below are for the Glance A mocks in `glance/src/g-final-*.html` **after** the 15 Nov feature-restore pass, unless a row says otherwise.

Marks: **Yes** = shown in the mock in a usable way. **Partial** = the control or idea is present but not the full live interaction. **No** = live feature not in the mock (listed for discussion). **N/A** = live route redirects, or the feature is not meant for this screen. **Added** = Connor asked for it; it is not in the live app yet.

Locked Glance A rules still apply on every mock: no avatars (colour chips, bars, or dots instead), no weather on utility pages, streaks/rings/history only on Habits/Health, printed Atkinson + Figtree digits except handwritten list item names (Shantell, person ink, black if unassigned), cook/recipe steps printed and large, first view does not scroll.

---

## Menu tray — `components/menu-tray.tsx`

Live: a hidden handle at the bottom centre; tap or swipe up opens the tray. Eight sections: Calendar (returns to last Agenda/Week/Month), Planner, Routines, Lists, Chores, Meals, Habits, Settings. Current section is highlighted. Auto-hides after 30s with no touches, on section pick, tap outside, or Escape. On the kitchen PC only, a second drag/tap reveals a launcher apps tier (phone-home-screen tiles, launch errors). Handle is a short bar with a larger hit target.

| Feature | Coverage |
|---|---|
| Bottom-centre handle; tap opens first tier | Yes |
| Eight section buttons, current (Calendar) on | Yes |
| Light scrim; tap outside closes | Yes |
| Close chevron on the tray edge | Yes |
| Escape / auto-hide after idle | Partial (implied, not animated in a still) |
| Swipe/drag between tiers | No (still) |
| Kitchen-PC apps second tier | No — only that PC runs the launcher helper. One still shows the first tier. |

Mock: `g-final-tray.html`.

---

## Calendar → Week — `calendar/week.tsx`, `calendar/week-scroll.tsx`, `components/draggable-event.tsx`

Live (main): a timeline per day; event blocks drag up/down (15-minute snap) and sideways to another day, the bottom edge resizes, side handles stretch an event over more days (multi-day); a tap opens the edit sheet; tapping an empty time starts an event. Saved by `rescheduleEvent` / `stretchEventDays`.

| Live feature | Glance |
| --- | --- |
| Drag an event to another time (15-min snap) | Yes (restored Nov 16, Connor) |
| Drag an event to another day | Yes (across the days shown; with the Daily List open, the five visible days) |
| Drag the bottom edge to change length | Yes |
| Side handles stretch over more days | Yes (the event then shows in the sticker row as multi-day; shorten it on the edit sheet) |
| Tap an event opens the edit sheet | Yes |
| Tap an empty hour starts an event | Yes |
| Drag the empty grid | Scrolls the hours (Glance addition) |
| Point events (time, no length) | Tap to edit; not dragged (as main) |
| Today / Agenda, Month dragging | N/A — none (SPEC Nov 16) |

---

## Add / edit event sheet — `calendar/forms.tsx`, `calendar/when-fields.tsx`, `calendar/adding.tsx`

Live Event tab: emoji picker, title (What), WhenFields (date, start, length dial, end; all-day switch; end on a later day = multi-day), person stickers, day-kind chips. Repeats tab: none/daily/weekly/monthly/yearly plus repeat details. More tab: notes, visibility (everyone / adults / just me). Heads-ups tab when **editing**. Adding also has ready-made templates across the top, “Add and save as a template”, and QuickAddSheet from Planner Plans +. No location field in live CardDefaults.

| Feature | Coverage |
|---|---|
| Sheet over the day; title Edit event; Cancel / Save | Yes |
| Emoji picker + What (title) | Yes |
| Starts, ends, All day | Yes |
| Length dial | No |
| End date / multi-day | No |
| Who as colour chips (no avatars) | Yes |
| Day-kind chips | Yes (School day on, plus Family day / Free day) |
| Event / Repeats / More tabs | Yes (Event open) |
| Repeats options (none/daily/weekly/monthly/yearly) | Partial (tab only; panel not drilled in this shot) |
| More: notes + visibility | Partial (tab only) |
| Heads-ups tab (editing) | Yes (tab present; panel not drilled) |
| Templates row / save as template | No — this shot is an existing event (Dentist), not Add |
| **Location, plain text** (Connor; not in live form) | **Added** — “Bloor St W”, no map |

Mock: `g-final-event.html`.

---

## Planner — `/review` (`review/board.tsx`, `review/meal-box.tsx`, `review/chores-view.tsx`, `review/grocery-sheet.tsx`, `review/actions.ts`, `groceries/build.ts`)

Live: coming week by default, arrows to other weeks, “The coming week” jump when elsewhere. Week \| Chores views. Seven columns: Day (kinds, per person, +), Meals (tiles; + names a meal; tap opens meal picker), Chores (chore days on that date; + adds a chore day; tap to move/swap/take off; occasional chores can be put off), Plans (events; + opens Add an event). One Save. Unsaved-leave dialog. Problem flags. Meal picker: kinds → meals of that kind → plate (dishes ×1/×2/×3, eaters, leftovers, custom); backup meals currently hidden. Chores view: each chore day with its chores.

**Live grocery link:** Save calls `putMenuOnList`. There is **no approve step** in live code (“planning the menu is the approval”). Ingredients of planned (non-backup) dishes, times batches, are merged onto the grocery list. Already ticked or hidden lines are not put back; hand-added lines are never touched. A “Grocery list” header button opens the **live** list (`GrocerySheet`); if the week is dirty, a note says to save first. Repeating groceries add themselves when due, review or not.

**Connor’s extension (15 Nov):** after setting meals, review the would-be ingredients, tap anything already in the house to skip it, then confirm to send the rest to the real grocery list. The mock shows this review state clearly.

| Feature | Coverage |
|---|---|
| Coming week (Sun 15 – Sat 21 Nov 2026), arrows, range label | Yes |
| Week \| Chores in the tab slot; Week active | Yes |
| One Save | Yes (on the review sheet as “Put the rest on the grocery list”, and a Save in the header for the week itself) |
| Day / Meals / Chores / Plans columns with + | Yes (week visible behind the review sheet) |
| Meal tiles show main dish / kind / block | Yes |
| Meal picker (kinds → meals → plate, batches, eaters) | No in this shot (review state is the open UI) |
| Add a named custom meal in place | No in this shot |
| Move / swap / take off a chore day | No in this shot |
| Put off an occasional chore / next week | No in this shot |
| Plans + opens Add an event | Implied by + ; sheet not open |
| Chores view (chore days as columns) | Partial (tab present, view not open) |
| Header “Grocery list” (live list after send) | Yes |
| Save week auto-fills groceries, no approve step | **Extended** — see review sheet |
| **Review ingredients before they go on the list**; tap “already have” to skip (e.g. cheese for tacos); confirm the rest | **Yes** — the open sheet is this review. Cheddar (Tacos, Fri) is skipped. Combined lines show their meals. Confirm sends the rest. |
| Dirty-week warning on the live grocery sheet | N/A in this state (review happens before send) |
| Unsaved-leave dialog | No (still) |

Mock: `g-final-planner.html`.

---

## Routines — `/routines` (`routines/manager.tsx`)

Live: a **time grid**, one column per person, for the **kind of day** picked at the top (School day, Family day, Free day, …). Routine blocks and **meal blocks** sit on the grid and can be dragged/resized. + on a column adds a routine. Right: editor for the tapped block — name, emoji, steps (text, icon, who, reorder, delete, pager), Daily-list switch (blue = on the Daily List), When (after wake-up / ends by bedtime / after a mealtime / at a set time), duration, loose, visibility, habit-since, copy, remove. Meal blocks: time, length, who has them, weekday presets (kind of meal or a menu meal). One Save; leave-with-changes dialog. **Set days** in the header opens `/routines/manage`. Ticking steps off happens on the calendar, not here.

The first mock only showed static person columns of printed steps — no day-kind switch, no time grid, no Set days, no editor. That was a regression.

| Feature | Coverage |
|---|---|
| Kind-of-day chips (School day selected) | Yes |
| Set days button | Yes |
| One Save | Yes |
| Time grid, hour labels, one column per person | Yes |
| Routine blocks placed on the grid | Yes |
| Meal blocks (Breakfast, Lunch, Dinner) on the grid | Yes |
| Drag / resize blocks | Partial (handles are not the point of the still) |
| + add a routine per person | Yes |
| Editor: name, steps, who on a step, reorder/delete, add step | Yes (Get ready for school selected, Connor) |
| Daily list switch / “Blue = on the Daily list” | Yes |
| When (anchor), duration | Yes |
| Visibility, loose, habit-since, copy, remove | Partial (When + Daily list + visibility shown; copy/remove/habit in the editor foot) |
| Meal-block weekday presets | No in this shot (a routine is selected) |
| Leave-with-changes dialog | No (still) |

Mock: `g-final-routines.html`.

---

## Set days — `/routines/manage` (`routines/manage/set-days.tsx`)

Live: opened from Routines. Title “Set days”. Tabs: **Week** (people × weekdays; tap a cell to change that day’s kind; right panel for that person’s week plans — use one, take turns / rotate, add or remove a week plan), **Days** (kinds of day: who has it, wake-up, bedtime, errands flag, heads-ups before wake-up), **Days off** (breaks: dates, who, away, other kinds of day). Back to Routines. One Save. Warning if saving removes routines from deleted kinds. `/routines/manage` is this page (not a redirect).

This whole page was missing from the first Glance pass.

| Feature | Coverage |
|---|---|
| Title Set days; Week \| Days \| Days off; Routines back; Save | Yes (Week open) |
| People × weekday grid, kind icon + name in each cell | Yes (colour wash, no avatars) |
| Tap a day to pick another kind (picker open on Sam / Wednesday) | Yes |
| Right: this person’s weeks — in use / take turns / add week | Yes (Connor’s Usual week, in use) |
| Days tab (kinds, wake, bed, errands, heads-ups) | Partial (tab present, not open) |
| Days off tab (breaks) | Partial (tab present, not open) |
| Save warning when kinds are removed | No (still) |

Mock: `g-final-routines-manage.html` (new).

---

## Lists — `/lists` (`lists/page.tsx`, `chores/rows.tsx`, `chores/forms.tsx`, `groceries/view.tsx`, `groceries/repeats.tsx`)

Live: **master–detail editor**. Left: every list (emoji, name, open count), New list. Middle: the current list. Lists are mainly reached from the Daily List (Today panel); this screen is for editing them. There will be more than three lists.

- **Groceries** (`is_groceries`): `GroceryView` — aisle columns, amounts, handwritten names, tick (saves at once), add line, “N to get · M got”, pages if needed, Repeats (milk every week, etc.), Clear ticked, stacked mark when a line is for more than one meal (tap to see which). `/meals/groceries` redirects here.
- **Chores list** (`is_chores`): add with chore tags (Essential / Outdoor / Big / …); the chore planner picks the day; items are words + tags, not a day/time.
- **Other lists**: add with title, Done by / On, optional date, optional time (shows on the calendar), optional assignee. Open items with tick, handwritten text, when, who; tap words to edit (sheet: fields, move list, remove). Done (N) + clear done. Long lists page, no wall scroll.
- Pencil: rename / change picture; built-in grocery and chores lists cannot be deleted. New list: name + picture.

The first mock put Grocery, Chores and To-dos in three equal columns and dropped the editor chrome (list of lists, rename, repeats, add-with-date/who, done pile).

| Feature | Coverage |
|---|---|
| Left: list of lists (many), counts, New list | Yes (Groceries, Chores, To-dos, Hardware, Packing, Birthday, Christmas, School trips, Party food, …) |
| Current list in the middle (Groceries selected) | Yes |
| Handwritten item names, person ink / black if unassigned | Yes |
| Aisles, amounts, tick, add, “N to get” | Yes |
| Repeats button | Yes |
| Clear ticked (when some are got) | Yes (Frozen lines ticked) |
| Combined-from-more-than-one-meal mark | Yes (Onions, used by two meals) |
| Pencil / rename list | Yes |
| Chores-list tag add form | No in this shot (Chores is in the left rail, not open) |
| Other-list add: Done by / On, date, time, who | No in this shot (a grocery list is open) |
| Edit-item sheet, Done pile, clear done | No in this shot |
| Entry point from the Daily List | Noted in README; not a second mock |

Mock: `g-final-lists.html`. Groceries is **not** a Meals tab.

---

## Chores setup — `/chores` (`chores/manager.tsx`, `chores/page.tsx`, `lib/chore-manager.ts`)

Live: this **is** the Chore Manager (`/chores/manage` redirects here). Left: Occasional chores (count, next up, “can’t find a day”), then Chore days (name, weekdays, regular-chore count), New chore day, pager. Right: whatever was tapped.

**A chore day:** emoji, name, weekday chips (or “Free day”), regular chores added like a list (picture, name, who, due-by time), tap a chore to edit (notes, reorder, remove, active), rules (“Room for occasional chores”: how many, of those Big, only-chores-meant-for-this-day, next-door days are one stretch, good for errands), next occurrence preview, remove this chore day. One Save.

**Occasional chores:** season tabs, due order, editor tabs (Basics / Repeats / More): tags, which chore days, who, repeat every N days/weeks/months from last done or a date, snap, preferred weekday, only in seasons/months/date range, time, visibility, notes, heads-ups, first due, Do it today.

Today’s ticking lives on the Daily List and the Chores *list*, not here.

The first mock flattened this into a static summary and dropped weekday chips, regular-chore list editing, room/rules, previews, and the occasional editor.

| Feature | Coverage |
|---|---|
| Left: Occasional chores + chore days + New chore day | Yes |
| Right: selected chore day (Friday recycling) | Yes |
| Name, picture, weekday chips | Yes (Fri on) |
| Regular chores list with who (colour chip, no avatar) and due-by | Yes |
| Add regular chore (name, who, time) | Yes |
| One chore row expanded for edit (notes, up/down, remove, Done) | Yes (Put the bins out) |
| Rules: how many, Big, restrictive, span, errands | Yes |
| Next occurrence preview | Yes (Next Friday recycling · Fri 20) |
| Remove this chore day | Yes |
| Free day | Yes (in the left list) |
| Occasional panel (season tabs, repeat rules, tags, heads-ups) | Partial (left card is tappable; panel not open in this shot) |
| Do it today / first due | No in this shot |
| One Save; leave dialog | Yes / still not shown |

Mock: `g-final-chores.html`.

---

## Meals → Menu — `/meals/menu` (`meals/menu/manager.tsx`, `meals/menu-tabs.ts`)

Live Menu Manager, **not** a week plan. Week planning lives in the Planner. Left: kinds of meal (Every meal, Tacos, Meat & veggies, …) with rename/add. Middle: that kind’s meals. Right: the chosen meal’s **spots** (a set dish, or “any Veggie”), batches, add/remove/reorder spots. One Save. Live tabs in code are currently **Meals \| Dishes**; Backups is hidden but `/meals/backups` remains; groceries moved to Lists. Meal times moved to Routines as meal blocks; `/meals/setup` redirects to `/routines`.

Connor, 15 Nov: **Menu \| Dishes \| Backups**. Groceries stays in Lists only.

The first mock showed a coming-week dinner plan, which dropped the catalogue.

| Feature | Coverage |
|---|---|
| Sub-tabs Menu \| Dishes \| Backups (Menu on) | Yes |
| Left: kinds of meal (Tacos selected), Every meal, add kind | Yes |
| Middle: meals of that kind | Yes |
| Right: chosen meal (Beef tacos) spots, set dish or “any …”, batches | Yes |
| Add a spot, remove | Yes |
| One Save | Yes |
| Rename a kind in place | Partial (pencil on the kind) |
| Leftovers kind flag | No (not in this shot) |

Mock: `g-final-meals-menu.html`.

---

## Meals → Dishes (Library) — `/meals/library` (`meals/library/page.tsx`, `meals/dish-editor.tsx`)

Live: dishes by what they can be in a meal (Main, Starch, Veggie, …). Tap a dish to open its recipe. Add a dish: type it in, paste a recipe, or read a web page — all three create the dish and open the editor. Editor has **one Save**, tabs Recipe / Basics / Ingredients / Steps / Notes. Recipe view: ×1/×2/×3, amounts with tappable units, steps, Cook this. Basics include kinds it can be, “goes with” kinds of meal, icon, name. Remove dish (with confirm).

| Feature | Coverage |
|---|---|
| Sub-tabs Menu \| Dishes \| Backups (Dishes on) | Yes |
| Left: kinds (Mains selected) with counts | Yes |
| Middle: dishes of that kind | Yes |
| Right: Sheet-pan chicken fajitas, Recipe tab | Yes |
| Batches ×1/×2/×3, printed ingredients, Cook this | Yes |
| Editor tabs Recipe \| Basics \| Ingredients \| Steps \| Notes | Yes (Recipe open) |
| Add a dish (type / paste / web) | Yes (Add a dish in the header; type/paste/web shown as a compact entry) |
| Tappable units | Partial (units visible; conversion not opened) |
| Remove dish | No in this shot |

Mock: `g-final-library.html` (labelled Dishes).

---

## Meals → Backups — `/meals/backups`

Live: ready-meal kits for a survival day. Part counts with +/−. Using one counts parts down; a part below its minimum is suggested for the grocery list. Ready / not-ready. Add a backup. Hidden from live tabs for now; Connor wants the tab back.

| Feature | Coverage |
|---|---|
| Sub-tabs Menu \| Dishes \| Backups (Backups on) | Yes |
| Backup cards, part steppers, Ready / Not ready | Yes |
| New backup | Yes |
| Parts below minimum highlighted | Yes |
| Suggest low parts for the grocery list | Partial (red zero parts; no “add to list” button in the shot) |

Mock: `g-final-backups.html`.

---

## Cook mode — `/meals/cook/[id]` (`meals/cook/cooking-mode.tsx`)

Live: current step large, coming steps below, ingredients × batches on the left (tick off), helpers on the right (timers from the step, oven temperature, safe inside temperatures). Back / Next. Batch switch. If the meal has more than one dish, tabs switch dishes. Keeps the screen awake where the browser allows. Immersive (no standard app header).

| Feature | Coverage |
|---|---|
| Back, recipe title, batches, ingredient ticks | Yes |
| Huge printed current step, coming up, Back / Next | Yes |
| Start timer from the step | Yes |
| Oven temperature | Yes (restored: 425°F / 220°C) |
| Safe inside temperatures | Yes (chicken 165°F / 74°C) |
| Multi-dish tabs | No (tonight is one dish) |
| Wake lock | N/A (not visual) |

Mock: `g-final-cook.html`.

---

## Meals setup — `/meals/setup`

Live: **redirects to `/routines`**. Meal times are meal blocks in the Routine Manager. No separate mock.

---

## Habits — `/habits` (`habits/page.tsx`, `habits/views.tsx`)

Live: Lines (whole family) or Rings (one person), as picked in Settings. Month arrows, paging. Each habit: name, person, frequency, day circles, streak. Tap the name for the last 12 months. Manage (Habit Manager) in the header. Habits \| Health.

| Feature | Coverage |
|---|---|
| Lines view, November, month arrows, Habits \| Health | Yes |
| Rows with person colour, day history, In a row | Yes |
| Habit name is the large target | Yes |
| 12-month history | No (would be a second still) |
| Rings view | No (Settings option; Lines is the family default) |
| Link to Habit Manager | Yes (Manage in the header) |

Mock: `g-final-habits.html`.

---

## Habit Manager — `/habits/manage`

Live: Habits tab (list + editor: name, who, check vs count + goal/unit, how often — daily / certain weekdays / N a week / N a month, since) and Health tab (trackers: medicine / number / note, who, unit, alert above, medicine choices with wait and max per day, amounts per person). Habits that come from routines are listed and switched on in Routines. One Save. `?tab=health` from Health.

| Feature | Coverage |
|---|---|
| Habit Manager screen | **No** — not given its own still. Reachable via Manage on Habits / Health. Listed for discussion if Connor wants it mocked. |

---

## Health — `/habits/health`

Live: one person per page (person switcher). Chart of the last three days for a reading tracker or doses; medicine cards with next allowed time / Log it; Today’s entries (edit a log). Earlier/later window. Manage (health tab). Empty state: Add a tracker.

| Feature | Coverage |
|---|---|
| Sam, Habits \| Health, person switch, arrows, Add an entry | Yes |
| Last-three-days Vitamin D check-in (Thu/Fri taken, Sat due) | Yes |
| Medicines + Log it, next time | Yes |
| Today’s entries (pending Vitamin D only) | Yes |
| Numeric reading chart / alert-above | No (this household shot is a medicine check-in) |
| Edit-log sheet | No in this shot |
| Manage | Yes (header) |

Mock: `g-final-health.html`. Light, non-sensitive sample data.

---

## Settings / household — `/household` (`household/editor.tsx`, `apps-tab.tsx`, `screen-saver-tab.tsx`)

Live tabs: People \| Household \| Apps \| Screen saver. One Save.

- **People:** list on the left, editor on the right: picture, name, born in, role (parent/child), colour, PIN (parents, 4–8 digits, type again), remove/keep person, add someone.
- **Household:** name, currency, time zone, units, temperature, kitchen measures (Canadian 250 ml cup / US), Switch or add household, Sign out. Calendar card: week starts on, month shows (next 5 weeks / the month), habits show as Lines/Rings, Planner on (weekday + time), handwriting toggle. Today panel: which boxes are on.
- **Apps:** kitchen launcher apps (name, icon, colour, address / local key, check-up).
- **Screen saver:** when it runs, art folders, this screen on/off, meal-time ties.

Live does **not** have a sounds block or a holiday-themes toggle (holidays have their own `/holidays` manager). Connor wants sounds (mute, quiet hours, output = screen speaker) and a holiday-themes toggle kept; he will source UI sound files himself.

| Feature | Coverage |
|---|---|
| People \| Household \| Apps \| Screen saver, Household on, Save | Yes |
| People list as colour dots + names (no avatars), Connor selected, colours, Add someone | Yes |
| Person editor: name, born in, role, PIN set | Yes (Connor: Parent, PIN set, born 1984) |
| Picture (emoji) | Partial (not shown as an avatar; colour is the identity) |
| Remove person | No in this shot |
| Household: name, time zone, units, temperature, handwriting | Yes |
| Currency | Yes |
| Kitchen measures | Yes |
| Week starts on, Month shows, Habits show as | Yes |
| Planner on (weekday + time) | Yes |
| Today panel box toggles | Yes |
| Switch or add household, Sign out | Yes |
| Apps tab contents | Partial (tab only) |
| Screen saver tab contents | Partial (tab only) |
| **Sounds: mute/on, quiet hours, output = Screen speaker** | **Added** (Connor will source the sound files) |
| **Holiday themes on/off** | **Added** (live holidays are a separate manager) |

Mock: `g-final-settings.html`.

---

## Intentionally not mocked

Login, setup, and switch-household wizards (unless trivial). `/holidays` manager (replaced in Settings by the holiday-themes toggle, per Connor). Rings habit view. Kitchen apps tray tier (kitchen PC only). Activity history (live Settings comment: no history shows for now).

---

## Live conflicts / judgement calls

1. Live Meals tabs are Meals \| Dishes, backups hidden, groceries in Lists. Connor wants **Menu \| Dishes \| Backups**; groceries stay in Lists. The mocks follow Connor.
2. Live Planner save puts ingredients on the grocery list with no approve step. Connor wants a **review-and-skip** step before they go on the list. The Planner mock shows that review state. This is an extension, not a removal.
3. Location is not in the live event form. Kept as a **plain text** field, no map.
4. Sounds and holiday themes are not in the live household editor. Kept; sound files to be sourced by Connor.
5. Glance A still uses colour chips instead of the live Avatar component.
6. Lists is an editor; the Daily List remains the everyday entry point.
