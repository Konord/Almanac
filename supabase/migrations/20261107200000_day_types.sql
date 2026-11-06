-- Scheduling model, step 1: day types and anchored routines.
--
-- Each person has a few day types ("Weekday", "Weekend", "Night shift").
-- A day type holds when they get up, when they go to bed, and which
-- routines they do. A week plan says which day type each weekday uses.
-- Shift workers can have several week plans and swap them, or let them
-- take turns week by week. Any single date can be switched to another day
-- type, or given its own wake-up and bedtime.
--
-- day_types          a person's kind of day, with wake-up and bedtime
-- week_plans         a person's week, e.g. "Usual week", "Night shift week"
-- week_plan_days     which day type each weekday uses in a week plan
-- day_overrides      one date switched to another day type, or other times
-- routine_ends       a routine someone ended early on a date
--
-- Routines also get an anchor: they start after wake-up, end by bedtime,
-- follow a meal, or sit at a set time. They move with their anchor.

-------------------------------------------------------------------------------
-- day_types
-------------------------------------------------------------------------------
create table public.day_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 30),
  icon text check (icon is null or length(icon) <= 16),
  wake_time time not null default '07:00',
  bed_time time not null default '21:30',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);

create index day_types_member_idx on public.day_types (member_id);
create trigger day_types_set_updated_at before update on public.day_types
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- week_plans and their days
-------------------------------------------------------------------------------
create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 30),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);

create index week_plans_member_idx on public.week_plans (member_id);
create trigger week_plans_set_updated_at before update on public.week_plans
for each row execute function public.set_updated_at();

create table public.week_plan_days (
  household_id uuid not null references public.households (id) on delete cascade,
  week_plan_id uuid not null,
  -- 0 = Sunday ... 6 = Saturday
  weekday smallint not null check (weekday between 0 and 6),
  day_type_id uuid not null,
  primary key (week_plan_id, weekday),
  foreign key (week_plan_id, household_id) references public.week_plans (id, household_id) on delete cascade,
  foreign key (day_type_id, household_id) references public.day_types (id, household_id) on delete cascade
);

-- Which week plan a person is on, or whether their plans take turns.
alter table public.members
  add column current_week_plan_id uuid references public.week_plans (id) on delete set null,
  add column week_plans_rotate boolean not null default false,
  -- When plans take turns: the Sunday the first plan's week started.
  add column rotation_start date;

grant select (current_week_plan_id, week_plans_rotate, rotation_start) on public.members to authenticated;
grant update (current_week_plan_id, week_plans_rotate, rotation_start) on public.members to authenticated;

-------------------------------------------------------------------------------
-- day_overrides
-------------------------------------------------------------------------------
create table public.day_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  date date not null,
  -- Use this day type instead of the week plan's (empty: keep the usual one).
  day_type_id uuid,
  -- Different times just for this date (empty: the day type's).
  wake_time time,
  bed_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, date),
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade,
  foreign key (day_type_id, household_id) references public.day_types (id, household_id) on delete cascade
);

create index day_overrides_date_idx on public.day_overrides (household_id, date);
create trigger day_overrides_set_updated_at before update on public.day_overrides
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Routines belong to day types (instead of picked weekdays)
-------------------------------------------------------------------------------
alter table public.routine_assignments
  add column day_type_id uuid,
  add foreign key (day_type_id, household_id) references public.day_types (id, household_id) on delete cascade,
  drop constraint routine_assignments_weekdays_or_date;

-- Anchors: where a routine sits, and how far it may move.
alter table public.routine_templates
  add column anchor text check (anchor in ('wake', 'bed', 'meal', 'clock')),
  add column anchor_meal_time_id uuid references public.meal_times (id) on delete set null,
  -- After wake-up or a meal: minutes after it. Bedtime: minutes before bed that it ends.
  add column anchor_offset smallint not null default 0 check (anchor_offset between 0 and 240),
  -- Loose routines can move anywhere later in the day; others up to the household's limit.
  add column loose boolean not null default false;

update public.routine_templates set anchor = case kind when 'morning' then 'wake' when 'night' then 'bed' else 'clock' end;
alter table public.routine_templates alter column anchor set not null;

-- New routines (like the ready-made ones) follow wake-up, bedtime or the
-- clock depending on their part of the day, unless they say otherwise.
create function public.routine_templates_default_anchor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anchor := coalesce(new.anchor, case new.kind when 'morning' then 'wake' when 'night' then 'bed' else 'clock' end);
  return new;
end;
$$;

create trigger routine_templates_default_anchor
before insert on public.routine_templates
for each row execute function public.routine_templates_default_anchor();

comment on column public.routine_templates.anchor is 'wake: starts after wake-up. bed: ends by bedtime. meal: after a meal time. clock: at its usual time.';

