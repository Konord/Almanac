@AGENTS.md

# Almanac: notes for Claude

"How Almanac works" (https://claude.ai/artifact/QjW3p9sognq4E7tiC3yFmB, replaced the old design doc on 2026-11-10) explains the features, rules and decisions; the migrations are the schema. Key rules:

- Build one phase (and one step) at a time, then stop, summarise, and wait for approval.
- The owner is new to coding: explain each new concept and choice in plain language.
- Small, testable changes with a Git commit after each working step.
- Every database change is a migration in `supabase/migrations/`. Never change a database by hand.
- Ask before adding libraries beyond those named in the doc.
- Design for the full schema, but only create what the current phase needs.
- `household_id` on every table; settings over hard-coded values; theme tokens (`src/theme/tokens.ts`) for all styling; visibility on user-facing items; suggest → approve for anything the app proposes.
- TypeScript strict mode throughout.
- Screens are built for landscape 16:9 touch displays first (the owner's main use). The kitchen screen is 2560×1440: judge layouts there first and check 1920×1080 (`node scripts/dev/check-screens.mjs`). Floors: text ≥ 18px and targets ≥ 48px at 1080-equivalent, contrast ≥ 4.5:1. Phones still work, but they come second.
- **Nothing scrolls, anywhere** (Connor, 2026-11-05): not the page, not panels, sheets, cards or lists. It's a touchscreen. Design every screen and panel to fit in every state (every tab or option open). Use columns, tabs, steppers and "+ N more" links instead of scrolling. Two locked exceptions, both with no scrollbar ever showing (Connor, 2026-11-16): the Agenda's "+X more" scrolls the event column, and the Week hour grid scrolls its hours (dragging the empty grid scrolls; events can be dragged to move, resized, and stretched over days). The Week hours also move on with the clock by themselves.
- The look is the locked Glance A style (`docs/glance/SPEC.md`, mocks in `docs/glance/mockups/`). Fonts are local woff2 in `public/fonts/`: Atkinson Hyperlegible Next for text, Figtree ("Almanac Digits") for digits, Shantell Sans for handwriting (list items and event titles in the person's ink). Build with the shared pieces in `src/components/ui.tsx` (AppFrame, ScreenHeader, Seg, Card, PersonBar, HandText, Sticker, PlusMore, Emoji). People are shown by colour chips, bars and dots, not avatars. Every page uses the same 7rem header: big title, tabs in the fixed slot, Add/Save far right (one fixed width, so the header never shifts); weather only on calendar pages. No bar at the bottom: the menu tray comes out with a swipe up from the bottom edge, and on Week and Month the Daily List with a swipe in from the right edge (mouse: a handle shows on hover). Sizes are in rem: the root font size scales with the display, so 1rem = 16px at 1920×1080. Person colours come from `src/lib/colours.ts`; content pictures are emoji drawn from `public/emoji/` (add the Fluent PNG and a line in `src/lib/emoji.ts` for new ones).
- Flag conflicts with the doc instead of guessing.
