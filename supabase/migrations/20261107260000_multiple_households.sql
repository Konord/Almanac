-- One login, many households.
--
-- Until now each household had exactly one login (households.auth_user_id)
-- and each login had at most one household. Now a login can make several
-- households and switch between them (handy for a test household, and later
-- for things like a cottage). Only one household is "current" at a time, and
-- everything else in the app keeps working through current_household_id(),
-- so no other table needs to change.
--
-- household_logins  which logins can open which households. The one picked
--                   most recently is the login's current household.

-------------------------------------------------------------------------------
-- household_logins
-------------------------------------------------------------------------------
create table public.household_logins (
  household_id uuid not null references public.households (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  -- When this login last switched to (or made) this household. The latest
  -- one is the current household.
  chosen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (household_id, auth_user_id)
);

create index household_logins_login_idx on public.household_logins (auth_user_id, chosen_at desc);

-- Every existing household keeps its login.
insert into public.household_logins (household_id, auth_user_id)
select id, auth_user_id from public.households where auth_user_id is not null;

-- The app only reads and changes these rows through the functions below.
alter table public.household_logins enable row level security;
revoke all on public.household_logins from anon, authenticated;

-------------------------------------------------------------------------------
-- The current household
-------------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id
  from public.household_logins
  where auth_user_id = auth.uid()
  order by chosen_at desc, created_at desc
  limit 1;
$$;

-- The old one-login link is replaced by household_logins.
alter table public.households drop column auth_user_id;

-------------------------------------------------------------------------------
-- Functions the app calls
-------------------------------------------------------------------------------

-- Makes a new household for the signed-in login and switches to it.
-- The starter routines, chores, meals and so on are added by triggers.
create or replace function public.create_household(household_name text)
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
  if (select count(*) from public.household_logins where auth_user_id = auth.uid()) >= 20 then
    raise exception 'A login can have up to 20 households';
  end if;

  insert into public.households (name)
  values (trim(household_name))
  returning id into new_id;

  insert into public.household_logins (household_id, auth_user_id, chosen_at)
  values (new_id, auth.uid(), clock_timestamp());

  insert into public.themes (household_id, slug, name, tokens)
  values (new_id, 'bright', 'Bright', public.bright_theme_tokens());

  perform public.add_starter_layers(new_id);

  insert into public.activity_log (household_id, action, target_type, target_id)
  values (new_id, 'household_created', 'household', new_id);

  return new_id;
end;
$$;

-- Every household this login can open, newest first, marking the current one.
create function public.my_households()
returns table (id uuid, name text, is_current boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, h.id = public.current_household_id(), h.created_at
  from public.households h
  join public.household_logins l on l.household_id = h.id
  where l.auth_user_id = auth.uid()
  order by h.created_at, h.name;
$$;

-- Makes another of this login's households the current one.
create function public.switch_household(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_logins
  set chosen_at = clock_timestamp()
  where household_id = target and auth_user_id = auth.uid();
  if not found then
    raise exception 'No household with that id for this login';
  end if;
end;
$$;

-- Deletes one of this login's households and everything in it. The name has
-- to be typed to confirm, so a stray tap can't do it. If it was the current
-- household, the most recently used other one becomes current.
create function public.delete_household(target uuid, confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  real_name text;
begin
  select h.name into real_name
  from public.households h
  join public.household_logins l on l.household_id = h.id
  where h.id = target and l.auth_user_id = auth.uid();
  if real_name is null then
    raise exception 'No household with that id for this login';
  end if;
  if lower(trim(confirm_name)) <> lower(trim(real_name)) then
    raise exception 'Type the household''s name exactly to delete it';
  end if;

  delete from public.households where id = target;
end;
$$;

revoke execute on function public.my_households() from public, anon;
revoke execute on function public.switch_household(uuid) from public, anon;
revoke execute on function public.delete_household(uuid, text) from public, anon;
grant execute on function public.my_households() to authenticated;
grant execute on function public.switch_household(uuid) to authenticated;
grant execute on function public.delete_household(uuid, text) to authenticated;