-------------------------------------------------------------------------------
-- routine_ends
-------------------------------------------------------------------------------
create table public.routine_ends (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  template_id uuid not null,
  end_date date not null,
  ended_at timestamptz not null default now(),
  unique (member_id, template_id, end_date),
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade,
  foreign key (template_id, household_id) references public.routine_templates (id, household_id) on delete cascade
);

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.day_types enable row level security;
alter table public.week_plans enable row level security;
alter table public.week_plan_days enable row level security;
alter table public.day_overrides enable row level security;
alter table public.routine_ends enable row level security;
revoke all on public.day_types, public.week_plans, public.week_plan_days, public.day_overrides, public.routine_ends from anon;

create policy "Households manage their own day types" on public.day_types for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own week plans" on public.week_plans for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own week plan days" on public.week_plan_days for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own day overrides" on public.day_overrides for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own routine ends" on public.routine_ends for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Setting people up
-------------------------------------------------------------------------------
-- Gives a person day types and a usual week. Weekdays that had the same
-- routines become one day type, so nobody loses a routine.
create function public.add_day_types_for(target_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  plan uuid;
  dt uuid;
  plan_weekend uuid;
  grp record;
  short_names text[] := array['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  label text;
  n integer := 0;
begin
  select id, household_id, role into m from public.members where id = target_member;
  if m.id is null or exists (select 1 from public.day_types where member_id = m.id) then
    return;
  end if;

  insert into public.week_plans (household_id, member_id, name) values (m.household_id, m.id, 'Usual week')
  returning id into plan;

  for grp in
    with days as (
      select d::smallint as weekday,
        coalesce((
          select array_agg(a.template_id order by a.template_id)
          from public.routine_assignments a
          where a.member_id = m.id and a.weekdays is not null and d = any (a.weekdays) and a.active
        ), '{}') as templates
      from generate_series(0, 6) d
    )
    select templates, array_agg(weekday order by weekday) as weekdays from days group by templates
    order by min(case when weekday = 0 then 7 else weekday end)
  loop
    label := case
      when grp.weekdays = array[1, 2, 3, 4, 5]::smallint[] then 'Weekday'
      when grp.weekdays = array[0, 6]::smallint[] then 'Weekend'
      when cardinality(grp.weekdays) = 7 then 'Every day'
      else (select string_agg(short_names[w + 1], ', ' order by case when w = 0 then 7 else w end) from unnest(grp.weekdays) w)
    end;
    n := n + 1;
    insert into public.day_types (household_id, member_id, name, sort_order, wake_time, bed_time)
    values (
      m.household_id, m.id, label, n,
      case when m.role = 'child' then '07:00'::time else '06:30'::time end,
      case when m.role = 'child' then '20:00'::time else '22:30'::time end
    )
    returning id into dt;
    insert into public.week_plan_days (household_id, week_plan_id, weekday, day_type_id)
    select m.household_id, plan, w, dt from unnest(grp.weekdays) w;
    insert into public.routine_assignments (household_id, template_id, member_id, day_type_id)
    select m.household_id, t, m.id, dt from unnest(grp.templates) t;
  end loop;

  -- When every day is the same, split the week into weekdays and weekends
  -- anyway (same routines), so weekends can have their own times.
  if n = 1 then
    update public.day_types set name = 'Weekday' where id = dt;
    insert into public.day_types (household_id, member_id, name, sort_order, wake_time, bed_time)
    select m.household_id, m.id, 'Weekend', 2, '07:30'::time,
      case when m.role = 'child' then '20:30'::time else '23:00'::time end
    returning id into plan_weekend;
    update public.week_plan_days set day_type_id = plan_weekend where week_plan_id = plan and weekday in (0, 6);
    insert into public.routine_assignments (household_id, template_id, member_id, day_type_id)
    select household_id, template_id, member_id, plan_weekend from public.routine_assignments where day_type_id = dt;
  end if;

  delete from public.routine_assignments where member_id = m.id and weekdays is not null;
  update public.members set current_week_plan_id = plan where id = m.id;
end;
$$;

revoke execute on function public.add_day_types_for(uuid) from public, anon, authenticated;

select public.add_day_types_for(id) from public.members;

create function public.members_add_day_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_day_types_for(new.id);
  return new;
end;
$$;

revoke execute on function public.members_add_day_types() from public, anon, authenticated;

create trigger members_add_day_types
after insert on public.members
for each row execute function public.members_add_day_types();

-- From now on a routine is given to a day type, or swapped in on one date.
alter table public.routine_assignments
  add constraint routine_assignments_day_type_or_date check (
    (day_type_id is not null and on_date is null and weekdays is null)
    or (day_type_id is null and on_date is not null and weekdays is null)
  );
