# Glance refinements (G1–G5)

These stay close to the original Direction A home and week — the ones Connor preferred over the large-text A1–A5 experiments. Each variant keeps the same structure, the bright-2 palette (except G3's richer tints), Figtree, the full 9-item dock, and about the same information density. They explore refinements, not new layouts.

**Current visual direction (Nov 15):** Connor pointed back at original Glance A (`../shots/a-home.png`) as the look to follow — soft tinted event cards, left accent bars, white rounded panels on the light rail — not the later marker/whiteboard month and agenda. The finalized Today page is `src/g-final-agenda.html`. See the last section.

**What stays the same**
- Clock and date at top left, a Next banner, and weather in the hero.
- A Today list with Today / Week / Month tabs, a red now line, and the day's events.
- A dinner card, Today's list checklist, and routine chips on the right.
- A Coming up strip of the next three events.
- The full dock (Today, Calendar, Planner, Routines, Lists, Chores, Meals, Habits, Settings, plus Add).
- The week view is still seven day columns with meals, events, and chore/routine chips.

**Files**
- Pages: `src/g1-home.html` … `src/g5-home.html`, plus week views for G1, G3 and G4.
- Shared: `src/g.css`, `src/g.js` (and `src/g3.css` for the richer palette).
- They reuse `../src/{base,a}.css` and `../src/common.js`.
- `assets` is a symlink to the parent redesign folder.

**Checking.** `node check.mjs <page…>` uses the original Direction A thresholds:
- Text under 18px (1080p-equivalent) is flagged.
- Targets under 48px are flagged.
- Contrast at least 4.5:1, no scroll, nothing clipped.

**Results** (`checks.json`): all 8 screens pass at 1920×1080 and 1280×720.

## Variants
**G1 Polish** (`shots/g1-home.png`, `shots/g1-week.png`)
- Aligns the hero with the main columns, so weather sits directly above dinner and the list (both 36rem). The clock and Next share the left column.
- Evened spacing in the event list, now line, and side column.
- Times are consistent: "until 10 am" instead of "until 10".
- Weather is stacked more clearly: temperature, condition, High / Low, then sunrise and sunset.
- Checkboxes are a full 48px.
- The week view adds a light today wash, slightly tighter column padding, and ink-coloured meal names.

**G2 Column balance** (`shots/g2-home.png`)
- Built on G1's alignment, but the side column is 32rem (was 36rem) and the clock column is 24.5rem (was 30rem in the original).
- The Today agenda and the Next banner get the extra width, so long event titles have more room.
- The slimmer list still shows all 7 items; "Call the plumber about the kitchen sink" just barely truncates.

**G3 Richer colour** (`shots/g3-home.png`, `shots/g3-week.png`)
- Same layout as G1.
- Warmer page rail (`#F1EEE7`) and slightly cream boards.
- Person-soft fills are a step richer (mixed a little toward each person's colour): blue `#BDD6F2`, pink `#F4C4D2`, teal `#B0E0E4`, purple `#DCC4EE`, orange `#F7CBA8`. Dinner is `#F5E093`.
- Secondary text is a touch darker (`#3F444C` / `#474C54`) so contrast stays at or above 4.5:1 on the richer fills.
- The active dock item uses the blue wash.

**G4 Larger type (~1.25–1.3×)** (`shots/g4-home.png`, `shots/g4-week.png`)
- Not L-series size. The clock is 128px (was 104px). Event titles are about 33px (was 26px). Next's title is 44px (was 36px). The smallest text is 20px (was 18px).
- All of the original home content is still there: 4 events, 7 list items, 3 coming-up peeks, 2 routines, dinner, weather, and the 9-item dock.
- Padding is slightly tighter so it still fits with no scrolling.
- The date is two lines ("Saturday / November 14") so the Next banner stays wide enough for the larger title.
- The week view uses the same scale: larger day numerals, titles and meals, with slightly tighter column padding. All 7 days, events, meals and people filters are kept.

**G5 Next countdown + day peek** (`shots/g5-home.png`)
- Same frame as G1.
- The Next banner leads with a red "20 min" countdown tile, then the tooth icon and title. The kicker is just "Next up".
- Coming up is a 3-day peek: each tile has a large weekday and date (Sun 15, Mon 16, Tue 17), then the event icon, title and time.

## Comparison
`compare.png` shows the original A home first, then G1–G5 homes, then the original week plus G1, G4 and G3 weeks.

## Made-up or adjusted sample data
- None on the events, list, meals or people. Everything comes from `src/common.js`.
- G1–G5 only reformat times already in the data ("until 10 am", "High 9° · Low 2°").
- G5's upcoming dates (15, 16, 17) are the calendar dates of Sun–Tue in that same sample week.
- G4's two-line date is a layout choice, not new data. The clock stays at 8:40 am on every screen.

## Recommendation
These are close enough to A that any of them could replace it. A sensible combination:
- **G1 as the default home** — it is the original, just better aligned and slightly tidier.
- **G3's palette as an optional warmer theme**, or as the household's "bright" look.
- **G5's countdown Next and day-peek Coming up** are worth stealing even if the rest of G1 stays.
- **G4** if the kitchen panel needs a modest type bump without giving up the checklist, the coming-up strip, or the full dock. It is still much denser than the earlier L-series / A1–A5 work.
- **G2** only if long event titles matter more than list width.

## Known issues
- **Long titles still wrap or ellipsize** in the 7-day week (Saturday's dentist and parent–teacher titles) and in G2/G4's slimmer list ("Call the plumber about the kitchen s…").
- **G4 is tight.** The list, dinner and routines only just fit. A fifth event today would be a squeeze.
- **Connor and Christopher both use the initial C**, distinguished by colour (blue vs purple), as in the original.

---

## G1 Month (kitchen 2560×1440)

Connor asked for the month view to stretch to the edge (no outer border) and to try it in the Glance style, keeping the compact shared header in mind.

**Files**
- Page: `src/g1-month.html`
- Shots: `shots/g1-month.png` (2560×1440), `shots/g1-month-1920.png` (1920×1080)
- Side-by-side vs the live app: `shots/g1-month-compare.png`
- Checks: `node shoot-month.mjs` (same 18px / 48px / 4.5:1 thresholds, at both sizes)

**What changed vs the live month view**
- The 5×7 grid runs edge to edge: no rounded frame, no outer border, no side padding, only 1 px dividers between days.
- Shared compact top band: clock and date, a small weather icon and temperature only (no condition text), no blue Next chip. Agenda | Week | Month sits in this band, in the same right-hand slot it would occupy on an updated Glance home. Holidays / Templates / Everyone collapse into one Menu button.
- The Today panel is **hidden** so the cells can be as wide as the screen. Alternative: a slimmer ~20 rem strip that toggles open, instead of the live app’s permanent 30 rem (640 px) panel.
- Add lives in the dock, not a FAB, so it doesn’t cover a day cell.
- Events are soft person-coloured Glance blocks (not coloured text), with 2-line wrap when a title doesn’t sit beside its time. Packed days show 3 events plus “+N more”; quieter days use the leftover space (2-line titles, comfortable padding).
- Past days (Nov 8–13) use the rail wash and muted date numbers, at full opacity so contrast stays at or above 4.5:1.
- No per-person progress bars, and no extra chrome (Holidays, Templates, Everyone, Daily list).

**Measured at 2560×1440** (1 rem = 21.33 px; 27" 16:9, 0.2335 mm/px)
- Header 112 px; weekday row 52 px; dock 118 px.
- Grid 2560×1157 px, 5×7, flush to the left and right edges.
- Cell **365.7×231.4 px** (85.4×54.0 mm, 3.36×2.13 in) — about 110 px wider than the live app’s 256×240 cells.
- Date number 32 px in a 47×36 px badge (the whole cell is the tap target).
- Event title **29.9 px** (1.4 rem, ~30 px as asked), line-height 33.4 px; time 24.0 px.
- Today lists 3 events (dentist wraps to “Dentist appointment / downtown…”) plus “+1 more”; all 3 are unclipped. A fourth 2-line row would not fit with the +N label.

**At 1920×1080** (1 rem = 16 px; CSS reference, not native pixels on the 27")
- Cell 274.3×173.5 px. Title 22.4 px, time 18.0 px, date 24 px. Same 3 + “+1 more” capacity.

**Checks.** Both sizes pass: no page scroll, min text 18 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells.

**Made-up sample data** (everything on Nov 14–17 is from the live app / shared `common.js` sample: dentist, standup, swim, parent–teacher, hockey practice, Grandma’s birthday dinner, piano)
- Fri 20: PA day — no school (all-day); Hockey tournament 8 am; Costco run 10 am; Library books due 12 pm; Oil change 3 pm (the last two sit behind “+2 more”).
- Mon 23: Book club 7 pm.
- Thu 26: Piano recital 6 pm.
- Sat 28: Family movie night 7 pm.

**Known limits**
- A packed day still can’t show four 2-line, 30 px titles in a 231 px-tall cell, so today uses 3 + “+1 more” (parent–teacher is the hidden fourth).
- The very long dentist title still ellipsizes on line 2 (“downtown…”). That’s much less than the live app’s “Dentist app…”, but the doctor’s name doesn’t fit at 30 px even in the wider cell.
- Titles that nearly fill the row (Hockey tournament, Family movie night) go to a second line so the time never sits on top of the words.

### Revision: hidden tray, no accent bar, type comparison

Connor asked to keep the app tray hidden, drop the dark left bar on event blocks, and try more distance-legible fonts than Figtree.

**Layout changes** (all four font shots share this)
- No persistent dock. A small bottom-centre menu handle (same idea as the live app) sits under the grid, with 3.15 rem of bottom inset so it doesn’t cover a day. Add is in the header band, next to Menu.
- Event blocks have no left accent bar. They use a slightly stronger soft person tint, a small person-colour dot, and the existing emoji. Title and time are dark ink (`--ink` / `--soft`), not coloured text.
- Titles are 32 px (1.5 rem) at 2560×1440, weight 600, with a little positive letter-spacing. Dates are 32 px at weight 700 so they stay distinct. Times are compact “9a / 4p” so the title keeps more width.
- Cell size is now 365.7×241.7 px (the dock’s ~118 px came back to the grid, minus the handle inset). Today still lists 3 events + “+1 more”.

**Fonts** (OFL files in `/workspace/almanac-redesign/fonts/`)
- `shots/g1-month-atkinson.png` — Atkinson Hyperlegible Next
- `shots/g1-month-inter.png` — Inter Display (optical size 32)
- `shots/g1-month-lexend.png` — Lexend
- `shots/g1-month-public-sans.png` — Public Sans
- 1:1 cell contact sheet: `shots/g1-month-font-compare.png`

`?font=atkinson|inter|lexend|public-sans` on `g1-month.html` switches the face. `node shoot-fonts.mjs` captures the four kitchen shots and reruns the 18 px / 48 px / 4.5:1 checks. All four pass at 2560×1440.


The earlier sans shots are still in `shots/`. `g1-month.html` is now the marker revision below; re-running `shoot-fonts.mjs` would overwrite those shots with the new marker colours.

### Revision: whiteboard marker inks, handwriting on and off

Connor wanted the calendar to get back the charm of a dry-erase board: saturated Expo-like marker colours, and a handwritten face when handwriting is on.

**What the live Almanac does** (read-only; the repo was not changed). The household `handwriting` setting defaults to on. On, family-written text uses Kalam (`--almanac-font-hand` / `.font-hand`, weights 400 and 700). Off, that token falls back to the sans — Figtree in the live app, Atkinson Hyperlegible Next in this redesign. UI chrome stays sans either way. Today the live month-grid event titles do not actually use `.font-hand`; this mockup applies the hand face to the grid (dates, weekdays, titles, times, +N) so the setting is visible.

**Layout kept from the last revision.** No dock, handle only, Add next to Menu, no left accent bars, no person-colour dots (the ink colour is the person cue; emojis stay). White board, 1 px grid, a thin red marker ring on today’s date. Past days use a very light grey wash; event inks stay full-strength so contrast holds.

**Palette** (see `shots/g1-month-marker-palette.png`). Each ink is at least 4.5:1 on white and on a 10% wash:

| Ink | Hex | Wash | On white | On wash | Who |
|---|---|---|---|---|---|
| Blue | `#1F4FD1` | `#E9EDFA` | 6.78 | 5.80 | Connor |
| Pink | `#C41760` | `#F9E8EF` | 5.77 | 4.90 | Alexandra |
| Teal | `#0A7373` | `#E6F1F1` | 5.66 | 4.91 | Sam |
| Purple | `#7C2CB0` | `#F2EAF7` | 7.38 | 6.29 | Christopher |
| Orange | `#B34800` | `#F7EDE6` | 5.46 | 4.74 | Everyone / family |
| Red | `#CB241C` | `#FAE9E8` | 5.51 | 4.70 | available |
| Green | `#237C3D` | `#E9F2EC` | 5.22 | 4.57 | available |
| Black | `#1F2328` | `#E9E9EA` | 15.80 | 13.02 | dates, +N |
| Brown | `#7A3D12` | `#F2ECE7` | 8.39 | 7.16 | available |

The main series uses the light wash behind each event (a highlighter swipe). `shots/g1-month-marker-kalam-nofill.png` is the same Kalam page with no fills, also compared on the palette sheet. The wash is easier to parse at a glance.

**Type.** Grid text is 1.65 rem / **35.2 px** titles (weight 700, or 600 on Atkinson; 400 on Patrick Hand and Caveat Brush, which only ship 400), 1.3 rem / 27.7 px times, 1.7 rem / 36.3 px dates. Hand fonts read small, so this is a step up from the 32 px sans titles. Chrome (clock, date, weather, nav, Menu, Add) stays Atkinson. Shantell Sans is the variable file at a moderate bounce/informal (`BNCE` 18, `INFM` 30, `SPAC` 0).

**Shots** at 2560×1440 (older sans-tint shots were not overwritten):
- `shots/g1-month-marker-kalam.png` — Kalam, Almanac handwriting on
- `shots/g1-month-marker-patrick-hand.png`
- `shots/g1-month-marker-gaegu.png`
- `shots/g1-month-marker-shantell.png`
- `shots/g1-month-marker-caveat-brush.png`
- `shots/g1-month-marker-atkinson.png` — same marker colours, handwriting off
- `shots/g1-month-marker-kalam-nofill.png` — Kalam, no washes
- 1:1 contact sheet of today / Sun 15 / Mon 16 / Fri 20: `shots/g1-month-marker-compare.png`
- Palette with hexes and contrast ratios: `shots/g1-month-marker-palette.png`

`?font=kalam|patrick-hand|gaegu|shantell|caveat-brush|atkinson` and `?fill=light|none` switch the page. `node shoot-marker.mjs` captures the kitchen shots and reruns the checks. All seven pass at 2560×1440: no scroll, min text 18.4 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells. Today still shows 3 events + “+1 more”; Fri 20 shows 3 + “+2 more”. Cell 365.7×246.1 px.

**Recommendation.** Use Kalam (Almanac’s handwriting-on face) with the light marker washes for the written grid — it is the most Expo-like at kitchen distance; keep Atkinson Hyperlegible Next for handwriting off and for the chrome.


### Revision: Shantell, no fills, prominent month

Connor chose Shantell for now, asked to drop the coloured washes, remove the Menu (Holidays / Templates / Everyone) and other extra header buttons, and make the month name the header hero, like a wall calendar.

**What changed**
- The grid is locked to **Shantell Sans** (moderate bounce: `BNCE` 18, `INFM` 30, `SPAC` 0) for event titles, times, dates, weekdays, and the month title. Chrome (clock, date, weather, nav, Add) stays Atkinson Hyperlegible Next.
- No fills or washes behind events: pure marker ink on the white board. The same palette as before; every ink is still at least 4.5:1 on white (blue 6.78, pink 5.77, teal 5.66, purple 7.38, orange 5.46).
- The Menu button is gone. Holidays and Templates can live in the bottom menu handle (the same tray as the rest of the app). Everyone / people filters can sit there too, or in Settings / household. Header essentials only: prev / Today / next, the rolling range (8 Nov – 12 Dec), Agenda | Week | Month in its usual slot, and Add.
- A large handwritten **November** (with a quieter 2026) sits in the top band. The clock, date, and weather stay compact. Two header layouts:
  - **A, centred** (`?variant=center`, the default): November in the middle, clock on the left, controls on the right. 75.7 px month title at 2560. The more classic wall-calendar reading.
  - **B, left** (`?variant=left`): November on the left, slightly larger (81.1 px), with the clock and all controls clustered on the right.
- Costco run now uses `shopping_cart.png` (the old `shopping_bags.png` was missing from assets).
- Unchanged: no dock, handle only, no accent bars, faded past days, edge-to-edge grid. Today still shows 3 + “+1 more”; Fri 20 shows 3 + “+2 more”.

**Shots**
- `shots/g1-month-shantell-center.png` (2560×1440) and `shots/g1-month-shantell-center-1920.png`
- `shots/g1-month-shantell-left.png` (2560×1440) and `shots/g1-month-shantell-left-1920.png`
- Header strip: `shots/g1-month-shantell-header-compare.png`

`?variant=center|left` chooses the header. The page now defaults to `font=shantell`, `fill=none`, `variant=center`. `node shoot-shantell.mjs` captures both variants at both sizes. All four pass: no scroll, min text 18.4 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells. Cell 365.7×244.9 px at 2560, 274.3×183.5 px at 1920. Header is 104 px at 2560 and 78 px at 1920. Event titles 35.2 px / 26.4 px.

The earlier marker font comparison shots are kept; this revision is the current `g1-month.html`.


### Revision: printed month, handwritten events only

Connor wanted only user-written calendar content in handwriting, a much bigger printed month, and a quieter header.

**Live Almanac header audit** (read-only, measured at 2560×1440 with the 3005 harness). Almost every main screen uses the shared `ScreenHeader` in `src/components/ui.tsx`: a locked `lg:h-18` row (**96 px**) and an `lg:text-5xl font-extrabold` title (**61.3 px / weight 800**; the token is commented as 46 px at 1080). The frame adds `lg:pt-5.5` (**29.3 px**) of top padding above that row. The clock is a separate `HeaderClock` (`lg:text-4xl`, **48 px**, regular, muted) and only appears on Agenda and Calendar when the Today panel is closed. Height and title size are standardized; the controls are not.

| Page | Header | Title | Size / weight | Controls, left to right after the title |
|---|---|---|---|---|
| Agenda / Today (panel open, the default) | 96 px | Agenda | 61.3 px / 800 | Everyone · Agenda \| Week \| Month. Clock and the long date live in the Today panel instead. |
| Agenda / Today (panel closed) | 96 px | Sunday, November 15 | 61.3 px / 800 | Clock (48 px) · Everyone · Agenda \| Week \| Month |
| Calendar week | 96 px | Nov 15–21 | 61.3 px / 800 | Clock (if panel closed) · prev / Today / next · Holidays · Templates · Everyone · Agenda \| Week \| Month |
| Calendar month | 96 px | November (year only if it isn’t this year) | 61.3 px / 800 | Same controls as week |
| Lists | 96 px | Lists | 61.3 px / 800 | Title only |
| Meals (`/meals` → `/meals/menu`) | 96 px | Meals | 61.3 px / 800 | Meals \| Dishes tabs · Save |
| Chores | 96 px | Chores | 61.3 px / 800 | Save |
| Routines | 96 px | Routines | 61.3 px / 800 | Own `<header>` copying ScreenHeader’s classes, not the component. Day-type chips when present · Set days · Save |
| Habits | 96 px | Habits | 61.3 px / 800 | Habits \| Health · prev / month / next · pager or person pills · manage |
| Settings | 96 px | Settings | 61.3 px / 800 | People \| Household \| Apps \| Screen saver · Save |

The live month view already titles the page “November,” but at the same 61 px as Lists or Settings — that’s why a 76 px mockup title still felt squished.

**What changed in the mockup**
- Shantell (moderate bounce) is used only for written event titles and times. The month name, weekdays, date numbers, +N, clock, and controls are Atkinson Hyperlegible Next, like a bought printed calendar.
- A much bigger, extrabold printed **November**: 144 px centred, 151 px on the left variant (in the 120–160 px range). The header is 149 / 155 px tall so the word isn’t squeezed. The year is omitted (the live app also hides it in the current year).
- Decluttered header: no date range, no “Saturday, November 14,” no Menu. Weather is only the icon and **6°**. What’s left: a smaller clock (`8:40 am`), weather, prev / Today / next, Agenda \| Week \| Month, and Add.
- Weekday labels are printed small caps (SUN, MON…). Date numbers are printed; past dates are muted. Marker inks, no fills, no dock, faded past days, edge-to-edge grid unchanged. Today still shows 3 + “+1 more.”

**Shots**
- `shots/g1-month-shantell-center.png` (2560×1440) and `shots/g1-month-shantell-center-1920.png` — November centred, clock and weather on the left, controls on the right. The more symmetrical wall-calendar reading.
- `shots/g1-month-shantell-left.png` (2560×1440) and `shots/g1-month-shantell-left-1920.png` — November left and slightly larger, clock and controls in a quiet cluster on the right. Closer to Almanac’s title-on-the-left pattern, at wall-calendar scale.
- Header strip: `shots/g1-month-shantell-header-compare.png`

All four pass the checks: no scroll, min text 18.4 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells. Cell 365.7×236.8 px at 2560 (centred). Event titles 34.1 px.


### Glance Agenda in the month-view system

Connor asked how the new month system works with the Glance agenda page. This is G1 Polish’s structure (Today agenda as the main column, dinner and Today’s list on the right) redrawn with the same header, type, and marker rules as the month view.

**Title.** The hero is a big printed **Saturday**, at the same size as **November** on the month page (144 px centred, 151 px left), with a smaller printed **November 14** under it. Agenda answers “what day is it?” the way Month answers “what month is it?” — the weekday is what you want from across the kitchen. The date stamp sits underneath like the printed line on a bought calendar page. A single huge “Saturday, November 14” would overflow the header, especially in the left variant and at 1920. The year is omitted, as on month.

**Times are printed** (Atkinson, in a left-hand timetable column, e.g. `9:00 am` / `– 10:00`). The clock and date numbers are already printed “when” information; on Agenda there’s room for a stable time spine, with handwritten titles beside it like notes on a printed schedule. (Month-grid times stay handwritten because they’re tucked into the same marker line as the title in a tight cell.)

**What carried over from the month system**
- Same header chrome: small clock, weather icon and number only, prev / Today / next (previous/next day here), Agenda \| Week \| Month in the same slot (Agenda is active), and Add.
- No Next-up chip, no Coming up strip, no routine progress bars, no dock (handle only), no “4 events · next in 20 min,” no left accent bars, no fills behind handwritten items.
- Shantell + person marker inks only for written content: event titles, checklist items, and the dinner name. Everything else is Atkinson.
- The next event (Dentist, 9:00) is marked with a printed red **Next** and red time, in the same ink as the month’s today ring — not a banner.
- The checklist is a written list on the board: open squares, a marker-coloured check when done, handwritten items in each person’s ink, a strike on “Feed the cat.”

**Shots**
- `shots/g1-agenda-center.png` (2560×1440) and `shots/g1-agenda-center-1920.png`
- `shots/g1-agenda-left.png` (2560×1440) and `shots/g1-agenda-left-1920.png`
- Side-by-side contact sheet, Agenda A next to Month A and Agenda B next to Month B: `shots/g1-agenda-month-compare.png`

`src/g1-agenda.html?variant=center|left`. `node shoot-agenda.mjs` captures both variants at both sizes. All four pass: no scroll, min text 18.4 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells. The Agenda header is a little taller than Month (195 / 202 px vs 149 / 155 px) because of the “November 14” line under Saturday.

### Finalized agenda — original Glance A, tweaked (visual direction)

Connor sent the original Glance A home screenshot and asked for that to guide the app: the soft tinted event cards, left accent bars, white rounded panels on the light rail, and the A colour feel. He liked the more consistent header (the big printed **Saturday** that also removes the blue Next-up box), wanted clutter removed (rings, dock, redundant text, the inner Today label), and then asked to put the event cards back to the original A size — not stretched to fill — with Coming up returning only when the agenda has leftover room.

This supersedes `g1-agenda.html` (the whiteboard/marker agenda) as the visual direction. That page and its shots are kept for the record.

**Source.** Starts from `../src/a-home.html`. Event, dinner, list, and Coming up CSS is copied from that page. Tokens come from `../src/a.css`. Atkinson Hyperlegible Next replaces Figtree as the printed font; sizes and proportions stay original A.

**What changed**
- A system header: a 144 px printed **Saturday** (108 px at 1920) with **November 14** beside it, not below, so the header band is 149 px / 112 px — the same height as the centred month header. Small clock (`8:40 am`), weather as icon + **6°** only, **Today | Week | Month** in a fixed right-hand slot, and an ink/black **Add**. The blue Next-up card, the weather description / high-low / sunrise-sunset card, and the in-card view tabs are gone.
- The “Today” heading inside the agenda panel is gone (the header already says it).
- Progress rings and the dock are gone. A 3.15 rem bottom handle on the rail is the only tray chrome.
- Redundant text is gone: “4 events · next in 20 min,” “1 of 7 done,” and the extra weather lines.
- Next/now stay in the list: the red **Now 8:40** line, and a small red **IN 20 MIN** on the dentist card that fits inside the original 6 rem card height (darkened to `#A3261A` so it holds 4.5:1 on the tinted fill; the Now line keeps A’s `#CF3F29` on white). Time column stays original A: `9 am` / `until 10`.
- Printed type is Atkinson Hyperlegible Next at the original A sizes (event title 1.625 rem, time 1.75 rem, dinner name 1.75 rem, list 1.375 rem). Cards are not stretched. Measured event height matches original A exactly: 128 px at 2560, 96 px at 1920.
- The checkbox *circle* is original A’s 2.5 rem; the button around it is 3 rem so the 48 px hit-target floor still holds.

**Coming up rule.** Event cards stack from the top at their natural A height, leaving room for more events. If notable empty space remains below them (as on this 4-event Saturday), the original Coming up boxes return at the bottom of the agenda panel, in the same style as A (Hockey practice, Grandma’s birthday dinner, Piano). If the day’s events would overlap or squeeze Coming up, it hides and the event list scrolls inside the panel — the cards never shrink. A busy-day version (`?busy=1`, eight events) shows that: Coming up is hidden, and the eighth event peeks below the fold.

**Left accent bars.** Kept in the main final — they are part of the original A look Connor pointed at. He earlier disliked the dark left segment on the month grid, so a cheap no-bar variant is included for comparison. Recommendation: keep the bars on Agenda (and likely Week’s event chips), and leave them off the month cells.

**Handwriting-on variant** (`?hand=on`). Only user-written text — event titles, list items, the dinner name — switches to Shantell Sans (BNCE 18, INFM 30) in the person’s colour, on the same tinted A cards. Chrome, times, headers, and places stay Atkinson. Stock A person inks fail 4.5:1 on A’s soft fills (blue 3.91, pink 3.94, teal 4.37, purple 3.97, orange 4.00), so this variant uses slightly darkened text inks that still read as the same hues: blue `#2963A6` (4.66 on its tint), pink `#A6375E` (4.63), teal `#157179` (4.62), purple `#7D42A8` (4.68), orange `#9C4B0C` (4.74). Accent bars and avatars keep the original A colours.

**No-bar variant** (`?bars=off`). Same page, tinted cards without the left edge.

**Shots**
- `shots/g-final-agenda.png` (2560×1440) and `shots/g-final-agenda-1920.png` — the finalized page (handwriting off, bars on, 4 events, Coming up visible)
- `shots/g-final-agenda-busy.png` and `shots/g-final-agenda-busy-1920.png` — busy day, 8 events, Coming up hidden
- `shots/g-final-agenda-hand.png` and `shots/g-final-agenda-hand-1920.png` — handwriting on
- `shots/g-final-agenda-nobar.png` and `shots/g-final-agenda-nobar-1920.png` — bars off
- Before/after sheet, original A vs final at both sizes, plus the busy-day pair: `shots/g-final-agenda-compare.png`
- Fair 2560 and 1920 reshoots of original A (the historic `../shots/a-home.png` is 1920×1080): `shots/a-home-2560.png`, `shots/a-home-1920.png`

`src/g-final-agenda.html` (default), `?busy=1`, `?hand=on`, `?bars=off`. `node shoot-final.mjs` captures the shots, the original-A references, and the compare sheet.

All pass: no page scroll, min text 18 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells, no missing images. On the busy day the agenda list is allowed to scroll inside the panel (`.evs`); the page itself does not. Header 149 px / 144 px title at 2560, 112 px / 108 px at 1920.

**What was deliberately left alone**
- The A event cards, dinner card, list rows, Coming up boxes, palette, soft tints, person colours, dinner yellow, ink/black primary Add, circular checkboxes, avatars, event icons, 36 rem side column, and (in the main final) the left accent bars.
- Sample data and time: Saturday 14 November 2026, 8:40 am (busy day adds four Saturday events only in the mockup).
- No day-to-day prev/next on this screen (original A home didn’t have them).
- No redesign of the week or month in this pass.

**Open questions for building the other screens from this**
- **Today vs Agenda.** The tab is **Today** to match original A. Keep Today | Week | Month on all three calendar screens, with this page as Today?
- **System header.** Title is left, with clock, weather, the view tabs, and Add in a fixed right-hand slot so Lists, Meals, and Settings can use the same chrome. Month can put a big printed **November** in the same left title slot. A centred wall-calendar title was not used here.
- **Title size on utility screens.** Saturday and November work at 144 px. Lists, Settings, and Routines at that size may feel oversized. Same size for consistency, or a step down in the same header slot for utility pages?
- **Date navigation.** Agenda has none. Week and Month need prev / Today / next — suggest placing that cluster just left of the view tabs, so the tab + Add slot stays identical.
- **Month in this language.** Rebuild Month in the A system (rail, white panels, Atkinson, this header), not the whiteboard month. Open: edge-to-edge grid vs a padded card; fills in month cells; bars off on month (given the earlier dislike) even if Agenda keeps them.
- **Week.** Start from original A / G1 week, with this header and the same removals (no dock, Atkinson, handle only).
- **Handwriting-on** as a household setting across Week, Month, Lists, and Meals, with the darkened inks whenever handwritten text sits on a tint.
- **Rings.** Removed from Agenda. Do Habits and Routines still show rings on their own screens?
- **Weather** is icon + number in the header. Same on every screen, or only on the calendar pages?

**Revision: no header clock, colour-coded people, Daily List.** The header clock is gone; **Now 8:40** is the time. Person avatars are gone from event cards and list rows — events use tint + accent bar, list items use the person’s A ink on white (all ≥5.14:1). Two-person events (Swim: Sam + Christopher; Parent-teacher: Connor + Alexandra) use a **split two-colour accent bar** (top / bottom) and a 50/50 mix of the two soft tints, rather than a gradient. The list is titled **Daily List**. Emoji variants: `?emoji=right` (icon at the right, where the avatar was) and the default `?emoji=none` (coloured text only). Event-card emojis are unchanged. The dinner cook avatar is still there.

**Shots (2560×1440)**
- `shots/g-final-agenda-emoji-right.png`
- `shots/g-final-agenda-no-emoji.png` (recommended)
- `shots/g-final-agenda-no-emoji-busy.png` (recommended busy day)
- List-column crop: `shots/g-final-agenda-list-compare.png`

All four shot pages pass the checks. Recommendation: no-emoji, because only some list items have icons, so the right-hand column is uneven, and colour already carries the person.

**Revision: handwriting-on (Shantell for user-entered text).** Starting from the no-emoji agenda (no header clock, no avatars, Daily List). `?hand=on` uses Shantell Sans (BNCE 18, INFM 30) only for event titles, event locations (treated as user-typed), Daily List items, the dinner name, and Coming up titles. Times, Now, IN 20 MIN, Daily List, DINNER TONIGHT · 6 PM, Coming up, the header, and the tabs stay Atkinson.

Event titles are **dark ink** on the tint (11+:1). Person-coloured title ink on those tints only reaches ~4.6:1 and is harder to read with a bounced hand; the tint and accent bar already show who. List items stay in the person’s A ink on white (≥5.14:1). The dinner name uses the cook’s darkened ink on the yellow (Connor `#2963A6`, 5.21:1) so the cook is still visible after the leftover “C” avatar was removed.

Also applied to the printed no-emoji page: no dinner avatar; two-person events use the **first person’s tint** plus the split two-colour accent bar (the blended fill is gone). Card sizes still match original A (128 px at 2560, 96 px at 1920).

**Shots**
- `shots/g-final-agenda-hand.png` (2560×1440) and `shots/g-final-agenda-hand-1920.png`
- `shots/g-final-agenda-hand-busy.png` (and `-1920`)
- Printed with the same fixes: `shots/g-final-agenda-no-emoji.png` (and `-1920`, `-busy`)
- Side-by-side: `shots/g-final-agenda-hand-compare.png`

All eight shot pages pass the checks.

**Revision: Daily List emojis on the right, unassigned text in dark ink.** Emojis sit in a reserved slot the same width as the + button, centred on its axis (`alignOff=0` at both sizes). Items without an icon leave the slot empty. Handwritten text with no specific person is dark ink (`--ink`). Every item in the shared sample had an owner, so this page only (not `common.js`) unassigns tonight’s dinner (Sheet-pan chicken fajitas, cook was Connor), **Book summer camp** (was Alexandra), and **Return library books** (was Sam). Coming up titles stay dark ink; Grandma’s birthday dinner is already an everyone event.

**Shots**
- `shots/g-final-agenda-hand.png` (2560×1440) and `shots/g-final-agenda-hand-1920.png`
- `shots/g-final-agenda-hand-busy.png`
- List-column crop: `shots/g-final-agenda-hand-list.png`

All pass the checks.

**Revision: finished events, header stickers, weather popover, list check-off.**

**Finished events.** Muted (softer tint bar and grey type), no strikethrough — they already happened, they weren’t cancelled. They stay above the Now line in time order. If the day’s events don’t all fit, finished ones are dropped first (all of them), then the list may scroll. `?later=1` sets the time to 11:20: dentist and standup are faded above **Now 11:20**. `?later=1&busy=1` also adds the four extra Saturday events, so the two finished ones are dropped and the six remaining (Costco and Emma’s party in progress, then the afternoon) are shown.

**All-day stickers, live today (read-only Almanac).** On Agenda/Today, a holiday or birthday appears as a big notched **Ribbon** beside the ScreenHeader title. All-day events themselves are not in the header: they are a row of soft chips (emoji + title) under the people timeline (`aria-label="All day"`). On the month grid, all-day events are emoji **stickers beside the date** (up to 4, or 2 in a shared cell); a holiday fills an empty day, or shrinks to a small sticker when the day is busy; birthdays are the same kind of small sticker. On the week view, holidays and birthdays are ribbons across the day, and all-day events are bars that can span days.

**Stickers on this Glance header.** A compact row sits under **November 14**, beside the tall Saturday, so the header stays 149 px / 112 px (7 rem). Each sticker is an emoji plus a short label: holidays/official days are printed Atkinson; user-added all-day items are handwritten Shantell when handwriting is on. A maximum of 3 show, then **+N**.

**Made-up sticker data** (Saturday 14 November 2026 is not a real holiday; Remembrance Day is the 11th). Shown: **PA day** (printed, school icon), **Leo’s birthday** (handwritten, user all-day), **Recycling pickup** (handwritten, user all-day). Overflow: **Library books due** (user all-day), behind **+1**.

**Weather.** Tapping the header weather control opens a Glance-card popover labelled **Sample forecast**, with current conditions and description, high/low, sunrise/sunset, an hourly strip, and a 5-day strip. Current figures reuse the existing sample (6°, cloudy, clearing later, H 9° L 2°, sunrise 7:03 am, sunset 4:52 pm). Hourly and 5-day values are also made-up sample data: hourly 9 am–7 pm at 4, 6, 8, 7, 4, 2°; days Sat 9/2, Sun 8/1, Mon 5/−1 (rain), Tue 4/−2, Wed 6/−1. `?weather=1` opens it.

**Dinner and Daily List.** Tonight’s meal stays **Sheet-pan chicken fajitas** (planned, no cook assigned). The live app already shows **Plan dinner** when nothing is planned — left as-is, not reinvented here. Checking a list item removes it in the live app, so the mock no longer shows a checked or struck row; **Feed the cat** is omitted. Night mode is deferred.

**Daily List check-off — spec for the final build** (not delivered as frames or video). The mock in `g-final-agenda.html` already runs this in a browser when a checkbox is tapped:

1. The checkbox fills with a check.
2. A slightly wobbly, hand-drawn marker stroke (SVG path, `stroke-dashoffset` from 1 to 0, `pathLength=1`, rounded caps, in the item’s ink or dark ink if unassigned) draws left to right across the handwritten text in **400 ms** (in the 350–450 ms range).
3. A short hold of about **180 ms**.
4. The row fades and collapses in **300 ms**; the rows below slide up with it.
5. `prefers-reduced-motion: reduce` skips the stroke and hold, and does a quick fade/collapse in about **160 ms**.

**Shots**
- `shots/g-final-agenda-hand.png` (2560×1440) and `shots/g-final-agenda-hand-1920.png`
- `shots/g-final-agenda-hand-later.png` (11:20, faded finished events)
- `shots/g-final-agenda-hand-busy.png` (11:20 + eight events, finished dropped)
- `shots/g-final-agenda-weather.png` (forecast popover open)
- Header sticker crop: `shots/g-final-agenda-hand-stickers.png`

All listed shots pass the checks. Header height is unchanged at 149 px / 112 px.

**Revision: holiday themes (Christmas and Halloween).** The weekday hero can be replaced by a holiday title, a large Fluent 3D emoji, and an optional colour theme. `?holiday=christmas` and `?holiday=halloween` (handwriting on). Person colours never change.

**Holiday theme system for the final build**

- **Hero.** On a named holiday, the tall printed weekday (“Saturday”) is replaced by the holiday title in the same size and slot (Atkinson, 6.75 rem, weight 800). A large Fluent 3D emoji sits immediately to the left of the title. The weekday is not dropped: it moves into the subtitle, e.g. **Friday, December 25** or **Saturday, October 31**. Header height stays 7 rem (149 px / 112 px).
- **Per-holiday colour tokens.** A themed holiday sets: `rail` (page background), `board` (panels), `panel` (seg track, stickers, Coming up chips), `frame`, `title` / `title-soft` (type on the rail), `accent` (Add button and the active Today tab), `accent-ink`, and `now` (the Now line and the “IN 20 MIN” label). Coming-up chips use `panel`, not `rail`, so they stay light when the rail is dark.
- **Shipped themes**

  | Token | Christmas | Halloween | Default (no theme) |
  | --- | --- | --- | --- |
  | Title + emoji | Christmas + 🎄 | Halloween + 🎃 | Weekday, no hero emoji |
  | `rail` | `#1A3C2E` deep pine | `#1C1524` purple-black | `#F6F7F9` |
  | `board` (panels) | `#FBF6EE` warm off-white | `#F7F4F0` light warm | `#FFFFFF` |
  | `panel` | `#EFE6D6` | `#EDE7E0` | `#EEF0F3` |
  | `accent` | `#A31D2B` | `#B34800` | Add uses ink; tab uses board |
  | `accent-ink` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
  | `now` | `#A31D2B` | `#9B3A00` (darker than accent so the label still hits 4.5:1 on person tints) | Existing now red; “IN 20 MIN” stays `#A3261A` on tints |
  | `title` / `title-soft` | `#F7F1E4` / `#E8E0D0` | `#F7F1E4` / `#E8D6B0` | `ink` / `soft` |

- **Fallback for unthemed holidays** (Canada Day, Thanksgiving, Diwali, and any other named day without a custom palette): keep the default rail, panels, Add, tab, and Now colours. Only the hero title and emoji change, and the weekday joins the date line the same way. No colour shift.
- **Person colours never change.** Event tints, accent bars, and Daily List inks stay the family colours on every theme. All type still meets 4.5:1, including cream titles on the dark rails and holiday reds/oranges on person-tinted cards.

**Made-up holiday sample data** (not real family plans). Christmas is Friday 25 December 2026 at **Now 10:40**: Opening presents 8–9:30 (everyone, faded), Video call with Aunt Mei 11–12 (Alexandra, IN 20 MIN), Christmas lunch at Grandma’s 1–3 (everyone), Walk to see the lights 4:30–5:30 (Sam + Christopher, split bar). Dinner: **Roast ham and vegetables** (unassigned, dark ink). Daily List: Set the table (Alexandra), Charge the camera (unassigned), Put the ham in (Connor), Write thank-you notes (Sam, no emoji), Take out the wrapping paper (Christopher). Stickers: Public holiday and School holiday (printed), Family at ours (handwritten). Coming up: Boxing Day skate, Leftovers at Uncle Ben’s, Return the folding chairs. Weather sample: −3°, light snow, H 0° L −7°, sunrise 7:48 am, sunset 4:43 pm.

Halloween is Saturday 31 October 2026 at **Now 4:40**: Pumpkin carving 11–12:30 (Sam + Christopher, faded), Costume photos 2–3 (Alexandra, faded), Trick-or-treating 5–6:30 (Connor + the kids, IN 20 MIN), Party at the Patels’ 7–8:30 (Connor + Alexandra, split bar). Dinner: **Chili and cornbread** (unassigned). Daily List: Put out the candy bowl (Connor), Charge the flashlight (unassigned), Pack extra gloves (Alexandra, no emoji), Light the porch pumpkins (Sam), Check the walk route (unassigned, no emoji). Stickers: Community night (printed), Porch display and Costume day (handwritten). Coming up: Pancake breakfast, Return the costumes, Soccer practice. Weather sample: 8°, clear and cool, H 11° L 4°, sunrise 7:46 am, sunset 6:05 pm.

Hero 🎄 and 🎃 (and the other holiday icons) are Fluent Emoji (Microsoft, MIT), copied into `../assets/` with `LICENSE-fluent-emoji.txt`. The Almanac repo was not changed.

**Shots**
- `shots/g-final-agenda-hand-christmas.png` (2560×1440) and `shots/g-final-agenda-hand-christmas-1920.png`
- `shots/g-final-agenda-hand-halloween.png` and `shots/g-final-agenda-hand-halloween-1920.png`
- Compare sheet (Saturday / Christmas / Halloween): `shots/g-final-agenda-hand-holidays.png` and `shots/g-final-agenda-hand-holidays-1920.png`

All listed shots pass the checks: no scroll, min text 18 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells, header 149 px / 112 px, event cards 128 px / 96 px, dinner 155 px / 116 px, Coming up visible, list emoji slots aligned (`alignOff=0`). `node shoot-final.mjs christmas halloween` recaptures them.

**Revision: Figtree digits for printed numbers.** Atkinson Hyperlegible Next’s slashed zero is out for printed type. Letters stay Atkinson; digits 0–9 are Figtree, swapped in with a unicode-range face so the rest of the stack is unchanged.

**Font rule for the final build**

- A family named **Almanac Digits** points at the Figtree variable woff2 (`../fonts/figtree-latin-wght-normal.woff2`, latin, weights 300–900, OFL in `../fonts/OFL-figtree.txt`).
- `@font-face` uses `unicode-range: U+0030-0039` (digits only). Colons and periods stay Atkinson — they already sat well with Figtree figures, so they were not included.
- The printed stack is `font-family: "Almanac Digits", "Atkinson Hyperlegible Next", system-ui, sans-serif` (Almanac Digits first).
- Times, the Now line, the date subtitle, weather temperatures, Coming up times, and “Dinner tonight · 6 pm” use `font-variant-numeric: tabular-nums` so the time column aligns.
- **Shantell handwriting is unchanged.** Handwritten selectors still use only `"Shantell Sans", cursive`, so any number a person writes in a title, list item, or dinner name stays in their hand.
- **Metric tweak:** Figtree lining figures are a little taller than Atkinson at the same size (cap height 700 vs 668). The face uses `size-adjust: 98%`. That matches Atkinson cap height on the date line (e.g. “November 14”) and keeps the same slight digit-over-cap overshoot Atkinson already had at weight 800 in the time column. Baseline was already aligned; no ascent or descent override was needed. Weight 700/800 tracks Atkinson closely enough that no weight remap was applied.
- The same printed stack is on `g1-month.html` for calendar date numbers (`--font`, and the handwriting-off `--hand` override). Event times stay Shantell when handwriting is on.

**Shots**
- `shots/g-final-agenda-hand.png` (and `-1920`) — Saturday, Figtree digits
- `shots/g-final-agenda-hand-christmas.png` / `...-halloween.png` (and `-1920`), plus the holidays compare sheets (regenerated)
- Close-up, old slashed-zero Atkinson vs new Figtree, same crop of the date, time column, and Now line: `shots/digits-figtree-closeup.png`

**Revision: all-day placement variants.** Connor doesn’t love user all-day chips under the date. Holiday title/emoji/theme and printed holiday stickers are kept. All-day items are never moved into the Daily List. Same Saturday sample set: PA day (printed official), Leo’s birthday (unassigned), Recycling pickup (Connor), Library books due (Sam; +1 overflow). `?allday=strip|stickers|agenda` (default with no param still places chips under the date).

- **A · `strip`.** Date line is clean. A slim chip row sits across the top of the event column, above the first timed event and the Now line. Official days use a neutral panel chip; user items use the person’s soft tint, accent bar, and darkened ink (or dark ink if unassigned). Handwritten when handwriting is on. Max 3, then +N. Space cost is small (46 px / 34 px) and Coming up still fits.
- **C · `stickers`.** Date line is clean. Tilted paper-like chips (slight rotation, light shadow) sit in the empty mid-header gap between the title/date and the weather/tabs. User-added chips are handwritten; PA day is printed. Max 3, then +N. Header height stays 149 px / 112 px at both sizes; the chips fit the mid gap at 1920 without colliding.
- **D · `agenda`.** Printed holiday/official stickers stay under the date in the header (PA day on Saturday; Public holiday and School holiday on Christmas). Other all-day events become shorter original-A-style cards at the top of the timeline, with **All day** (printed, Atkinson letters + Figtree digits if any) in the time column, person tint and accent bar, handwritten title. Space cost is the one to watch: three all-day cards plus the four Saturday events hide Coming up at both sizes (cards are 91 px / 68 px vs 128 / 96 for timed events). One all-day card on the Christmas D mock still leaves Coming up visible.

Christmas D (`?holiday=christmas&allday=agenda`) keeps the Christmas theme and the two official holiday chips in the header, and shows **Family at ours** as an all-day card in the agenda.

**Shots**
- `shots/g-final-agenda-allday-strip.png` (and `-1920`)
- `shots/g-final-agenda-allday-stickers.png` (and `-1920`)
- `shots/g-final-agenda-allday-agenda.png` (and `-1920`)
- `shots/g-final-agenda-christmas-allday-agenda.png` (and `-1920`)
- Compare sheet (A / C / D): `shots/g-final-agenda-allday-compare.png` and `shots/g-final-agenda-allday-compare-1920.png`

All listed shots pass the checks. The Almanac repo was not changed.

**FINAL: this is the agenda page.** Connor chose variant A, the all-day strip, and asked to keep the red Now line at the current time in the timeline. No query param is required: `src/g-final-agenda.html` (or `?hand=on`) is the final Today view.

**All-day rule**
- User-added all-day items are a slim chip strip across the top of the event column, above the timed timeline. They are never placed under the date and never moved into the Daily List.
- Chips use the person’s soft tint, a slim accent bar, and darkened person ink (or dark ink if unassigned). User-added labels are handwritten Shantell when handwriting is on.
- As many chips as fit in a single row are shown; overflow is a **+N** chip (titles on the title attribute). Saturday’s three sample items (Leo’s birthday, Recycling pickup, Library books due) all fit at both 2560 and 1920.
- *(Superseded.)* Official chips no longer sit under the date — see the updated FINAL rules below.

**Now-line rule**
- The red **Now h:mm** label and the hairline that follows it (`::after`, `var(--now)`) sit in the event timeline, between finished events (faded, above) and upcoming events (below). They are never inside the all-day strip and are not used as a caption for it.
- On an early morning (Now 8:40, nothing finished yet) the line sits just under the strip, then the first upcoming card. At 11:20 it sits under the faded dentist and standup, above Swim lessons. Holiday themes use their own `now` colour for both the label and the line.

**Shots** (all with Figtree digits, handwriting on)
- `shots/g-final-agenda-hand.png` and `shots/g-final-agenda-hand-1920.png` — Saturday, Now 8:40
- `shots/g-final-agenda-hand-later.png` and `...-later-1920.png` — 11:20, faded finished events, Now line between them and the afternoon
- `shots/g-final-agenda-hand-busy.png` and `...-busy-1920.png` — 11:20 + eight events; finished dropped, Coming up hidden
- `shots/g-final-agenda-weather.png` and `...-weather-1920.png` — forecast popover open
- `shots/g-final-agenda-hand-christmas.png` / `...-halloween.png` (and `-1920`)
- Holidays compare: `shots/g-final-agenda-hand-holidays.png` and `...-holidays-1920.png`

All listed shots pass the checks: no scroll, min text 18 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells, header 149 px / 112 px, event cards 128 px / 96 px, dinner 155 px / 116 px, Now line in the timeline with the red rule, list emoji slots aligned (`alignOff=0`). Coming up is visible except on the busy day. The Almanac repo was not changed. `node shoot-final.mjs hand later busy weather christmas halloween` recaptures the set.

**FINAL update: header chips removed, empty days, +X more.**

- **Header is title + date only.** No chips under the date. A holiday is expressed solely by its themed title, emoji, and colours. Redundant chips that only restated the holiday (Public holiday, School holiday, Community night) are dropped entirely.
- **The all-day strip** holds every remaining all-day item: printed official/school items (e.g. **PA day**) in Atkinson, unassigned dark ink and a neutral tint; user-added items handwritten in the person’s tint and ink (or dark ink if unassigned). As many as fit in one row, then **+N**. Saturday’s four sample chips (PA day, Leo’s birthday, Recycling pickup, Library books due) all fit at both sizes. Christmas shows **Family at ours**; Halloween shows **Porch display** and **Costume day**.
- **Empty day.** No events, no strip, and no “nothing planned” copy. The Now line still marks the time. Coming up may fill leftover space (it does in the empty-day shot). Dinner and Daily List are unchanged in that mock. `?empty=1`.
- **Tap an event** to open its edit screen (spec for the final build; the mock has no edit UI). Event cards are focusable buttons with an “Edit event: …” label.
- **Overflow.** After finished events are dropped, if the rest still don’t fit, a **+X more** line sits at the bottom of the event column (Coming up stays hidden). Tapping it smoothly scrolls the event list inside the column; the header and strip stay fixed. `prefers-reduced-motion` uses an instant scroll. The busy mock (`?later=1&busy=1`) adds two made-up events — Pick up the coats (12:30, Connor) and Evening walk (7:15, Alexandra) — so **+2 more** shows at both sizes (Parent–teacher interviews and Evening walk are the two below the fold).

**Shots** (Figtree digits, handwriting on)
- `shots/g-final-agenda-hand.png` and `-1920`
- `shots/g-final-agenda-hand-later.png` and `-1920`
- `shots/g-final-agenda-hand-busy.png` and `-1920` — +2 more, Coming up hidden
- `shots/g-final-agenda-weather.png` and `-1920`
- `shots/g-final-agenda-hand-christmas.png` / `...-halloween.png` and `-1920`
- Holidays compare: `shots/g-final-agenda-hand-holidays.png` and `-1920`
- Empty day: `shots/g-final-agenda-hand-empty.png` and `-1920`

All listed shots pass the checks. Header 149 / 112 px, no header chips, event cards 128 / 96 px, contrast ≥4.5:1, Now line in the timeline with the red rule. The Almanac repo was not changed. `node shoot-final.mjs hand later busy weather christmas halloween empty` recaptures the set.

**LOCKED: month view variants (g-final-month).** The agenda page stays locked. Month reuses that style on a 5×7 (or 6-row when needed) kitchen-screen calendar. Open `glance/src/g-final-month.html?variant=1` … `?variant=4` (default 1). The Almanac repo was not changed.

**What carries over from the locked agenda**
- Same header: big printed title is the month name (`November`) with the year beside it the way the date sits beside `Saturday`; weather icon + temperature; Today | Week | Month tabs in the same fixed 7 rem slot (Month active); Add button. No clock. No chips under the title. Hidden tray handle only (no dock, no progress rings).
- Type: printed Atkinson Hyperlegible Next; digits 0–9 are Almanac Digits (Figtree, tabular nums) on dates, times, the year, weather, and “+N more”. Shantell Sans is used only for user-entered event text (and the dinner name in the side panel). Printed official items (PA day, Remembrance Day) stay Atkinson. Unassigned ink is black / `--ink`.
- Person colour is original Glance A tints + left accent bars (split bar when two people). No avatars, no per-person progress bars, no date-range text, no dark gutter on the left of a cell.
- Holiday days are themed only in the cell: Remembrance Day (Wed 11) gets a muted burgundy wash, the holiday name, and a maple-leaf emoji. Person colours do not change.
- Tapping an event opens edit (spec; mock has no edit UI). Events are focusable with an “Edit event: …” label. Overflow uses **+N more** in the cell (MONTH_CELL_LIMIT=4, then whatever still fits). Today is Sat 14, highlighted with a red ring on the date.

**Grid rules (Connor’s month preferences + live constraints)**
- The grid and weekday row stretch to the screen edges: no outer border, no rounded outer corners, no side padding. Hairline dividers only between cells. Header keeps its 2 rem inset.
- 5-row Sunday-start grid for November 2026 (Nov 1 is Sunday; Nov 1–30 + Dec 1–5). A 6th row appears automatically when a month needs it.
- 2560×1440 kitchen canvas (1920×1080 copies too). Event rows keep a 3 rem / 48 px-at-1080 hit target, so a standard 5-row cell shows about two events + “+N more” at both sizes. The +N line itself is compact typography (the cell is the large target).

**The four variants**
- **V1 · Pills + month arrows.** Pure grid. Events are small tinted pills (printed time + handwritten title, accent bar). Previous / next month buttons sit just left of the Today | Week | Month tabs.
- **V2 · All-day strips, timed lines · swipe only.** Same grid, no arrows (swipe-only in the live app). All-day items are full-width cell strips; timed events are a colour dot + time + title — lighter and more calendar-like.
- **V3 · Grid + today panel + arrows.** Narrower grid (titles truncate sooner) plus a right-hand panel that matches the agenda’s right column: dinner (Sheet-pan chicken fajitas tonight) and the selected day’s all-day chips + timed cards. Default selection is today. Arrows left of the tabs. Tapping a day (or +N) fills the panel.
- **V4 · Past days fade, this week taller · swipe only.** No arrows. Days before today fade like finished agenda events (muted type, soft grey pills, faint accent — no strikethrough). The current week row (Nov 8–14) is 1.55× taller, so today can show a third event (Dentist) before “+3 more”.

**Sample data.** November 2026, family names and colours reused from the agenda: dentist, team standup, swim lessons, parent–teacher, hockey, piano, Leo’s birthday, PA day, recycling pickup, Costco run, Grandma’s dinner, book club, etc. Busy cells are Sat 14 (6 items → +4 more in V1–V3, +3 more in V4) and Fri 20 (5 items).

**Shots**
- `shots/g-final-month-v1.png` … `v4.png` (2560×1440) and `-1920` copies
- Compare sheets: `shots/g-final-month-compare.png` and `shots/g-final-month-compare-1920.png`

All eight page shots pass the usual checks: no page scroll, min text 18 px (1080-equivalent), targets ≥48 px, contrast ≥4.5:1, no clipped cells, header 149 / 112 px, no header chips, no avatars. `node shoot-final-month.mjs` recaptures the set and rebuilds the compare sheets.

**Month view variant 5 (Connor’s sketched cell).** New cell layout on the locked month page, same header / tabs / edge-to-edge grid, prev/next arrows left of the tabs like V1. Open `glance/src/g-final-month.html?variant=5a` (no times) or `?variant=5b` (small printed time). `?variant=5` aliases to 5a. Variants 1–4 are unchanged. The Almanac repo was not changed.

**Cell layout**
- Top row: date number top-left (printed “Nov 1” / “Dec 1” on the first of a month), then all-day items as emoji-only Fluent stickers in that same row, equally spaced in three slots, filling from the left. Max 3 stickers; any further all-day items are hidden (no +N on stickers). Stickers are not tap targets.
- Events: no pills, no tinted cards, no accent bars. Each event is a row — emoji in a left column, then the title in Shantell, in the person’s ink (black if unassigned). Equal vertical spacing, packed from the top. Overflow shows “+ N more” as the last row (MONTH_CELL_LIMIT=4).
- 5a omits times. 5b puts a small printed tabular time (Almanac Digits) in muted ink before the title.
- Person colour comes from ink only. No avatars, no progress bars.

**Holidays.** A big Fluent emoji fills the cell (no holiday-name label). Full opacity when the day is empty — the usual case; Remembrance Day (Wed 11) is the main example, maple leaf at full strength. If an event sits on a holiday, the emoji fades to 18% behind the text so contrast stays ≥4.5:1 — shown as an edge case on a made-up Friendsgiving (Tue 25) with “Bring the pie.” (Dec 25 is not in November’s trailing days, which only reach Dec 5.)

**Taps (spec; the mock has no edit or agenda UI).** Tapping an event opens its edit screen (focusable row, “Edit event: …” label). Tapping the day — the cell, the date, the empty area, or “+ N more” — opens that day’s agenda page. Stickers are not targets (clicks fall through to the day).

**Sample data (v5 extras, not applied to V1–V4).** Nov 1 has 3 all-day stickers + 4 timed events (the sketched “shows 4” cell). Today (Sat 14) has PA day + Leo’s birthday as stickers and 6 timed events, so 4 rows + “+ 2 more.” Fri 20 shows 4 + “+ 1 more.” Wed 18 has 4 all-day items; only 3 stickers show.

**Shots**
- `shots/g-final-month-v5a.png` / `v5b.png` (2560×1440) and `-1920` copies
- 5a vs 5b compare: `shots/g-final-month-v5-compare.png` and `-1920`
- Close-ups of Nov 1, today, Remembrance Day, and Friendsgiving next to the sketch: `shots/g-final-month-v5-vs-sketch.png`

**Checks.** No page scroll, min text 18.4 px (1080-equivalent), contrast ≥4.5:1, no clipped cells, header 149 / 112 px, no header chips, no avatars, no sticker +N. Event-row hit targets are ~26 px at 1080-equivalent (34 px at 2560) — below the 48 px target — because 4 list rows plus “+ N more” cannot be 48 px tall in a 5-row kitchen cell. The day cell itself is the large “open agenda” target. `node shoot-final-month.mjs 5a 5b` recaptures the set and rebuilds the compare / vs-sketch sheets.


### Month view tap rule (approved by Connor, Nov 15 2026)
On the month view, tapping anywhere in a day cell (date, events, empty space, "+ N more") opens that day's agenda. Event rows are too small for comfortable tapping there (~34px at 2560), so editing an event happens from the agenda page (tap event, then edit). Stickers are not tap targets.

### Global header rule: secondary text sits on the title baseline (Nov 15 2026)
Connor asked to “justify the year along the bottom” so the secondary header text shares the big title’s baseline (his screenshot draws a line under the feet of “November”; “2026” sits on that same line). This is a **global header rule** for Glance screens, not a month-only tweak.

- The title (`.mon`) and the secondary text (`.sub`) are siblings in the same flex row with `align-items: baseline`. The old `.mo-side` wrapper used `display: contents` so `.sub` participates in that baseline alignment (it is no longer a separately centered column).
- Secondary text uses `line-height: 1`. Holiday hero emoji (Christmas, Halloween) keep `align-self: center` so they stay mid-title, not on the baseline.
- Applied on the locked agenda (`Saturday` / `Christmas` / `Halloween` with the date beside them) and the locked month 5a/5b (`November` with `2026` beside it). Same CSS on both pages.
- Shoot checks include a 0-height `vertical-align: baseline` probe in both title and sub; `baseD` is the sub-minus-title baseline delta in CSS pixels and should be ≈ 0 (±1 px). Measured `baseD=0` at both 2560 and 1920.
- Header slot is still a fixed 7 rem (149 px at 2560 / 112 px at 1920) and must not overflow.

### Month view Daily List panel — PUSH is locked (Connor, Nov 15 2026)
Month 5a cell design stays locked. Connor compared overlay vs push and chose **push**: when the Daily List opens, the grid narrows and reflows to make room for the panel. Overlay (panel sliding over an unchanged grid) is dropped.

- The panel is the same 36 rem width and style as the agenda’s right column: Dinner tonight card (unassigned “Sheet-pan chicken fajitas”) stacked above the Daily List card (open Saturday items, handwritten owned text in person ink, add button on the heading). Light left border + shadow. Tapping the calendar grid closes it. Holiday emoji sizing and cell overflow (`fit`) re-run after the grid reflows.
- `?panel=push` on `g-final-month.html?variant=5a` shows the open panel. (`?panel=overlay` remains in the file from the comparison and is not the direction.)

**Shots** (also re-rendered after the baseline header rule)
- Agenda final set: `shots/g-final-agenda-hand.png` (and `-later`, `-busy`, `-weather`, `-christmas`, `-halloween`, `-empty`) plus `-1920` copies, and holidays compare `shots/g-final-agenda-hand-holidays.png` / `-1920`
- Month 5a / 5b: `shots/g-final-month-v5a.png` / `v5b.png` and `-1920`
- Panel (push, locked): `shots/g-final-month-5a-panel-push.png` and `-1920`. Overlay and the three-up compare remain in `shots/` from the comparison only.

`node shoot-final.mjs hand later busy weather christmas halloween empty` and `node shoot-final-month.mjs 5a 5b panel-overlay panel-push` recapture the set. The Almanac repo was not changed.

### LOCKED style: week view (g-final-week.html)
One week mock in the locked agenda + month style. Open `glance/src/g-final-week.html`. No variants. The Almanac repo was not changed. Daily List is not on screen by default; when opened it uses the same **push** behaviour as month (grid narrows) — spec only, not rendered in this mock.

**Header.** Same locked 7 rem slot: big printed title `November`, secondary `2026` on the title baseline (no date-range text), weather icon + temperature, prev/next week arrows just left of the Today | Week | Month tabs (Week active), Add. No chips under the title. Hidden tray handle only.

**Type and colour.** Printed Atkinson Hyperlegible Next; digits 0–9 are Almanac Digits (Figtree). Shantell Sans for user-entered event titles, in the person’s ink (black if unassigned). Soft person tint + left accent bar on event cards (split bar when two people; orange tint when more than two), matching the locked agenda cards. No avatars, no progress bars.

**Grid.** Seven edge-to-edge day columns, Sunday–Saturday, this week: Nov 8–14 2026. Today is Sat 14, with a red ring on the date and a warm column wash. Past days (Sun–Fri) fade like finished agenda events: muted type, grey cards, faint accent, no strikethrough. Empty days stay empty (no “nothing planned” copy).

**Column.** Top of each column: printed weekday + date number, then up to 3 emoji-only all-day stickers in a left-aligned row (extras hidden, no sticker +N). Stickers are not their own targets — a tap on the day header, empty column, or “+ N more” opens that day’s agenda. Event cards are focusable buttons (“Edit event: …”) and open edit.

**Holidays.** A big Fluent emoji fills the area below the day header (no holiday-name label, no wash). Full opacity when the day is empty — Remembrance Day (Wed 11) is the example in this week, maple leaf at full strength. If events sit on a holiday, the emoji fades to 18% behind the cards (same rule as month 5a; not shown in this week’s data).

**Events.** Compact Glance A cards stacked in start-time order — not a proportional hour grid — so about 6–8 fit in a column. Each card: tint, accent bar, printed start time, emoji, handwritten title (2-line clamp). Overflow shows “+ N more” as the last row. A red Now line (“Now 8:40”) sits in today’s column between finished and upcoming events (at 8:40 am every Saturday event is still ahead, so the line is at the top of the stack).

**Sample data.** Same family week as the locked month/agenda: Family breakfast (Sun 8), Swim lessons (Tue 10), Remembrance Day (Wed 11), Recycling pickup + Piano (Fri 13), and Saturday (PA day + Leo’s birthday stickers; Dentist, Team standup, Pick up the coats, Swim lessons, Parent–teacher, Evening walk — titles match the locked month 5a, not the longer agenda wording, so they fit the narrow columns). Mon 9 and Thu 12 are empty.

**Shots** (2560×1440 and 1920×1080 only; no compare sheet, no extra variants)
- `shots/g-final-week.png`
- `shots/g-final-week-1920.png`

`node shoot-final-week.mjs` recaptures the pair.


### Week view: LOCKED (Nov 15 2026) with spec fixes
- Past days fade like finished agenda events (reduced opacity, ~55%), keeping person tints and inks. Never desaturate them to grey.
- Every column reserves the sticker row height (even with no stickers) so first cards align across columns.
- Daily List open: push. The 7 columns narrow (about 1792px of 2560 for the grid), the panel (dinner + Daily List, 36rem, same as agenda right column) slides in from the right, and cards keep their layout. Titles wrap to 2 lines and then truncate with an ellipsis. Times shrink to the short form (9a, 12:30p) if needed. The header and tabs are unchanged. Tap the list toggle again or swipe right to close.

- REVISED: when the Daily List opens on Week, drop two day columns instead of narrowing all 7. Remaining 5 columns keep their full width. Drop past days first (oldest first); if fewer than 2 past days, drop the last future days. Closing the panel restores all 7.

### Remaining screens (one quality mock each, 2560×1440 only) — Nov 15 2026
Week view stays locked. These mocks cover every remaining kitchen screen in the locked Glance A style. Each is one version, shot only at 2560×1440. No 1920 copies, no variants, no re-render of agenda / month / week. The Almanac repo was not changed (its pages were read only). Open `glance/src/g-final-<name>.html`. Recapture with `node shoot-final-screens.mjs` (also rebuilds the overview sheet).

**Shared chrome (every utility screen except Cook mode)**
- Same 7 rem header: big printed page title, optional secondary text on the title baseline, no weather (weather is calendar-only: Today / Week / Month).
- The Today | Week | Month slot keeps its place and holds the page’s own sub-tabs. Pages with no sub-tabs leave that slot empty (reserved width) so Add stays at the far right.
- Add (or Save, or a more specific add label) at the far right where it makes sense. Prev/next arrows sit just left of the tab slot when a week or month is being paged.
- Hidden tray handle. Soft person tints and inks, accent bars, Fluent emoji. No avatars — people are colour chips, bars, or dots.
- Printed Atkinson + Almanac Digits (Figtree) on utility pages. **Exception, per Connor:** list item names (Lists, including Groceries) are handwritten Shantell, in the person’s ink (black if unassigned), same as the Daily List. Recipe steps and ingredient lists stay printed and large.
- Streaks, rings, progress bars, and check history appear only on Habits / Health. Routines, Lists, Chores, and Planner have none.
- First view must not scroll. Type ≥18 px at 1080-equivalent, targets ≥48 px, contrast ≥4.5:1.
- **Do not drop live features for the sake of a simpler UI.** A full checklist of live controls vs these mocks is in `glance/feature-parity.md`.

**Menu tray** (`g-final-tray.html`). Opens from the handle over the week view (Calendar is the current section). Eight items, matching the live tray: Calendar, Planner, Routines, Lists, Chores, Meals, Habits, Settings. Light scrim; tap outside or the chevron closes it. The kitchen apps second-tier is not shown in this mock (it only appears on the kitchen PC that runs the launcher).

**Add / edit event** (`g-final-event.html`). Sheet opened from Saturday’s Dentist card on the agenda. Event tab: emoji, title (What), starts / all-day / ends, who as colour chips (Connor selected), kind-of-day chips, **Location as a plain text field** (Bloor St W; no map — Connor, 15 Nov). Repeats, More (notes, visibility) and Heads-ups are tabs; those panels are not drilled into in this shot. Save / Cancel. Location is not in the live event form yet.

**Planner** (`g-final-planner.html`). The weekly review for the *coming* week (Sun Nov 15 – Sat 21). Seven day columns: kind of day, Meals, Chores, Plans, each with a +. Week | Chores in the tab slot. Week arrows with “Nov 15–21”. Header has **Grocery list** (the live list, after items are sent) and Save. This shot shows the **review-what-to-buy** step Connor asked for: after meals are set, ingredients from those meals are listed; tap anything already in the house (Cheddar for Beef tacos) so it is not added; confirm with “Put the rest on the grocery list.” Combined lines (onions, mince, tomatoes) show they come from more than one meal. Live save currently puts ingredients on the list with no approve step — this review is an extension, not a removal.

**Routines** (`g-final-routines.html`). The Routine Manager: kind-of-day chips (School day selected), a **time grid** with one column per person, routine blocks and meal blocks, + to add a routine. **Set days** and Save in the header. Right: editor for the tapped block (Get ready) — printed steps, who, reorder/delete, Daily-list switch, When (after wake-up / bedtime / meal / set time), duration, visibility. Ticking steps off happens on the calendar, not here.

**Set days** (`g-final-routines-manage.html`). Opened from Routines. Week | Days | Days off (Week open). People × weekday grid; tap a day to change its kind (Sam’s Wednesday picker is open). Right: that person’s week plans (use one / take turns, add a week). Days (wake/bed, errands, heads-ups) and Days off (breaks) are tabs, not open in this shot. One Save; back to Routines.

**Lists** (`g-final-lists.html`). Live **master–detail editor**: list of lists on the left (there will be many — Groceries, Chores, To-dos, Hardware, Packing, Birthday, Christmas, School trips, Party food, Library holds, …), current list in the middle. Groceries is selected: aisle columns, amounts, handwritten names in person ink, ticks, add, Repeats, Clear ticked, stacked mark for lines from more than one meal, pencil to rename. **Lists are mainly reached from the Daily List** (Today panel); this screen is the editor. Groceries is not a Meals tab (`/meals/groceries` redirects here).

**Chores setup** (`g-final-chores.html`). Full Chore Manager (live `/chores/manage` redirects here). Left: Occasional chores (count, next up) and chore days (Friday recycling selected, midweek house, Saturday jobs, Free day), New chore day. Right: Friday recycling — name, **weekday chips**, regular chores added like a list (who, due-by), one row expanded for notes / reorder / remove, rules (how many occasional, Big, only-chores-meant-for-this-day, next-door stretch, errands), next occurrence preview, remove this chore day. One Save. Today’s ticking lives on the Chores list and the Daily List. The occasional editor (repeat rules, tags, seasons, heads-ups) is on the left card, not open in this shot.

**Meals → Menu** (`g-final-meals-menu.html`). The live **Menu Manager catalogue**, not a week plan (week planning is in the Planner). Sub-tabs: **Menu | Dishes | Backups** (Connor, 15 Nov; groceries stay in Lists only). Left: kinds of meal (Tacos selected). Middle: meals of that kind. Right: Beef tacos spots (set dish or “any Veggie”), ×1/×2/×3 batches, add/remove a spot. One Save; Add a meal / Add a kind.

**Meals → Dishes** (`g-final-library.html`). Live Library tab, labelled Dishes. Dishes by what they can be in a meal (Mains selected). Recipe for Sheet-pan chicken fajitas: printed ingredients, ×1/×2/×3, Cook this. Editor tabs Recipe | Basics | Ingredients | Steps | Notes (Recipe open). Add a dish: type it in, paste a recipe, or from a web page.

**Meals → Backups** (`g-final-backups.html`). Ready-meal kits with part counts and + / −, “Ready” vs “Not ready: restock”. Live Menu tabs currently hide Backups; the route still exists. Shown because Connor wants the tab.

**Cook mode** (`g-final-cook.html`). Tonight’s fajitas, immersive: back, recipe title, batches, printed ingredient checklist, one large printed current step, coming-up steps, Back / Next, a roast timer, **oven temperature** (425°F / 220°C) and **safe inside temperature** (chicken 165°F / 74°C). No standard header tab slot, no weather, no handwriting on the steps.

**Habits** (`g-final-habits.html`). Family Lines view for November: named rows (person colour bar, no avatar), day circles, “In a row” streak. Habits | Health. **Manage** opens the Habit Manager (that page is not given its own still). Day circles are compact history (smaller than 48 px, not themselves targets); the habit name is the large target. Rings is a Settings option and is not shown here.

**Health** (`g-final-health.html`). Sam’s page: last three days of a Vitamin D check-in (Sat 14 still due), medicines with Log it, today’s entries. Habits | Health. Person arrows. Manage. No diagnosis-heavy data.

**Settings** (`g-final-settings.html`). People | Household | Apps | Screen saver, Household selected, people list and colour dots on the left (no avatars) plus Connor’s editor (name, born in, role, PIN). Household: name, currency, time zone, units, temperature, kitchen measures, switch or add household, sign out. Calendar: week starts on, month shows, habits show as Lines/Rings, Planner on (weekday + time), handwriting toggle. Today panel box toggles. **Sounds** (mute / on, quiet hours 9:00 pm – 7:00 am, output = Screen speaker) and a **Holiday themes** on/off toggle — Connor asked for these; he will source the UI sound files himself. Live Settings has no sounds block, and holidays are a separate manager. Apps and Screen saver exist as tabs but are not their own mocks. Login, setup, and switch-household wizards were skipped.

**Shots** (2560×1440 only)
- `shots/g-final-tray.png`
- `shots/g-final-event.png`
- `shots/g-final-planner.png`
- `shots/g-final-routines.png`
- `shots/g-final-routines-manage.png` (Set days — new)
- `shots/g-final-lists.png`
- `shots/g-final-chores.png`
- `shots/g-final-meals-menu.png`
- `shots/g-final-library.png` (Dishes)
- `shots/g-final-backups.png`
- `shots/g-final-cook.png`
- `shots/g-final-habits.png`
- `shots/g-final-health.png`
- `shots/g-final-settings.png`
- Overview contact sheet: `shots/g-final-screens-overview.png`

`g-final-groceries.html` was removed as a Meals tab; groceries live on Lists.



### Planner review: skipped items (Nov 15 2026)
An item marked as already have shows a red X (not a green check), with the name struck through and muted. Tap again to undo.

### Connor's decisions — Nov 15 2026 (override anything above)
**Weather.** The header weather slot on the calendar pages (Today / Week / Month) stays built but is rendered **empty** for now (reserved width, nothing shown, no placeholder icon or text, no fake data). Connor will pick the weather source later. Weather still never appears on utility pages.

**Hour grid returns on Week only.** Today / Agenda stays exactly as mocked (stacked cards, no hour grid). Week keeps its locked look — 7 edge-to-edge day columns, compact Glance agenda cards, past days fade (~55%) but keep their colours, every column reserves the sticker row, holiday emoji behind, red Now line in today's column — but the cards now sit on an **hour grid** (positioned by start time, height by duration with a minimum of one compact card; overlapping events share the column width side by side).
- Drag gestures on the grid **scroll the view** (vertical hours) — that is the only thing dragging does.
- Hour labels sit **inline on the grid lines** inside the columns (small printed digits at the left of each hour line), not in a separate gutter, so the columns stay edge-to-edge and nothing moves or resizes.
- **No dragging or resizing of events anywhere in the app** (Week, Today, Month). Events are edited by tapping the card, which opens the edit sheet.
- Initial scroll puts the current time (or the first event of the week) near the top; the header, tabs, weekday row and sticker row stay fixed while the hours scroll.
- Daily List open on Week: drop two day columns (past days first, oldest first; if fewer than two past days remain, drop the last days of the week), leaving five full-width days; closing the list restores all seven. Header and tabs stay put. Tap the list button again to close.

**Theme.** Migration `20261120200000_glance_theme.sql` is approved as is. **No theme customization UI** (no colour/theme picker or editor) until the default look is settled. The Holiday themes on/off toggle in Settings is not theme customization and stays.

**Fonts.** Figtree is still used for digits ("Almanac Digits") via the bundled `public/fonts/figtree-latin-wght-normal.woff2` — keep that file. The npm packages `@fontsource-variable/figtree` and `@fontsource/kalam` are unused (nothing imports them) and are removed.
