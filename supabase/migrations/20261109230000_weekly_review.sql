-- Tasks rework, step 4 (agreed 2026-11-09): the weekly review.
--
-- A confirm-and-tweak screen for the coming week. Every day starts from its
-- defaults (its kind of day, its chore days, its preset meals); the review
-- lets a parent switch a day's kind, move or double up chore days, and swap
-- or drop a meal, then confirm the week.
--
-- chore_day_moves   a chore day moved on one date: on = true puts it on a
--                   date it doesn't usually fall on, on = false takes it off
--                   a date it usually does. "Move Marketing to Sunday" is
--                   one of each.
-- weekly_reviews    which weeks have been confirmed (so the reminder stops),
--                   and the problems left as they are
-- breaks.from_review  a one-day break the review made when it switched a
--                   day's kind (a holiday Monday becomes a Weekend). The
--                   review replaces its own breaks; other breaks are left
--                   alone. They still show on Set days, and can be removed
--                   there too.
--
-- When the review is due is a household setting (weeklyReview: weekday and
-- time, Saturday 09:00 when missing), so it needs no change here.

-------------------------------------------------------------------------------
-- chore_day_moves
-------------------------------------------------------------------------------
create table public.chore_day_moves (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  chore_day_id uuid not null,
  date date not null,
  "on" boolean not null,
  created_at timestamptz not null default now(),
  foreign key (chore_day_id, household_id) references public.chore_days (id, household_id) on delete cascade,
  unique (household_id, chore_day_id, date)
);

create index chore_day_moves_date_idx on public.chore_day_moves (household_id, date);

-------------------------------------------------------------------------------
-- weekly_reviews
-------------------------------------------------------------------------------
create table public.weekly_reviews (
  household_id uuid not null references public.households (id) on delete cascade,
  -- The first day of the week that was reviewed.
  week_start date not null,
  reviewed_at timestamptz not null default now(),
  -- Problems the review flagged that someone chose to leave as they are.
  dismissed text[] not null default '{}',
  primary key (household_id, week_start)
);

-------------------------------------------------------------------------------
-- breaks made by the review
-------------------------------------------------------------------------------
alter table public.breaks add column from_review boolean not null default false;

-------------------------------------------------------------------------------
-- Row level security: each household sees only its own.
-------------------------------------------------------------------------------
alter table public.chore_day_moves enable row level security;
alter table public.weekly_reviews enable row level security;
revoke all on public.chore_day_moves, public.weekly_reviews from anon;
create policy "Households manage their own chore day moves" on public.chore_day_moves for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own weekly reviews" on public.weekly_reviews for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
