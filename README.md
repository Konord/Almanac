# Almanac

A self-hosted family command centre for the kitchen wall: a calendar that
understands the shape of each day and uses it to drive chores, meals and
to-dos. It suggests; the parents approve.

The full plan lives in the **Almanac Design Doc**. This repo is built one
phase at a time, following its build order.

## What's here so far (Phase 1, step 1)

| Folder / file | What it is |
| --- | --- |
| `src/app/` | The screens. `page.tsx` is the home screen, `layout.tsx` wraps every page. |
| `src/theme/tokens.ts` | Every colour and size the app uses. Change the look here, never in components. |
| `supabase/` | Settings for the local Supabase (database, logins, admin dashboard). Migrations will go in `supabase/migrations/`. |
| `.env.example` | The list of secret settings the app needs. Copy it to `.env.local` and fill it in. |

## One-time setup on your PC (Windows)

Install these once:

1. **Node.js 22 LTS** from https://nodejs.org (this also installs `npm`).
2. **Docker Desktop** from https://www.docker.com/products/docker-desktop. Start it and leave it running; Supabase runs inside it.
3. **Git** from https://git-scm.com, and **VS Code** from https://code.visualstudio.com.

Then, in a terminal (VS Code: *Terminal → New Terminal*):

```bash
git clone https://github.com/Konord/Almanac.git
cd Almanac
npm install          # downloads the libraries listed in package.json
```

## Running it day to day

```bash
npx supabase start   # starts the local database in Docker (first run takes a few minutes)
npm run dev          # starts the app
```

Open http://localhost:3000. You should see the blank whiteboard with
today's date.

`npx supabase start` prints some local addresses and keys. The one called
**Studio** (usually http://127.0.0.1:54323) is the database admin
dashboard. Nothing is in the database yet; tables arrive in step 2.

When you're done: press `Ctrl+C` to stop the app, and run
`npx supabase stop` to stop the database.

## Checking your work

```bash
npm run lint         # spots common mistakes
npm run build        # builds the production version; if this passes, it will deploy
```

## Rules of the road

- Every database change is a migration file in `supabase/migrations/`, applied to dev first, then production. Never edit a database by hand.
- `.env` files hold passwords and keys and are never committed.
- Colours, fonts and sizes come from theme tokens, never hard-coded.
- Every table carries `household_id`.
