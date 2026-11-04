# Almanac

A self-hosted family command centre for the kitchen wall: a calendar that
understands the shape of each day and uses it to drive chores, meals and
to-dos. It suggests; the parents approve.

The full plan lives in the **Almanac Design Doc**. This repo is built one
phase at a time, following its build order.

## What's here so far (Phase 1, Phase 2 step 1)

| Folder / file | What it is |
| --- | --- |
| `src/app/` | The screens. `page.tsx` is the home screen, `layout.tsx` wraps every page. |
| `src/theme/tokens.ts` | Every colour and size the app uses. Change the look here, never in components. |
| `src/app/login`, `setup`, `household` | Sign in, first-time household setup, and the people and settings screen. |
| `src/app/calendar` | Layers (Court, Appointments, Kids, Family…) and one-off events for the next two weeks. |
| `src/lib/recurrence.ts` | Turns repeating events ("every Tuesday") into the individual dates shown on the calendar, with skips and moves. Has tests. |
| `src/lib/time.ts` | Converts between local times ("9am in Toronto") and the moments the database stores. Has tests. |
| `src/lib/` | Shared code: the database connection (`supabase/`), household settings (`household.ts`) and generated database types. |
| `src/proxy.ts` | Runs before every page: keeps the login fresh and sends signed-out visitors to sign in. |
| `supabase/migrations/` | Every change to the database, in order. Never edit the database by hand. |
| `supabase/tests/` | Security checks for the database (who can see what). |
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

The first time only: `npx supabase start` prints some addresses and keys.
Copy `.env.example` to `.env.local` and paste in the **API URL** and the
**Publishable key**. (These local keys are the same for everyone and only
work on your own PC.)

Open http://localhost:3000. You'll be sent to sign in:

1. Enter an email and password and press **Create household login**. Locally,
   no email is actually sent.
2. Name your household.
3. Add the people in it, and set a PIN for each parent.

The **Studio** address `npx supabase start` printed (usually
http://127.0.0.1:54323) is the database admin dashboard, where you can look
at the tables.

When you're done: press `Ctrl+C` to stop the app, and run
`npx supabase stop` to stop the database.

## Changing the database

1. Create a new migration: `npx supabase migration new describe_the_change`
2. Write the SQL in the file it creates under `supabase/migrations/`.
3. `npm run db:reset` rebuilds your local database from all migrations (it wipes local data).
4. `npm run db:types` updates `src/lib/database.types.ts` so TypeScript knows about the change.

## Checking your work

```bash
npm run lint         # spots common mistakes
npm test             # checks the tricky logic (time zones so far)
npm run test:db      # checks the database security rules
npm run build        # builds the production version; if this passes, it will deploy
```

## Rules of the road

- Every database change is a migration file in `supabase/migrations/`, applied to dev first, then production. Never edit a database by hand.
- `.env` files hold passwords and keys and are never committed.
- Colours, fonts and sizes come from theme tokens, never hard-coded.
- Every table carries `household_id`.
