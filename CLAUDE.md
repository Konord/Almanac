@AGENTS.md

# Almanac: notes for Claude

The Almanac Design Doc is the source of truth. Key rules from it:

- Build one phase (and one step) at a time, then stop, summarise, and wait for approval.
- The owner is new to coding: explain each new concept and choice in plain language.
- Small, testable changes with a Git commit after each working step.
- Every database change is a migration in `supabase/migrations/`. Never change a database by hand.
- Ask before adding libraries beyond those named in the doc.
- Design for the full schema, but only create what the current phase needs.
- `household_id` on every table; settings over hard-coded values; theme tokens (`src/theme/tokens.ts`) for all styling; visibility on user-facing items; suggest → approve for anything the app proposes.
- TypeScript strict mode throughout.
- Screens are built for landscape 16:9 touch displays first (the owner's main use). Main screens and menus should fit a roughly 16:9 screen (check at 1280×720 and 1920×1080) with big touch targets, without needing to scroll the page. Phones still work, but they come second.
- The look is the locked "bright" style (see the style guide linked in project memory). Build with the shared pieces in `src/components/ui.tsx` (AppFrame, ScreenHeader, Card, Avatar, Emoji). Sizes are in rem: on a landscape screen the root font size scales with the display, so 1rem = 16px at 1920×1080 and the same layout shrinks to fit 1280×720. Person colours come from `src/lib/colours.ts`; content pictures are emoji drawn from `public/emoji/` (add the Fluent PNG and a line in `src/lib/emoji.ts` for new ones).
- Flag conflicts with the doc instead of guessing.
