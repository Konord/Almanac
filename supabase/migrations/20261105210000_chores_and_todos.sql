-- Phase 3, step 3: chores and to-dos.
--
-- One task system for both (as the design doc says):
--
-- task_templates   a chore that comes back, e.g. "Clean the fridge, about
--                  monthly" or "Winter tires on, Oct 15 to Nov 30"
-- task_lists       named to-do lists, e.g. "To-do" or "Errands"
-- task_instances   one task: a one-off to-do (on a list, with an optional
--                  date and person), or one done/skipped round of a chore
--
-- A chore's "last done" is just its newest done (or skipped) instance, so
-- skipping never piles up as overdue: it simply starts the clock again.
-- Placement onto days (suggest → approve) comes in a later step.

-------------------------------------------------------------------------------
-- task_templates (chores)
-------------------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  -- A picture: one emoji, e.g. 🧹
  icon text check (icon is null or length(icon) <= 16),
  size text not null default 'small' check (size in ('small', 'medium', 'big')),
  est_minutes integer check (est_minutes is null or est_minutes between 1 and 1440),
  -- How often: every N days/weeks/months/years after it was last done.
  repeat_every integer not null default 1 check (repeat_every between 1 and 365),
  repeat_unit text not null default 'week' check (repeat_unit in ('day', 'week', 'month', 'year')),
  -- Optional: the weekday it likes (0 = Sunday ... 6 = Saturday), e.g. Saturday cleaning.
  preferred_weekday smallint check (preferred_weekday between 0 and 6),
  -- Optional season window, "MM-DD" to "MM-DD" (may wrap past New Year).
  season_start text check (season_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  season_end text check (season_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  location text not null default 'indoor' check (location in ('indoor', 'outdoor')),
  -- The lowest energy mode it still shows in (used once energy modes arrive).
  min_energy_mode text not null default 'normal' check (min_energy_mode in ('normal', 'low', 'survival')),
  default_assignee_id uuid,
  notes text check (length(notes) <= 2000),
  active boolean not null default true,
  premade boolean not null default false,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (default_assignee_id, household_id) references public.members (id, household_id) on delete set null (default_assignee_id),
  constraint task_templates_season_both check ((season_start is null) = (season_end is null))
);

create index task_templates_household_id_idx on public.task_templates (household_id);

create trigger task_templates_set_updated_at
before update on public.task_templates
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- task_lists (to-do lists)
-------------------------------------------------------------------------------
create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index task_lists_household_id_idx on public.task_lists (household_id);

create trigger task_lists_set_updated_at
before update on public.task_lists
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- task_instances (to-dos, and each round of a chore)
-------------------------------------------------------------------------------
create table public.task_instances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Set for a chore round; empty for a one-off to-do.
  template_id uuid,
  -- Set for a to-do (which list it's on).
  list_id uuid,
  -- A to-do's words (a chore round uses its template's name).
  title text check (title is null or length(trim(title)) between 1 and 120),
  icon text check (icon is null or length(icon) <= 16),
  -- Optional: the day it's for.
  due_date date,
  assignee_id uuid,
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  completed_by uuid,
  completed_at timestamptz,
  -- The household's local date it was done or skipped on.
  completed_on date,
  -- Optional: how long it really took.
  actual_minutes integer check (actual_minutes is null or actual_minutes between 1 and 1440),
  notes text check (length(notes) <= 2000),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (template_id, household_id) references public.task_templates (id, household_id) on delete cascade,
  foreign key (list_id, household_id) references public.task_lists (id, household_id) on delete cascade,
  foreign key (assignee_id, household_id) references public.members (id, household_id) on delete set null (assignee_id),
  foreign key (completed_by, household_id) references public.members (id, household_id) on delete set null (completed_by),
  -- A to-do has words and a list; a chore round has its chore.
  constraint task_instances_todo_or_chore check (
    (template_id is null and list_id is not null and title is not null)
    or (template_id is not null and list_id is null)
  ),
  -- Done and skipped things say when.
  constraint task_instances_closed_has_date check (status = 'open' or completed_on is not null)
);

create index task_instances_template_idx on public.task_instances (template_id, completed_on);
create index task_instances_list_idx on public.task_instances (list_id, status);
create index task_instances_household_status_idx on public.task_instances (household_id, status);

create trigger task_instances_set_updated_at
before update on public.task_instances
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security: each household only sees and changes its own chores and to-dos.
-------------------------------------------------------------------------------
alter table public.task_templates enable row level security;
alter table public.task_lists enable row level security;
alter table public.task_instances enable row level security;
revoke all on public.task_templates, public.task_lists, public.task_instances from anon;

