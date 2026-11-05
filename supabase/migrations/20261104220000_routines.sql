-- Phase 3, step 1: routines.
--
-- Routines are checklists that sit over the calendar (morning, bedtime,
-- after school). They never take event space or make a day busier.
--
-- routine_templates    a routine, e.g. "School morning"
-- routine_steps        its steps in order, e.g. "Brush teeth, by 7:45"
-- routine_assignments  who does it and when: on certain weekdays, or on one
--                      date (which swaps out that kind of routine for the day)
-- routine_checks       a step ticked off by one person on one date

-------------------------------------------------------------------------------
-- routine_templates
-------------------------------------------------------------------------------
create table public.routine_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  -- morning, night (bedtime) or daily (any other time, e.g. after school)
  kind text not null default 'morning' check (kind in ('morning', 'night', 'daily')),
  -- Who it's written for. Kids' routines lean on pictures.
  audience text not null default 'everyone' check (audience in ('kid', 'adult', 'everyone')),
  -- True for the ready-made routines Almanac starts you with.
  premade boolean not null default false,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index routine_templates_household_id_idx on public.routine_templates (household_id);

create trigger routine_templates_set_updated_at
before update on public.routine_templates
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- routine_steps
-------------------------------------------------------------------------------
create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  template_id uuid not null,
  text text not null check (length(trim(text)) between 1 and 80),
  -- A picture for the step: one emoji, e.g. 🪥
  icon text check (icon is null or length(icon) <= 16),
  position integer not null default 0,
  -- Optional "by" time, e.g. teeth by 07:45
  target_time time,
  -- Essential steps are the ones kept on Low and Survival days.
  essential boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (template_id, household_id) references public.routine_templates (id, household_id) on delete cascade
);

create index routine_steps_template_idx on public.routine_steps (template_id, position);

create trigger routine_steps_set_updated_at
before update on public.routine_steps
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- routine_assignments
-------------------------------------------------------------------------------
create table public.routine_assignments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  template_id uuid not null,
  member_id uuid not null,
  -- Either repeating weekdays (0 = Sunday ... 6 = Saturday)...
  weekdays smallint[],
  -- ...or a single date.
  on_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (template_id, household_id) references public.routine_templates (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade,
  constraint routine_assignments_weekdays_or_date check (
    (weekdays is not null and on_date is null
      and cardinality(weekdays) between 1 and 7
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
    or (weekdays is null and on_date is not null)
  )
);

create index routine_assignments_member_idx on public.routine_assignments (member_id);

create trigger routine_assignments_set_updated_at
before update on public.routine_assignments
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- routine_checks
-------------------------------------------------------------------------------
create table public.routine_checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  step_id uuid not null,
  -- The household's local date the step was done for.
  check_date date not null,
  done_at timestamptz not null default now(),
  unique (member_id, step_id, check_date),
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade,
  foreign key (step_id, household_id) references public.routine_steps (id, household_id) on delete cascade
);

create index routine_checks_date_idx on public.routine_checks (household_id, check_date);

-------------------------------------------------------------------------------
-- Security: each household only sees and changes its own routines.
-------------------------------------------------------------------------------
alter table public.routine_templates enable row level security;
alter table public.routine_steps enable row level security;
alter table public.routine_assignments enable row level security;
alter table public.routine_checks enable row level security;
revoke all on public.routine_templates, public.routine_steps, public.routine_assignments, public.routine_checks from anon;

