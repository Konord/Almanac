-- Phase 2, step 1: calendar layers and one-off events.
--
-- layers  groups of calendar items (Court, Appointments, Kids...), each
--         with a colour, an optional owner and a visibility.
-- events  things that happen at a fixed time and make a day busier.
--
-- Recurrence (RRULE) and exceptions arrive in step 2; the column is
-- created now because it belongs on this table.

-- Lets other tables insist that a member they point at is in the same
-- household as they are.
alter table public.members add constraint members_id_household_unique unique (id, household_id);

-------------------------------------------------------------------------------
-- layers
-------------------------------------------------------------------------------
create table public.layers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  colour text not null default 'marker-blue',
  type text not null default 'events' check (type in ('events', 'meals', 'chores')),
  owner_member_id uuid,
  -- Whether events on this layer make a day count as busy.
  counts_toward_busyness boolean not null default true,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  created_by uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (owner_member_id, household_id) references public.members (id, household_id) on delete set null (owner_member_id),
  foreign key (created_by, household_id) references public.members (id, household_id) on delete set null (created_by)
);

create index layers_household_id_idx on public.layers (household_id);

create trigger layers_set_updated_at
before update on public.layers
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- events
-------------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  layer_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  -- The time zone the event was entered in, so "9am" stays 9am.
  timezone text not null,
  recurrence_rule text,
  -- Who the event is for (optional).
  member_id uuid,
  -- How draining it is: 0 none, 1 light, 2 medium, 3 heavy.
  energy_cost smallint not null default 1 check (energy_cost between 0 and 3),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  notes text check (length(notes) <= 2000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (ends_at >= starts_at),
  foreign key (layer_id, household_id) references public.layers (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete set null (member_id),
  foreign key (created_by, household_id) references public.members (id, household_id) on delete set null (created_by)
);

create index events_household_starts_idx on public.events (household_id, starts_at);
create index events_layer_id_idx on public.events (layer_id);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.layers enable row level security;
alter table public.events enable row level security;

revoke all on public.layers, public.events from anon;

create policy "Households manage their own layers"
on public.layers for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own events"
on public.events for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Starter layers
-------------------------------------------------------------------------------
create function public.add_starter_layers(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.layers (household_id, name, colour, sort_order)
  values
    (target_household, 'Court', 'marker-red', 1),
    (target_household, 'Appointments', 'marker-blue', 2),
    (target_household, 'Kids', 'marker-green', 3),
    (target_household, 'Family', 'marker-black', 4);
$$;

revoke execute on function public.add_starter_layers(uuid) from public, anon, authenticated;

-- Households that already exist get the starter layers now...
select public.add_starter_layers(id) from public.households;

-- ...and new households get them when they're created.
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

  perform public.add_starter_layers(new_id);

  insert into public.activity_log (household_id, action, target_type, target_id)
  values (new_id, 'household_created', 'household', new_id);

  return new_id;
end;
$$;
