# Glance redesign: implementation plan

## Status (2026-11-16, final checks)

Every section below is **done** and committed on `glance-redesign`. `npm run lint`, `npx tsc --noEmit`, `npm test` (289 tests) and `npm run build` pass. `scripts/dev/check-screens.mjs` passes on every route at 2560×1440 and 1920×1080: no page scroll, text ≥ 18px, targets ≥ 48px (1080-equivalent).

| Section | Status |
|---|---|
| 0. Sample data | Done |
| 1. Global chrome, fonts, tokens, header, tray, settings JSON | Done |
| 2. Agenda (Today) | Done (plus agenda fixes) |
| 3. Month | Done |
| 4. Week | Done (hour grid per Connor's Nov 15 decisions) |
| 5. Daily List and Lists | Done |
| 6. Planner, with review-what-to-buy | Done |
| 7. Meals: Menu, Dishes, Backups, Cook mode | Done |
| 8. Routines and Set days | Done |
| 9. Chores | Done |
| 10. Habits and Health | Done |
| 11. Event sheet, with plain-text location | Done |
| 12. Settings | Done |
| 13. Remaining panes and screen checks | Done |

**Open items**
- **Weather:** the header slot on calendar pages is built but empty until Connor picks a source (Nov 15 decision a). Not on utility pages.
- **Sounds:** settings (mute, quiet hours, output = screen speaker) and hooks in `src/lib/sounds.ts` only. No audio files yet; Connor will supply them.
- **Night mode:** deferred.
- **Theme customisation UI:** not built (Nov 15 decision c). The Holiday themes toggle is.
- **Spec-only animations** (e.g. the list scratch-off) are done simply or left as hooks.

**Deviations and things not kept**
- **Event drag, stretch and resize are gone** from Today and Week (Connor, Nov 15 decision b). This removed `draggable-event`, `stretch-bar`, `pending-block`, `place-on-timeline`, `place-across-people`, and the `rescheduleEvent`, `stretchEventDays` and `changeEventPeople` actions. Moving events, changing their days and changing who they're for are all done on the edit sheet. Tapping an empty hour on Week still starts an event there. Routine blocks on the Routines grid still drag and resize.
- **No header clock** (locked spec): "Now 8:40" on the Agenda is the time, so `HeaderClock` was removed.
- **No avatars:** the last `Avatar` uses (people filter, routine checklist, Health box, chores rows) became colour dots, and `Avatar` was removed from `ui.tsx`.
- **No progress bars off Habits/Health:** the routine checklist shows "2 of 5 done" instead of a bar, and `ProgressBar` was removed.
- **Per-person routine progress** (`PeopleRow`, which used to sit on the calendar pages) is now the "2/5" count on routine rows in the Daily List.
- **Holidays manager kept** alongside the Settings toggle (conflict 10 below).
- **Spotify** stays as its own Settings tab, although the mock doesn't show it.

**Known, not changed (already like this on `main`)**
- `/meals/cook/<not-a-uuid>` shows an error instead of "not found".
- `src/app/survival-card.tsx`, `ChoreRow`/`SoonRow`/`RoundRow` in `chores/rows.tsx`, and a few meal/routine actions are not used anywhere.
- **Dev only:** the shared :3100 dev server was started with an `npx`-fetched Next 16.4.6 rather than the project's 16.4.5. That mismatch causes the "Could not validate `instant`… Invariant: moduleLoading" errors (the "2 Issues" badge). With the project's own `next dev` those errors don't appear.

Branch `glance-redesign`. Rules: `WORKFLOW.md`. Design: the locked sections of `SPEC.md`, the mocks in `mockups/glance/src/g-final-*.html`, and the live-feature checklist in `feature-parity.md` (the checklist for "don't drop features"). We judge every screen at **2560×1440** first and check it still works at 1920×1080. Each step below is one commit (`glance: …`), and each step runs lint, tsc and tests before it's committed.

How each step works: port the mock's values (rem sizes, colours, spacing) into tokens and shared components, then restyle the screen. **The data and actions stay as they are.** Screens get a new look over the same server actions, loaders and URL parameters, so live features keep working. When the mock doesn't show a live feature, the feature stays and gets restyled in the Glance style.

## 0. Sample data (done in this task)
`scripts/dev/seed-sample.mjs` wipes and rebuilds a dev household so every screen has content. See "Running the seeder" at the end.

## 1. Global chrome, fonts, tokens, header
- **Files:** `public/fonts/*` (copy the 3 woff2 files and their OFL texts), `src/app/globals.css` (@font-face rules: Atkinson Hyperlegible Next for letters, "Almanac Digits" (Figtree, digits only via unicode-range, size-adjust 98%), Shantell Sans for handwriting), `src/app/layout.tsx` (stop importing @fontsource Figtree/Kalam; the packages stay installed, nothing is uninstalled without asking), `src/theme/tokens.ts` (Glance A palette: rail #F6F7F9, board, panel, frame, ink/soft/muted, now red #CF3F29 / #A3261A on tints, darkened `hand-*` inks, person green/slate, shadows `sh-raised`, `r`/`r-card`, `tt` touch target, holiday theme token sets), `src/theme/HouseholdTheme.tsx`, `src/components/ui.tsx`.
- **New migration:** update `bright_theme_tokens()` and the existing `themes` rows, so the stored per-household copy doesn't override the new token values. HouseholdTheme merges database tokens over `tokens.ts`, so a change only to `tokens.ts` wouldn't show up.
- **ui.tsx:** `AppFrame` becomes a rail page with a 3.15 rem bottom tray handle and no side rail. `ScreenHeader` becomes the fixed 7 rem header: a 6.75 rem/800 title, plus `sub` text on the **same baseline** (the global header rule), a reserved `seg-slot` (22.5 rem) for tabs, an optional prev/next cluster to its left, and Add/Save at the far right. The calendar screens get an optional weather slot. New pieces: `Seg`, `PersonBar` (single or split accent bar), `HandText` (Shantell in the person's ink, or ink if nobody), `Sticker`, `PlusMore`. `Avatar` is kept for screens not yet ported, then retired in favour of colour chips and dots.
- **Menu tray** (`components/menu-tray.tsx`, mock `g-final-tray.html`): eight sections, light scrim, close chevron. **Keep** auto-hide after 30 s, Escape, and the kitchen-PC apps tier (the parity rows marked No/Partial are live features).
- **Settings additions to `HouseholdSettings`** (in JSON, so no migration): `holidayThemes: boolean`, `sounds: { muted, quietFrom, quietTo, output: "screen" }`. Sounds get placeholder hooks only (`src/lib/sounds.ts`, no audio files).
- Holiday theming: `src/lib/holiday-theme.ts` maps today's holiday (from `loadSpecialDays`) to Christmas/Halloween token sets or the fallback (hero title and emoji only).

## 2. Agenda (Today, `/`)
- **Mock and spec:** `g-final-agenda.html`, plus the "Finalized agenda" section through its "FINAL update".
- **Files:** `src/app/page.tsx` (replace the person-column `PeopleTimeline` with the Glance event list), `calendar/views.tsx` (shared `EventCard`, `NowLine`, `AllDayStrip`), `today-panel/panel.tsx` (36 rem right column: Dinner tonight card above the Daily List), `meals/today.tsx`.
- **What the screen shows:**
  - Header: weekday title (or the holiday hero), date on the baseline, weather, Today | Week | Month, Add.
  - Event cards: A-size cards with tint, accent bar (split bar for two people), and the "IN 20 MIN" tag. Finished events fade and are dropped first when space runs out. "+X more" scrolls the event column. Coming up fills any leftover space.
  - All-day strip at the top of the column, including kind-of-day items such as PA day.
  - Daily List check-off animation as described in the spec (400 ms stroke, 180 ms hold, 300 ms collapse; reduced-motion version too).
- **Parity at risk (not in the mock, kept):**
  - People filter (Everyone): moves into a header popover.
  - Per-person routine progress and routine chains/blocks on the day: shown as Daily List rows and as compact routine cards in the timeline. The data is unchanged.
  - Tap routine → checklist: kept.
  - Quick add / `PlaceAcrossPeople` / pending blocks / drag to move events: the Add button and tap-to-edit keep these. Drag stays on Week.
  - Survival card, timers, the panel's box pager (Daily List / lists / habits / health / Spotify): kept as panel boxes with Glance styling.
  - Ribbon for birthdays and holidays: becomes the header hero (holiday) or the strip (birthday).
  - `WallRefresh`, `RememberDisplay`, screen saver: untouched.
  - Weather: the live app has **no weather source**. The slot is built, but it shows nothing until Connor approves a source (see the conflicts list).

## 3. Month (`/calendar?view=month`)
- **Mock and spec:** `g-final-month.html?variant=5a` and `&panel=push`, plus "Month view variant 5", "Month view tap rule" and "Daily List panel: PUSH".
- **Files:** `calendar/views.tsx` (`MonthView`), `calendar/page.tsx`, `calendar/stickers.tsx`.
- **What the screen shows:**
  - An edge-to-edge 5- or 6-row grid. Each cell has the date, up to 3 emoji stickers, and event rows (emoji plus a handwritten title in the person's ink), with "+ N more" after 4.
  - A holiday shows as a big emoji that fades to 18% when the day has events.
  - Tapping anywhere in a cell opens that day's agenda.
  - The Daily List panel pushes the grid narrower.
- **Parity:** the "month shows" setting (rolling 5 weeks vs the calendar month), prev/next, the Holidays and Templates links (move them into the header's overflow), and the people filter.

## 4. Week (`/calendar?view=week`)
- **Mock and spec:** `g-final-week.html`, plus "LOCKED style: week view" and "Week view: LOCKED (spec fixes)".
- **What the screen shows (built; Connor's Nov 15 decisions override the stacked-cards mock):**
  - Seven edge-to-edge columns on an **hour grid** that scrolls vertically (drag or swipe; that's all dragging does). Hour labels sit on the lines inside the columns. Compact agenda cards placed by start time, as tall as they last (at least one card), side by side when they overlap. Every column reserves a sticker row. Past days (and today's finished things) fade to 55%, keeping their colours.
  - Holiday emoji behind the hours, and the Now line in today's column.
  - When the Daily List opens, two day columns are dropped: past days first.
- **Parity:**
  - Week meal blocks: meal cards on the grid (tap: Cooking Mode).
  - Timed list tasks (`TodoPoint`): task cards (tap: the list).
  - Breaks and all-day/multi-day events: stickers on each day they cover. Routine progress (`PeopleRow`): in the Daily List panel (no progress bars on calendar pages).
  - Drag/stretch/resize (`draggable-event`, `stretch-bar`, `side-handles` on Week): **removed** (Connor, Nov 15). Moves are done on the edit card.

## 5. Daily List panel and Lists (`/lists`)
- **Mock:** `g-final-lists.html`, plus the spec's "Lists".
- **Files:** `lists/page.tsx`, `groceries/view.tsx`, `groceries/repeats.tsx`, `chores/rows.tsx`, `chores/forms.tsx`.
- **What the screen shows:** master–detail layout. Item names are handwritten in the person's ink.
- **Parity:** all of these stay:
  - Chores-list tag add
  - Other-list add with Done by / On, date, time, who
  - Edit-item sheet with "move to another list"
  - Done pile and clear done
  - Rename and change picture
  - Pages instead of scrolling
  - `/meals/groceries` redirect
- The Daily List panel shares its row component with Lists.

## 6. Planner (`/review`)
- **Mock:** `g-final-planner.html`, plus the spec's "Planner" and "Planner review: skipped items".
- **Files:** `review/board.tsx`, `review/boxes.tsx`, `review/meal-box.tsx`, `review/chores-view.tsx`, `review/grocery-sheet.tsx`, `review/actions.ts`, `groceries/build.ts`.
- **New step, "review what to buy":** pressing Save on a week with planned meals first opens a sheet.
  - A pure function `planGroceryLines` (split out of `putMenuOnList`, with tests) builds the would-be lines. Combined lines show which meals they come from.
  - Tapping a line marks it "already have": a **red X**, name struck through and muted. Tapping again undoes it.
  - "Put the rest on the grocery list" saves the week, then calls `putMenuOnList(household, week, skippedItemIds)`.
  - Skipped items are written as `hidden=true` lines, so a later re-save doesn't bring them back (the existing "ticked/hidden aren't put back" rule). **No schema change.**
- **Parity:** everything else stays:
  - Meal picker (kinds → meals → plate)
  - Named custom meals
  - Moving, swapping and taking off chore days
  - Putting off occasional chores
  - Plans + (QuickAddSheet)
  - The Chores view
  - The unsaved-leave dialog
  - Problem flags
  - The Grocery list header button

## 7. Meals: Menu | Dishes | Backups
- **Mocks:** `g-final-meals-menu.html`, `g-final-library.html`, `g-final-backups.html`, `g-final-cook.html`.
- **Files:** `meals/menu-tabs.ts` (add Backups back), `meals/parts.tsx` (`MealsHeader` tabs in the seg slot), `meals/menu/manager.tsx`, `meals/library/page.tsx`, `meals/dish-editor.tsx`, `meals/recipe-editors.tsx`, `meals/backups/*`, `meals/cook/cooking-mode.tsx`.
- **What changes:** restyle only. Cook mode stays immersive and has no header.
- **Parity:** all of these stay:
  - Rename and add kinds
  - The leftovers flag
  - Remove dish with confirm
  - Tappable units
  - The three ways to add a dish (type it in, paste a recipe, from a web page)
  - The multi-dish tabs and wake lock in Cook mode
  - The `/meals/setup` redirect
- **New:** a "Put low parts on the grocery list" button on Backups. It uses the existing backup suggestion path (`source: 'backup'`).

## 8. Routines and Set days
- **Mocks:** `g-final-routines.html`, `g-final-routines-manage.html`.
- **Files:** `routines/manager.tsx` (large), `routines/manage/set-days.tsx`.
- **What changes:** restyle the time grid, blocks and editor. Avatars become colour chips.
- **Parity:** all of these stay:
  - Drag and resize
  - Meal-block weekday presets
  - The habit-since, loose, copy and remove controls
  - The Days and Days off tabs
  - The warning when saving removes kinds of day
  - The leave dialog

## 9. Chores (`/chores`)
- **Mock:** `g-final-chores.html`.
- **Files:** `chores/manager.tsx`, `chores/page.tsx`.
- **Parity:** all of these stay:
  - The occasional editor (season tabs, Basics/Repeats/More, heads-ups, first due, Do it today)
  - The pager
  - The leave dialog

## 10. Habits and Health
- **Mocks:** `g-final-habits.html`, `g-final-health.html`.
- **Files:** `habits/page.tsx`, `habits/views.tsx`, `habits/health/page.tsx`, `habits/manage/manager.tsx` (no mock: styled from the other screens).
- **Parity:** all of these stay:
  - The Rings view (a setting)
  - 12-month history
  - The number chart and alert-above
  - The edit-log sheet
  - Manage with `?tab=health`
- Streaks and rings appear only on these screens.

## 11. Event add/edit sheet
- **Mock and spec:** `g-final-event.html` and the spec's "Add / edit event".
- **Files:** `calendar/forms.tsx`, `calendar/when-fields.tsx`, `calendar/adding.tsx`, `calendar/actions.ts`, `calendar/page.tsx` (`EditEventPanel`, `OccurrenceControls`, `SkippedDates`).
- **New:** a Location field (plain text). It needs a **migration** adding `events.location text` and `event_templates.location`, then regenerated types.
- **Parity:** all of these stay:
  - Length dial
  - End date and multi-day events
  - The Repeats details
  - Notes and visibility
  - Heads-ups when editing
  - The templates row and "Add and save as a template"
  - The occurrence controls (this one / all) and skipped dates

## 12. Settings (`/household`)
- **Mock:** `g-final-settings.html`.
- **Files:** `household/editor.tsx`, `household/fields.tsx`, `household/draft.ts` (+ test), `household/apps-tab.tsx`, `household/screen-saver-tab.tsx`, `household/spotify-tab.tsx`.
- **Tabs:** People | Household | Apps | Screen saver, **plus Spotify**. Spotify is a live tab the mock doesn't show, so it stays.
- **New blocks:** Sounds (mute, quiet hours, output = Screen speaker) and a Holiday themes toggle.
- **Parity:** all of these stay:
  - Picture (emoji)
  - Remove person
  - PIN set and retype
  - Switch or add household
  - Sign out
  - One Save
  - The link to the Holidays manager

## 13. Remaining panes (no dedicated mock, built from the shared chrome)
- **Apps launcher tier** (`menu-tray.tsx`, `apps/actions.ts`): Glance tiles.
- **Screen saver** (`components/screen-saver.tsx`): untouched apart from tokens. It's the art mat.
- **Holidays** (`holidays/manager.tsx`): utility header plus master–detail. It is kept, even though Settings gets a themes toggle.
- **Heads-ups editor** (`heads-ups/editor.tsx`): restyled within the sheets.
- **Art route:** no UI.
- **Household switcher** (`households/page.tsx`), **login** (`login/page.tsx`) and **setup** (`setup/page.tsx`): simple centred Glance cards. `PageShell`, `Panel`, `Field`, `Input`, `Button` and `Notice` get restyled.
- **Survival card, timer pill, app alerts, unsaved-changes dialog, sheets:** restyled through ui.tsx and `sheet.tsx`.
- Checks for every screen: no page scroll at 2560 and 1920, text ≥ 18 px (1080-equivalent), targets ≥ 48 px, contrast ≥ 4.5:1. A small playwright-core script under `scripts/dev/` (outside `src`) runs them and takes shots of every route.

## Conflicts between CLAUDE.md and the locked spec (the spec wins, per WORKFLOW)
1. **Stop and wait after each step.** WORKFLOW says finish, commit and summarise. We follow WORKFLOW.
2. **Check at 1280×720 and 1920×1080.** The spec's primary target is 2560×1440, with 1920 as a check only.
3. **Nothing scrolls, anywhere.** The Agenda's "+X more" smooth-scrolls the event column. The page itself still never scrolls.
4. **The locked "bright" style, the Figtree font, Kalam handwriting, and Avatar as a shared piece.** Glance A replaces them: Atkinson, Figtree digits and Shantell, with colour chips, bars and dots instead of avatars.
5. **Ask before adding libraries.** No new npm packages. The fonts are local woff2 files, but the @fontsource packages become unused. They stay in package.json until Connor says to remove them.
6. **Theme tokens.** Theme tokens are also stored per household in the database, so changing them needs a migration (CLAUDE: every DB change is a migration). The same goes for `events.location`.
7. **Weather.** The spec shows a header weather control and a forecast popover, but the live app has no weather source. Adding one means an external service, which is a new dependency/service, so it needs Connor's approval. The slot is built but stays empty until then. **Flag this.**
8. **Sounds.** Settings and hooks only, with no audio files (WORKFLOW).
9. **Planner.** Live save has no approve step. CLAUDE's "suggest → approve" and the spec's review step both point the same way, so this is an extension, not a removal.
10. **Holidays manager vs Settings toggle.** feature-parity's "Intentionally not mocked" says the `/holidays` manager is replaced by the Settings toggle. That would drop a live feature (custom holidays and birthdays), so the manager stays and the toggle is added.

## Running the seeder (dev only)
```
node --env-file=.env.local scripts/dev/seed-sample.mjs
```
- **Environment:** needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. `SEED_PASSWORD` is optional (default `glance-local-only`). It refuses any URL that isn't localhost.
- **Login:** `glance@example.test`. Each run deletes that login and its households, then signs in as the user and calls `create_household`, exactly like `/setup`, so the starter triggers run. It then fills in the household "The Glance Family" (Toronto).
- **People:** Connor (blue, PIN 1234), Alexandra (pink, PIN 5678), Sam (teal), Christopher (purple).
- **Kinds of day:** Work/Family day for the adults; School/Free/PA day for the kids, with routines assigned.
- **Today's events:** six timed events placed around the current time, so some are finished and one is "in 20 min". Two are for two people.
- **Today's all-day items:** PA day (a kind of day), Recycling pickup and Library books due. Leo's birthday is also today.
- **The rest of the calendar:** a month of events, including a multi-day cottage weekend and weekly repeats, plus a Friendsgiving holiday in the current month.
- **Lists:** Daily List to-dos with emoji, 7 extra lists, and a grocery list with a line combined from several meals and ticked lines.
- **Meals:**
  - Dinners for this week (today is Sheet-pan chicken fajitas, no cook assigned, with steps and oven/doneness helpers for Cook mode).
  - The **coming week planned but not reviewed**, so the Planner's "review what to buy" has lines (Beef tacos → Cheddar, Onions from three meals).
  - Three backups (one not ready).
- **Chores:** four chore days with regular chores, and five occasional chores.
- **Habits and health:** habits with 40 days of logs. Health has Vitamin D, fever medicine and temperature trackers with logs.
- **Also:** event templates, a heads-up, and two launcher apps.