create policy "Households manage their own routines"
on public.routine_templates for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own routine steps"
on public.routine_steps for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own routine assignments"
on public.routine_assignments for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own routine checks"
on public.routine_checks for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Ready-made routines (drafts for the family to edit)
-------------------------------------------------------------------------------
create function public.add_starter_routines(target_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid;
begin
  insert into public.routine_templates (household_id, name, kind, audience, premade, sort_order)
  values (target_household, 'School morning', 'morning', 'kid', true, 1)
  returning id into t;
  insert into public.routine_steps (household_id, template_id, position, icon, text, target_time, essential) values
    (target_household, t, 1, '🛏️', 'Get up', '07:00', false),
    (target_household, t, 2, '🚽', 'Toilet', null, false),
    (target_household, t, 3, '👕', 'Get dressed', '07:15', true),
    (target_household, t, 4, '🥣', 'Breakfast', '07:30', true),
    (target_household, t, 5, '🪥', 'Brush teeth', '07:45', true),
    (target_household, t, 6, '💇', 'Brush hair', null, false),
    (target_household, t, 7, '🎒', 'Pack backpack', '08:00', false),
    (target_household, t, 8, '🧥', 'Shoes and coat on', '08:10', true);

  insert into public.routine_templates (household_id, name, kind, audience, premade, sort_order)
  values (target_household, 'Weekend morning', 'morning', 'everyone', true, 2)
  returning id into t;
  insert into public.routine_steps (household_id, template_id, position, icon, text, target_time, essential) values
    (target_household, t, 1, '🛏️', 'Get up and make the bed', null, false),
    (target_household, t, 2, '👕', 'Get dressed', null, true),
    (target_household, t, 3, '🥞', 'Breakfast', null, true),
    (target_household, t, 4, '🪥', 'Brush teeth', null, true),
    (target_household, t, 5, '🧸', 'Tidy bedroom', null, false);

  insert into public.routine_templates (household_id, name, kind, audience, premade, sort_order)
  values (target_household, 'After school', 'daily', 'kid', true, 3)
  returning id into t;
  insert into public.routine_steps (household_id, template_id, position, icon, text, target_time, essential) values
    (target_household, t, 1, '🎒', 'Unpack backpack and lunch box', null, true),
    (target_household, t, 2, '🧼', 'Wash hands', null, true),
    (target_household, t, 3, '🍎', 'Snack', null, false),
    (target_household, t, 4, '📚', 'Homework or reading', null, false),
    (target_household, t, 5, '🎮', 'Free time', null, false);

  insert into public.routine_templates (household_id, name, kind, audience, premade, sort_order)
  values (target_household, 'Bedtime', 'night', 'kid', true, 4)
  returning id into t;
  insert into public.routine_steps (household_id, template_id, position, icon, text, target_time, essential) values
    (target_household, t, 1, '🧸', 'Tidy toys', '19:00', false),
    (target_household, t, 2, '🛁', 'Bath or shower', null, false),
    (target_household, t, 3, '👕', 'Pyjamas on', null, true),
    (target_household, t, 4, '🪥', 'Brush teeth', null, true),
    (target_household, t, 5, '🚽', 'Toilet', null, true),
    (target_household, t, 6, '📖', 'Story', '19:45', false),
    (target_household, t, 7, '😴', 'Lights out', '20:00', true);

  insert into public.routine_templates (household_id, name, kind, audience, premade, sort_order)
  values (target_household, 'Evening reset', 'night', 'adult', true, 5)
  returning id into t;
  insert into public.routine_steps (household_id, template_id, position, icon, text, target_time, essential) values
    (target_household, t, 1, '🍽️', 'Dishes done', null, true),
    (target_household, t, 2, '🧽', 'Wipe the counters', null, false),
    (target_household, t, 3, '🧺', 'Move the laundry along', null, false),
    (target_household, t, 4, '🥪', 'Pack lunches', null, false),
    (target_household, t, 5, '📅', 'Look at tomorrow', null, false),
    (target_household, t, 6, '🔒', 'Lock up', null, true);
end;
$$;

revoke execute on function public.add_starter_routines(uuid) from public, anon, authenticated;

-- Households that already exist get the ready-made routines now...
select public.add_starter_routines(id) from public.households;

-- ...and new households get them when they're created.
create function public.households_add_starter_routines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_starter_routines(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_starter_routines() from public, anon, authenticated;

create trigger households_add_starter_routines
after insert on public.households
for each row execute function public.households_add_starter_routines();
