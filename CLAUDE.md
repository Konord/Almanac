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
- Screens are built for landscape 16:9 touch displays first (the owner's main use). Main screens and menus should fit a roughly 16:9 screen (check at 1280×720 and 1920×1080) with big touch targets. Phones still work, but they come second.
- **Nothing scrolls, anywhere** (Connor, 2026-11-05): not the page, not panels, sheets, cards or lists. It's a touchscreen. Design every screen and panel to fit at 1280×720 and 1920×1080 in every state (every tab or option open). Use columns, tabs, steppers and "+ N more" links instead of scrolling.
- The look is the locked "bright" style (see the style guide linked in project memory). Build with the shared pieces in `src/components/ui.tsx` (AppFrame, ScreenHeader, Card, Avatar, Emoji). Sizes are in rem: on a landscape screen the root font size scales with the display, so 1rem = 16px at 1920×1080 and the same layout shrinks to fit 1280×720. Person colours come from `src/lib/colours.ts`; content pictures are emoji drawn from `public/emoji/` (add the Fluent PNG and a line in `src/lib/emoji.ts` for new ones).
- Flag conflicts with the doc instead of guessing.
