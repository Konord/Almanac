## Standing context for every Glance task (read once, keep in mind)

You are working in /workspace/almanac-glance on branch `glance-redesign`. The owner (Connor) has approved this whole redesign in advance and is reviewing only at the end via a PR, so for this branch:
- Do NOT stop after a step to wait for approval (overrides the CLAUDE.md "stop and wait" rule for this work). Finish the task you are given, commit, and summarise.
- NEVER push, never touch `main`, never rebase/force anything. Just commit to `glance-redesign`. I (the coordinator) push.
- Never modify `supabase/config.toml` (it has local-only port changes) and never commit `.env.local`.
- No new npm dependencies. Fonts are local woff2 files (copy them from docs/glance/mockups/fonts into public/fonts and use @font-face).
- **Primary target resolution is 2560x1440** (Connor's real kitchen screen). Lay out and judge everything at 2560x1440 first. 1920x1080 is only a secondary sanity check (it must not break). The old CLAUDE.md "check at 1280x720 / 1920x1080" guidance is superseded for this redesign. The root font size scales with the viewport (min(0.8333vw,1.4815vh)) exactly like the mockups, so rem values from the mockup CSS translate 1:1.
- Accessibility floor: text >= 18px at 1080-equivalent (i.e. >= 24px real at 1440), contrast >= 4.5:1, touch targets >= 48px (1080-equivalent).
- The design spec is docs/glance/SPEC.md. It is a history log; the authoritative rules are the sections from "### Finalized agenda — original Glance A, tweaked" (line ~273) to the end, plus "Month view tap rule", "Global header rule", "Month view Daily List panel — PUSH is locked", "LOCKED style: week view", "Week view: LOCKED", "Remaining screens", "Planner review: skipped items". Later sections override earlier ones.
- docs/glance/feature-parity.md lists every live feature per screen. NEVER drop a live feature for the sake of the UI. If the mock lacks a live feature, keep the feature and style it in the Glance language.
- Mockup HTML: docs/glance/mockups/glance/src/g-final-*.html (shared CSS g-final-chrome.css, plus ../../src/base.css and a.css). Reference screenshots at 2560x1440: docs/glance/shots/. You may read the mock HTML/CSS and port values (sizes, colours, spacing) directly.
- Where CLAUDE.md conflicts with the locked spec, the locked spec wins (e.g. the Agenda "+X more" line may scroll the event column; Settings gets a Sounds block). Note any such conflict in your summary.
- Keep using theme tokens (src/theme/tokens.ts) and shared UI pieces (src/components/ui.tsx); update tokens/components rather than hard-coding styles in screens.
- Sounds: no audio files exist. Wire the sound system + settings (mute, quiet hours, output = screen speaker) with placeholder hooks only; never invent or download audio.
- Night mode: deferred, skip it.
- Local app: dev server runs at http://localhost:3100 (already running with hot reload; do not start another on that port). Local Supabase API at http://127.0.0.1:55321 (DB postgresql://postgres:postgres@127.0.0.1:55322/postgres). If you add a migration, apply it with `npx supabase migration up` (not db reset) and regenerate types with `npx supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:55322/postgres > src/lib/database.types.ts`.
- Before committing, run `npm run lint` and `npx tsc --noEmit` and `npm test`; fix what you broke.
- Commit with a clear message prefixed "glance:". End your reply with a short summary: what changed, files, any deviations from the mock and why, any parity features you had to touch.
