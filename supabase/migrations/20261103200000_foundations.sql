-- Phase 1, step 2: the foundation tables.
--
-- households    one row per family, with its settings (time zone, units...)
-- themes        colour/decoration sets a household can switch between
-- members       the people in the household (parents and kids)
-- activity_log  an append-only record of things that happened
--
-- Every table carries household_id, and row level security (RLS) makes
-- sure a signed-in household can only ever see its own rows.

create extension if not exists pgcrypto with schema extensions;

-- Keeps updated_at current whenever a row changes.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- households
-------------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  -- The single login this household uses (one login per household).
  auth_user_id uuid unique references auth.users (id) on delete set null,
  settings jsonb not null default jsonb_build_object(
    'timeZone', 'America/Toronto',
    'locale', 'en-CA',
    'units', 'metric',
    'temperatureUnit', 'celsius',
    'currency', 'CAD',
    'weekStartsOn', 0,
    'activeTheme', 'whiteboard'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

-- The household that belongs to whoever is signed in (or null).
-- "security definer" lets it read households without tripping over the
-- very security rules it is used to enforce.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.households where auth_user_id = auth.uid();
$$;

-------------------------------------------------------------------------------
-- themes
-------------------------------------------------------------------------------
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  tokens jsonb not null,
  decorations jsonb not null default '[]'::jsonb,
  -- Optional yearly window when this theme switches on by itself,
  -- written as month-day, e.g. '10-01' to '10-31' for October.
  active_from text check (active_from ~ '^\d{2}-\d{2}$'),
  active_until text check (active_until ~ '^\d{2}-\d{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, slug)
);

create trigger themes_set_updated_at
before update on public.themes
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- members
-------------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  role text not null check (role in ('parent', 'child')),
  colour text not null default 'marker-blue',
  birth_year smallint check (birth_year between 1900 and 2100),
  -- Parents only. Stored scrambled (bcrypt), never as the actual PIN.
  pin_hash text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint only_parents_have_pins check (role = 'parent' or pin_hash is null)
);

create index members_household_id_idx on public.members (household_id);

create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

-- Only parents have PINs, so changing someone to a child clears theirs.
create function public.clear_pin_for_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'child' then
    new.pin_hash = null;
  end if;
  return new;
end;
$$;

create trigger members_clear_pin_for_children
before insert or update on public.members
for each row execute function public.clear_pin_for_children();

-------------------------------------------------------------------------------
-- activity_log (append-only: rows are added, never edited)
-------------------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  at timestamptz not null default now(),
  actor_member_id uuid references public.members (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+$'),
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_household_at_idx on public.activity_log (household_id, at desc);

-------------------------------------------------------------------------------
-- Security: row level security
-------------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.themes enable row level security;
alter table public.members enable row level security;
alter table public.activity_log enable row level security;

-- Signed-out visitors ("anon") get nothing at all.
revoke all on public.households, public.themes, public.members, public.activity_log from anon;

create policy "Households see their own row"
on public.households for select to authenticated
using (id = (select public.current_household_id()));

create policy "Households update their own row"
on public.households for update to authenticated
using (id = (select public.current_household_id()))
with check (id = (select public.current_household_id()));

create policy "Households manage their own themes"
on public.themes for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own members"
on public.members for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households read their own activity"
on public.activity_log for select to authenticated
using (household_id = (select public.current_household_id()));

create policy "Households add to their own activity"
on public.activity_log for insert to authenticated
with check (household_id = (select public.current_household_id()));

-- Households are created through create_household() below, never directly,
-- and the login link can't be changed from the app.
revoke insert, delete on public.households from authenticated;
revoke update on public.households from authenticated;
grant update (name, settings) on public.households to authenticated;

-- The activity log can only be added to.
revoke update, delete on public.activity_log from authenticated;

-- Nobody can read PIN hashes from the app, even their own. PINs are set
-- and checked only through the two functions below.
revoke select, insert, update on public.members from authenticated;
grant select (id, household_id, name, role, colour, birth_year, sort_order, created_at, updated_at)
  on public.members to authenticated;
grant insert (household_id, name, role, colour, birth_year, sort_order)
  on public.members to authenticated;
grant update (name, role, colour, birth_year, sort_order)
  on public.members to authenticated;

-------------------------------------------------------------------------------
-- Functions the app calls
-------------------------------------------------------------------------------

-- First-time setup: creates a household for the signed-in login, along with
-- the built-in whiteboard theme. Fails if this login already has one.
create function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in';
  end if;
  if exists (select 1 from public.households where auth_user_id = auth.uid()) then
    raise exception 'This login already has a household';
  end if;

  insert into public.households (name, auth_user_id)
  values (trim(household_name), auth.uid())
  returning id into new_id;

  -- Keep in step with src/theme/tokens.ts
  insert into public.themes (household_id, slug, name, tokens)
  values (new_id, 'whiteboard', 'Whiteboard', jsonb_build_object(
    'colors', jsonb_build_object(
      'board', '#f7f6f2',
      'panel', '#efede6',
      'frame', '#d6d3c9',
      'ink', '#1f2328',
      'inkMuted', '#5b6169',
      'markerBlack', '#1f2328',
      'markerBlue', '#1d5fc4',
      'markerRed', '#c62f2f',
      'markerGreen', '#24803f'
    ),
    'radius', '0.75rem',
    'touchTarget', '3.5rem'
  ));

  insert into public.activity_log (household_id, action, target_type, target_id)
  values (new_id, 'household_created', 'household', new_id);

  return new_id;
end;
$$;

-- Sets a parent's PIN (4 to 8 digits). Passing null clears it.
create function public.set_member_pin(member_id uuid, pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pin is not null and pin !~ '^\d{4,8}$' then
    raise exception 'A PIN must be 4 to 8 digits';
  end if;

  update public.members
  set pin_hash = case when pin is null then null
                      else extensions.crypt(pin, extensions.gen_salt('bf')) end
  where id = member_id
    and household_id = public.current_household_id()
    and role = 'parent';

  if not found then
    raise exception 'No parent with that id in this household';
  end if;
end;
$$;

-- Checks a parent's PIN without ever revealing the stored hash.
create function public.verify_member_pin(member_id uuid, pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.pin_hash is not null and m.pin_hash = extensions.crypt(pin, m.pin_hash)
     from public.members m
     where m.id = member_id
       and m.household_id = public.current_household_id()),
    false
  );
$$;

-- Whether a member has a PIN set (the app can't see pin_hash itself).
create function public.member_has_pin(member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.pin_hash is not null from public.members m
     where m.id = member_id and m.household_id = public.current_household_id()),
    false
  );
$$;

-- Only signed-in logins may call these.
revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.set_member_pin(uuid, text) from public, anon;
revoke execute on function public.verify_member_pin(uuid, text) from public, anon;
revoke execute on function public.member_has_pin(uuid) from public, anon;
revoke execute on function public.current_household_id() from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.set_member_pin(uuid, text) to authenticated;
grant execute on function public.verify_member_pin(uuid, text) to authenticated;
grant execute on function public.member_has_pin(uuid) to authenticated;
grant execute on function public.current_household_id() to authenticated;
