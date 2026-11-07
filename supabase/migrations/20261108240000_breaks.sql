-- Breaks (2026-11-07): holidays, summer break, a sick day.
--
-- Connor: "I think we will need a vacation/summer vacation option, maybe
-- this is cleaner than the one date option."
--
-- A break has a name, a picture and a date range (one day is a short
-- break). For each person on it, it says which kind of day they have
-- during the break, or which of their week plans to follow. A person on a
-- break with neither keeps their usual days (the break still shows on the
-- calendar for them).
--
-- breaks          the break itself: name, picture, first and last date
-- break_members   who it's for, and their kind of day or week plan
--
-- Which kind of day a person has on a date, first match wins:
--   1. a single date changed (day_overrides, kept for older changes)
--   2. a break they're on
--   3. their week plan
--
-- Single dates that were switched to another kind of day ("One date" on
-- Set days) become one-day breaks, since that screen now uses breaks.

-------------------------------------------------------------------------------
-- breaks
-------------------------------------------------------------------------------
create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 366),
  unique (id, household_id)
);

create index breaks_dates_idx on public.breaks (household_id, end_date, start_date);
create trigger breaks_set_updated_at before update on public.breaks
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- break_members
-------------------------------------------------------------------------------
create table public.break_members (
  household_id uuid not null references public.households (id) on delete cascade,
  break_id uuid not null,
  member_id uuid not null,
  -- Their kind of day for the whole break (empty: see week_plan_id).
  day_type_id uuid,
  -- Or one of their week plans for the break (empty with no kind of day: usual days).
  week_plan_id uuid,
  primary key (break_id, member_id),
  check (day_type_id is null or week_plan_id is null),
  foreign key (break_id, household_id) references public.breaks (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade,
  -- Removing a kind of day or week plan puts the person back on usual days.
  foreign key (day_type_id, household_id) references public.day_types (id, household_id) on delete set null (day_type_id),
  foreign key (week_plan_id, household_id) references public.week_plans (id, household_id) on delete set null (week_plan_id)
);

create index break_members_member_idx on public.break_members (member_id);

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.breaks enable row level security;
alter table public.break_members enable row level security;
revoke all on public.breaks, public.break_members from anon;
grant select, insert, update, delete on public.breaks, public.break_members to authenticated;

create policy "Households manage their own breaks" on public.breaks for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own break members" on public.break_members for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Single dates switched to another kind of day become one-day breaks
-------------------------------------------------------------------------------
-- Only dates from today on, that only changed the kind of day (not the times).
do $$
declare
  o record;
  b uuid;
begin
  for o in
    select d.id, d.household_id, d.member_id, d.date, d.day_type_id, t.name, t.icon
    from public.day_overrides d
    join public.day_types t on t.id = d.day_type_id
    where d.date >= current_date and d.wake_time is null and d.bed_time is null
  loop
    insert into public.breaks (household_id, name, icon, start_date, end_date)
    values (o.household_id, o.name, o.icon, o.date, o.date)
    returning id into b;
    insert into public.break_members (household_id, break_id, member_id, day_type_id)
    values (o.household_id, b, o.member_id, o.day_type_id);
    delete from public.day_overrides where id = o.id;
  end loop;
end;
$$;