create policy "Households manage their own chores"
on public.task_templates for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own lists"
on public.task_lists for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own tasks"
on public.task_instances for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Starter chores and lists. A starting point in the Home Comforts spirit,
-- plus the Canadian seasonal list. Every one can be changed, paused or removed.
-------------------------------------------------------------------------------
create function public.add_starter_chores(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (household_id, name, icon, sort_order) values
    (target_household, 'To-do', '📝', 1),
    (target_household, 'Errands', '🚗', 2);

  insert into public.task_templates
    (household_id, premade, sort_order, name, icon, size, est_minutes, repeat_every, repeat_unit, preferred_weekday, season_start, season_end, location, min_energy_mode)
  values
    -- Weekly rhythm
    (target_household, true, 10, 'Vacuum and mop the floors', '🧹', 'big', 60, 1, 'week', 6, null, null, 'indoor', 'normal'),
    (target_household, true, 11, 'Clean the bathrooms', '🚽', 'medium', 40, 1, 'week', 6, null, null, 'indoor', 'normal'),
    (target_household, true, 12, 'Change the bed sheets', '🛏️', 'medium', 30, 1, 'week', 0, null, null, 'indoor', 'normal'),
    (target_household, true, 13, 'Wash the towels', '🧺', 'small', 15, 1, 'week', null, null, null, 'indoor', 'low'),
    (target_household, true, 14, 'Garbage and recycling out', '🗑️', 'small', 10, 1, 'week', null, null, null, 'outdoor', 'survival'),
    (target_household, true, 15, 'Water the plants', '🪴', 'small', 10, 1, 'week', null, null, null, 'indoor', 'low'),
    (target_household, true, 16, 'Dust the main rooms', '🧽', 'medium', 30, 2, 'week', null, null, null, 'indoor', 'normal'),
    (target_household, true, 17, 'Tidy the entry and boots', '🧥', 'small', 15, 1, 'week', null, null, null, 'indoor', 'low'),
    -- Monthly and every few months
    (target_household, true, 20, 'Clean out the fridge', '🧊', 'medium', 30, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 21, 'Clean the dishwasher filter', '🍽️', 'small', 10, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 22, 'Descale the kettle', '🫖', 'small', 10, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 23, 'Vacuum the couch', '🛋️', 'small', 15, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 24, 'Wash the shower curtain and bath mats', '🚿', 'small', 15, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 25, 'Clean the oven', '🍳', 'big', 60, 3, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 26, 'Wipe the baseboards', '🧽', 'medium', 45, 3, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 27, 'Change the furnace filter', '🔥', 'small', 10, 3, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 28, 'Wash the windows', '🪟', 'big', 90, 6, 'month', null, null, null, 'outdoor', 'normal'),
    (target_household, true, 29, 'Flip or rotate the mattresses', '🛏️', 'small', 15, 6, 'month', null, null, null, 'indoor', 'normal'),
    -- Canadian seasonal list (once a year, inside its window)
    (target_household, true, 40, 'Winter tires on', '🛞', 'medium', 60, 1, 'year', null, '10-15', '11-30', 'outdoor', 'normal'),
    (target_household, true, 41, 'Winter tires off', '🛞', 'medium', 60, 1, 'year', null, '04-15', '05-31', 'outdoor', 'normal'),
    (target_household, true, 42, 'Furnace check-up', '🔥', 'small', 15, 1, 'year', null, '09-01', '10-31', 'indoor', 'normal'),
    (target_household, true, 43, 'Clean the gutters', '🪜', 'big', 90, 1, 'year', null, '10-15', '11-30', 'outdoor', 'normal'),
    (target_household, true, 44, 'Shut off and drain the outside taps', '💧', 'small', 20, 1, 'year', null, '10-01', '11-15', 'outdoor', 'normal'),
    (target_household, true, 45, 'Turn the outside taps back on', '💧', 'small', 10, 1, 'year', null, '04-15', '05-15', 'outdoor', 'normal'),
    (target_household, true, 46, 'Test smoke and CO alarms (fall time change)', '🔋', 'small', 15, 1, 'year', null, '10-25', '11-10', 'indoor', 'low'),
    (target_household, true, 47, 'Test smoke and CO alarms (spring time change)', '🔋', 'small', 15, 1, 'year', null, '03-01', '03-20', 'indoor', 'low'),
    (target_household, true, 48, 'Rake the leaves', '🍂', 'big', 90, 1, 'year', null, '10-15', '11-20', 'outdoor', 'normal'),
    (target_household, true, 49, 'Put away the patio furniture', '⛱️', 'medium', 45, 1, 'year', null, '10-01', '10-31', 'outdoor', 'normal'),
    (target_household, true, 50, 'Bring out the patio furniture', '⛱️', 'medium', 45, 1, 'year', null, '05-01', '05-31', 'outdoor', 'normal'),
    (target_household, true, 51, 'Shovel, salt and car winter kit ready', '🧂', 'small', 30, 1, 'year', null, '11-01', '11-30', 'outdoor', 'normal'),
    (target_household, true, 52, 'Clean the dryer vent', '🧦', 'medium', 30, 1, 'year', null, '09-01', '10-15', 'indoor', 'normal'),
    (target_household, true, 53, 'Air conditioner check', '❄️', 'small', 20, 1, 'year', null, '05-01', '06-15', 'outdoor', 'normal');
$$;

revoke execute on function public.add_starter_chores(uuid) from public, anon, authenticated;

-- Households that already exist get the starter chores now...
select public.add_starter_chores(id) from public.households;

-- ...and new households get them when they're created.
create function public.households_add_starter_chores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_starter_chores(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_starter_chores() from public, anon, authenticated;

create trigger households_add_starter_chores
after insert on public.households
for each row execute function public.households_add_starter_chores();
