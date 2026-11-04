-- Phase 2, step 3: saved views and day-profile settings.
--
-- A view is a saved set of layers, like "Court + appointments" or "Kids".
-- Each screen (a browser on the wall, a phone) remembers which view it
-- shows; that choice is kept on the device itself, not here.

create table public.views (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  -- The layers this view shows.
  layer_ids uuid[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name)
);

create index views_household_id_idx on public.views (household_id);

create trigger views_set_updated_at
before update on public.views
for each row execute function public.set_updated_at();

-- A list of ids can't use a normal foreign key, so this checks that every
-- layer in a view belongs to the same household.
create or replace function public.check_view_layers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.layer_ids) as l(id)
    where not exists (
      select 1 from public.layers
      where layers.id = l.id and layers.household_id = new.household_id
    )
  ) then
    raise exception 'A view can only show layers from its own household'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger views_check_layers
before insert or update of layer_ids, household_id on public.views
for each row execute function public.check_view_layers();

-- When a layer is removed, take it out of any views too.
create or replace function public.remove_layer_from_views()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.views
  set layer_ids = array_remove(layer_ids, old.id)
  where household_id = old.household_id and old.id = any (layer_ids);
  return old;
end;
$$;

create trigger layers_remove_from_views
after delete on public.layers
for each row execute function public.remove_layer_from_views();

alter table public.views enable row level security;
revoke all on public.views from anon;

create policy "Households manage their own views"
on public.views for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

-- New households start with sensible free/busy thresholds. Existing
-- households pick up the same values from the app until they're saved.
alter table public.households alter column settings set default jsonb_build_object(
  'timeZone', 'America/Toronto',
  'locale', 'en-CA',
  'units', 'metric',
  'temperatureUnit', 'celsius',
  'currency', 'CAD',
  'weekStartsOn', 0,
  'activeTheme', 'whiteboard',
  'dayProfile', jsonb_build_object(
    'dayStarts', '07:00',
    'dayEnds', '21:00',
    'eveningStarts', '17:00',
    'busyDayMinutes', 240,
    'busyEveningMinutes', 90
  )
);
