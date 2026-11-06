-- Scheduling model, step 5: chore blocks and chore to-dos.
--
-- A chore never sits on the calendar itself. When it comes due it makes a
-- to-do that carries its minutes. Chore time goes on the calendar as
-- chore blocks, which float like routines:
--   closed  one chore is the whole block, e.g. Laundry on Monday
--   open    some chores always go in (presets), and the rest of the time
--           is filled with chores that are due, e.g. Big clean on Saturday
-- A due chore's to-do goes in a block if there's room; otherwise it sits
-- on the to-do list.
--
-- chore_blocks         a block of chore time on some weekdays
-- chore_block_presets  the chores an open block always includes

create table public.chore_blocks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  kind text not null default 'open' check (kind in ('open', 'closed')),
  -- A closed block's chore.
  chore_id uuid,
  -- 0 = Sunday … 6 = Saturday.
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  start_time time not null default '10:00',
  minutes integer not null default 60 check (minutes between 10 and 480),
  -- Who does it. They see it in their column on Today.
  member_ids uuid[] not null default '{}',
  -- Loose: may move as far as it needs to, like a loose routine.
  loose boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  constraint chore_blocks_closed_has_chore check (kind = 'open' or chore_id is not null),
  foreign key (chore_id, household_id) references public.task_templates (id, household_id) on delete cascade
);

create trigger chore_blocks_set_updated_at before update on public.chore_blocks
for each row execute function public.set_updated_at();

create table public.chore_block_presets (
  block_id uuid not null,
  chore_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (block_id, chore_id),
  foreign key (block_id, household_id) references public.chore_blocks (id, household_id) on delete cascade,
  foreign key (chore_id, household_id) references public.task_templates (id, household_id) on delete cascade
);

-------------------------------------------------------------------------------
-- Chore to-dos
-------------------------------------------------------------------------------
-- A chore's to-do has both its chore (template_id) and a list. Ticking it
-- off is the chore's round, so the chore's clock moves on.
alter table public.task_instances drop constraint task_instances_todo_or_chore;
alter table public.task_instances add constraint task_instances_todo_or_chore check (
  (template_id is null and list_id is not null and title is not null)
  or (template_id is not null and list_id is null)
  or (template_id is not null and list_id is not null and title is not null)
);

alter table public.task_instances
  -- How long it takes (a chore's to-do carries the chore's minutes).
  add column minutes integer check (minutes is null or minutes between 1 and 1440),
  -- Swapped out of a block: not put back in one before this date.
  add column not_before date;

-- One open to-do per chore at a time.
create unique index task_instances_one_open_chore_todo on public.task_instances (template_id)
where status = 'open' and list_id is not null;

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.chore_blocks enable row level security;
alter table public.chore_block_presets enable row level security;
revoke all on public.chore_blocks, public.chore_block_presets from anon;
create policy "Households manage their own chore blocks" on public.chore_blocks for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own chore block presets" on public.chore_block_presets for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- A starter chore that opens the meal planner
-------------------------------------------------------------------------------
create function public.add_plan_meals_chore(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_templates
    (household_id, premade, sort_order, name, icon, size, est_minutes, repeat_every, repeat_unit, preferred_weekday, location, importance, link)
  values (target_household, true, 9, 'Plan next week''s meals', '🗓️', 'small', 20, 1, 'week', 6, 'indoor', 'normal', '/meals');
$$;

revoke execute on function public.add_plan_meals_chore(uuid) from public, anon, authenticated;

select public.add_plan_meals_chore(id) from public.households;

create function public.households_add_plan_meals_chore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_plan_meals_chore(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_plan_meals_chore() from public, anon, authenticated;

create trigger households_add_plan_meals_chore
after insert on public.households
for each row execute function public.households_add_plan_meals_chore();
