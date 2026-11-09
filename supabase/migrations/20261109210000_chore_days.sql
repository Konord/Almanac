-- Tasks rework, step 2 (agreed 2026-11-09): chore days and the chore
-- generator.
--
-- Chores no longer get time on the calendar (chore blocks are gone). Each
-- day has one or more chore days instead: Laundry on Tuesday, Kitchen on
-- Saturday, and a Free day for any day with nothing else. Chores only ever
-- show on the daily list in the Today panel:
--
--   preset     shows every time its chore day comes round
--              ("Launder clothes in bins" every Laundry day)
--   generated  has a date rule ("wash the blankets every 3 months") and is
--              put on the best matching day that has room
--
-- A chore day has room for a few chores (max_tasks, counting generated
-- chores, not presets) and a few Big ones (max_big). A restrictive chore
-- day only takes chores tagged for it.
--
-- Tags come from a fixed list so the generator understands every one:
--   essential  the Survival button can't skip it; it rolls to tomorrow
--   big        counts against the day's Big limit
--   outdoor    for dry, daylight days (used once weather arrives)
--   errand     needs leaving the house; errands are grouped onto one day
-- plus a tag per chore day (task_template_chore_days).
--
-- Size, minutes, importance and inside/outside are replaced by the tags.
--
-- chore_days                  the household's chore days (one is Free day)
-- task_template_chore_days    which chore days a chore may go on

-------------------------------------------------------------------------------
-- chore_days
-------------------------------------------------------------------------------
create table public.chore_days (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  -- 0 = Sunday … 6 = Saturday. Free day has none: it fills days with no other chore day.
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  -- Days next to each other are one stretch (Big Clean, Saturday and Sunday).
  span boolean not null default false,
  -- Only takes chores tagged for it (Laundry day: only laundry).
  restrictive boolean not null default false,
  -- Room for this many generated chores, and this many Big ones.
  max_tasks smallint not null default 3 check (max_tasks between 0 and 20),
  max_big smallint not null default 1 check (max_big between 0 and 20),
  is_free boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  constraint chore_days_free_has_no_weekdays check (not is_free or cardinality(weekdays) = 0)
);

create index chore_days_household_idx on public.chore_days (household_id);
-- One Free day per household.
create unique index chore_days_one_free on public.chore_days (household_id) where is_free;
create trigger chore_days_set_updated_at before update on public.chore_days
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Chores: preset or generated, tags, an optional exact time, and a
-- "not before" date set when one is skipped (it waits until then).
-------------------------------------------------------------------------------
alter table public.task_templates
  add column kind text not null default 'generated' check (kind in ('preset', 'generated')),
  add column tags text[] not null default '{}' check (tags <@ array['essential', 'big', 'outdoor', 'errand']),
  add column at_time time,
  add column not_before date;

update public.task_templates set tags = array_remove(array[
  case when size = 'big' then 'big' end,
  case when importance = 'high' then 'essential' end,
  case when location = 'outdoor' then 'outdoor' end
], null);

create table public.task_template_chore_days (
  template_id uuid not null,
  chore_day_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (template_id, chore_day_id),
  foreign key (template_id, household_id) references public.task_templates (id, household_id) on delete cascade,
  foreign key (chore_day_id, household_id) references public.chore_days (id, household_id) on delete cascade
);

create index task_template_chore_days_day_idx on public.task_template_chore_days (chore_day_id);

-- A one-off chore: a list task with a chore day ("Put the dresser up for
-- sale" on Odd Jobs) waits for the next one with room.
alter table public.task_instances
  add column chore_day_id uuid,
  add constraint task_instances_chore_day_fk foreign key (chore_day_id, household_id)
    references public.chore_days (id, household_id) on delete set null (chore_day_id);

-------------------------------------------------------------------------------
-- Breaks can be "away": preset chores are skipped, generated ones wait.
-------------------------------------------------------------------------------
alter table public.breaks add column away boolean not null default false;

-------------------------------------------------------------------------------
-- Free day for every household, now and when one is made.
-------------------------------------------------------------------------------
create function public.add_free_chore_day(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.chore_days (household_id, name, icon, is_free, max_tasks, max_big, sort_order)
  values (target_household, 'Free day', '🌿', true, 2, 1, 1000);
$$;

revoke execute on function public.add_free_chore_day(uuid) from public, anon, authenticated;

select public.add_free_chore_day(id) from public.households;

create function public.households_add_free_chore_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_free_chore_day(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_free_chore_day() from public, anon, authenticated;

create trigger households_add_free_chore_day
after insert on public.households
for each row execute function public.households_add_free_chore_day();

-------------------------------------------------------------------------------
-- Chore time becomes chore days. A closed block (one chore) becomes a
-- restrictive chore day with that chore as its preset; an open block's
-- presets become its preset chores.
-------------------------------------------------------------------------------
insert into public.chore_days (id, household_id, name, icon, weekdays, restrictive, sort_order)
select id, household_id, name, icon, weekdays, kind = 'closed', sort_order from public.chore_blocks;

insert into public.task_template_chore_days (template_id, chore_day_id, household_id)
select chore_id, id, household_id from public.chore_blocks where kind = 'closed' and chore_id is not null
union
select chore_id, block_id, household_id from public.chore_block_presets
on conflict do nothing;

update public.task_templates t set kind = 'preset'
where exists (select 1 from public.task_template_chore_days l where l.template_id = t.id);

-- Open chore to-dos are made again by the generator.
delete from public.task_instances where status = 'open' and template_id is not null and list_id is not null;

drop table public.chore_block_presets;
drop table public.chore_blocks;

alter table public.task_templates
  drop column size,
  drop column est_minutes,
  drop column importance,
  drop column location;

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.chore_days enable row level security;
alter table public.task_template_chore_days enable row level security;
revoke all on public.chore_days, public.task_template_chore_days from anon;
create policy "Households manage their own chore days" on public.chore_days for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own chore day tags" on public.task_template_chore_days for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
