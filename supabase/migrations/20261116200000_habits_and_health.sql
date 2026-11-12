-- Habits and health tracking (2026-11-12, thread "Plan habit and frequency trackers").
--
-- Connor: habits get their own page (Lines or Rings, picked in Settings).
-- They come from two places:
--
-- 1. Routines. A whole routine can be tracked (routine_templates.habit_since,
--    already here: done on a day when all its steps are ticked), or single
--    steps (routine_steps.habit_since, new). Tracked steps are matched by
--    name per person across routines, so "Brush teeth" in a weekday and a
--    weekend bedtime routine is one habit. Routine habits are tick only and
--    follow the routine's own days.
--
-- 2. The Habit Manager (habits). "Check it" (done or not) or "Count it"
--    (a goal and a unit, e.g. 8 glasses, with how much each tap adds), and
--    how often: every day, some weekdays, N times a week or N times a month.
--    habit_logs keeps one row per person per day with the amount so far.
--
-- Health (health_trackers): medicine, a number (temperature) or a few words
-- (symptoms), for the people picked. Medicine has choices (Tylenol, Advil),
-- each with an amount per person, how long to wait between doses and the
-- most a day. These are numbers the family types in: Almanac never
-- suggests a dose, and a dose that's too soon only warns, never blocks.
-- health_logs keeps every entry.

-------------------------------------------------------------------------------
-- Routine steps: track one step as a habit
-------------------------------------------------------------------------------
-- The old per-step switch only meant something while the whole routine was
-- tracked (and was hidden on screen), so it goes. A step now has its own
-- start day, like the routine.
alter table public.routine_steps drop column habit;
alter table public.routine_steps add column habit_since date;
comment on column public.routine_steps.habit_since is 'When this step started being tracked as a habit. Null: not tracked.';
comment on column public.routine_templates.habit_since is 'When the whole routine started being tracked as one habit (done when every step is ticked). Null: not tracked.';

-------------------------------------------------------------------------------
-- Habits made in the Habit Manager
-------------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  -- 'check': done or not. 'count': add up to a goal (goal + unit, step per tap).
  measure text not null default 'check' check (measure in ('check', 'count')),
  goal integer not null default 1 check (goal between 1 and 10000),
  unit text check (unit is null or length(unit) <= 20),
  step integer not null default 1 check (step between 1 and 10000),
  -- 'daily' every day; 'days' on the weekdays picked (0 = Sunday);
  -- 'week' / 'month' a number of times in each week or month.
  frequency text not null default 'daily' check (frequency in ('daily', 'days', 'week', 'month')),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  times integer not null default 1 check (times between 1 and 31),
  -- Days before this never count as missed.
  since date not null default current_date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  check (frequency <> 'days' or cardinality(weekdays) > 0)
);
create index habits_household_idx on public.habits (household_id, sort_order);
create trigger habits_set_updated_at before update on public.habits
for each row execute function public.set_updated_at();

create table public.habit_members (
  habit_id uuid not null,
  member_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (habit_id, member_id),
  foreign key (habit_id, household_id) references public.habits (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);
create index habit_members_household_idx on public.habit_members (household_id);

-- One row per person per day: how much was done (1 for a checked day).
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  habit_id uuid not null,
  member_id uuid not null,
  log_date date not null,
  amount integer not null check (amount between 0 and 100000),
  updated_at timestamptz not null default now(),
  unique (habit_id, member_id, log_date),
  foreign key (habit_id, household_id) references public.habits (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);
create index habit_logs_member_date_idx on public.habit_logs (member_id, log_date);
create trigger habit_logs_set_updated_at before update on public.habit_logs
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Health trackers
-------------------------------------------------------------------------------
create table public.health_trackers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  -- 'medicine' doses from its choices; 'number' a reading (temperature);
  -- 'note' a few words (symptoms).
  kind text not null check (kind in ('medicine', 'number', 'note')),
  unit text check (unit is null or length(unit) <= 12),
  -- A number tracker's readings above this are shaded (a fever).
  alert_above numeric check (alert_above is null or kind = 'number'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);
create index health_trackers_household_idx on public.health_trackers (household_id, sort_order);
create trigger health_trackers_set_updated_at before update on public.health_trackers
for each row execute function public.set_updated_at();

create table public.health_tracker_members (
  tracker_id uuid not null,
  member_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (tracker_id, member_id),
  foreign key (tracker_id, household_id) references public.health_trackers (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);
create index health_tracker_members_household_idx on public.health_tracker_members (household_id);

-- A medicine's choices: Tylenol, Advil. The wait and the most a day are the family's own numbers.
create table public.health_choices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  tracker_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  wait_minutes integer check (wait_minutes is null or wait_minutes between 0 and 10080),
  max_per_day integer check (max_per_day is null or max_per_day between 1 and 50),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (tracker_id, household_id) references public.health_trackers (id, household_id) on delete cascade
);
create index health_choices_tracker_idx on public.health_choices (tracker_id, sort_order);
create trigger health_choices_set_updated_at before update on public.health_choices
for each row execute function public.set_updated_at();

-- How much of a choice each person takes (7.5 ml for Ava, 10 ml for Sam).
create table public.health_choice_amounts (
  choice_id uuid not null,
  member_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  amount text not null check (length(trim(amount)) between 1 and 20),
  primary key (choice_id, member_id),
  foreign key (choice_id, household_id) references public.health_choices (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);
create index health_choice_amounts_household_idx on public.health_choice_amounts (household_id);

-- Every dose, reading and note. A dose keeps its choice's name and amount
-- as they were, so changing or removing a choice later doesn't rewrite it.
create table public.health_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  tracker_id uuid not null,
  member_id uuid not null,
  choice_id uuid references public.health_choices (id) on delete set null,
  choice_name text check (choice_name is null or length(choice_name) <= 40),
  logged_at timestamptz not null default now(),
  amount text check (amount is null or length(amount) <= 20),
  value numeric,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tracker_id, household_id) references public.health_trackers (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);
create index health_logs_member_time_idx on public.health_logs (member_id, logged_at desc);
create trigger health_logs_set_updated_at before update on public.health_logs
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security: each household sees and changes only its own rows
-------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['habits', 'habit_members', 'habit_logs', 'health_trackers', 'health_tracker_members', 'health_choices', 'health_choice_amounts', 'health_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Households manage their own %s" on public.%I for all to authenticated using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()))',
      replace(t, '_', ' '),
      t
    );
  end loop;
end
$$;
