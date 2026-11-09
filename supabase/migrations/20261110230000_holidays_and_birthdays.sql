-- Holidays and birthdays (2026-11-09).
--
-- Connor: holidays "should be their own thing", pulled from a public list,
-- editable (name, picture), add new ones and take some away. They don't
-- change anyone's kind of day or chores; they're special all-day days that
-- look different on the calendar. Birthdays: a name, the date and the
-- birth year, with a picture.
--
-- holidays    a yearly rule (see src/lib/holidays.ts), name and picture.
--             public_key says which public holiday it came from, if any.
-- birthdays   name, picture, month and day, and the year they were born.

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  -- {"kind": "fixed", "month": 12, "day": 25}, {"kind": "nth", ...},
  -- {"kind": "before", ...} or {"kind": "easter", "offset": -2}
  rule jsonb not null check (rule ? 'kind'),
  public_key text check (public_key is null or length(public_key) <= 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, public_key)
);

create index holidays_household_idx on public.holidays (household_id);
create trigger holidays_set_updated_at before update on public.holidays
for each row execute function public.set_updated_at();

create table public.birthdays (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  birth_year smallint check (birth_year is null or birth_year between 1900 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index birthdays_household_idx on public.birthdays (household_id);
create trigger birthdays_set_updated_at before update on public.birthdays
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.holidays enable row level security;
alter table public.birthdays enable row level security;
revoke all on public.holidays, public.birthdays from anon;
grant select, insert, update, delete on public.holidays, public.birthdays to authenticated;

create policy "Households manage their own holidays" on public.holidays for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
create policy "Households manage their own birthdays" on public.birthdays for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
