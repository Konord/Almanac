-- Phase 3, step 2: the locked "bright" style.
--
-- 1. A "bright" theme for every household, made the active one.
-- 2. One colour per person: members and layers move from the old marker
--    colours to the new person colours (blue, pink, teal, purple, orange,
--    green, slate). The actual shades live in the theme tokens.
-- 3. A handwriting setting (on by default) for to-dos, meals and notes.
-- 4. An optional emoji picture on each event.

-------------------------------------------------------------------------------
-- The bright theme. Keep in step with src/theme/tokens.ts
-------------------------------------------------------------------------------
create function public.bright_theme_tokens()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'colors', jsonb_build_object(
      'board', '#FFFFFF',
      'rail', '#F6F7F9',
      'panel', '#F1F2F5',
      'frame', '#ECEEF1',
      'grid', '#EEF0F3',
      'ink', '#23262B',
      'inkMuted', '#6B7078',
      'inkSoft', '#4E535B',
      'checkBorder', '#B9BEC6',
      'accent', '#2F74C0',
      'danger', '#C23B2B',
      'success', '#1B8790',
      'now', '#E5533D',
      'meal', '#FBEDB5',
      'mealInk', '#5E4806',
      'personBlue', '#2F74C0',
      'personBlueSoft', '#CFE3F8',
      'personPink', '#CC4A78',
      'personPinkSoft', '#F9D3DF',
      'personTeal', '#1B8790',
      'personTealSoft', '#C8EEF0',
      'personPurple', '#9150C2',
      'personPurpleSoft', '#E8D3F5',
      'personOrange', '#C9661C',
      'personOrangeSoft', '#FCDDBE',
      'personGreen', '#3D8B37',
      'personGreenSoft', '#D5EDCC',
      'personSlate', '#5B6472',
      'personSlateSoft', '#E1E4E9'
    ),
    'radius', '1.125rem',
    'radiusCard', '1.375rem',
    'touchTarget', '3.625rem'
  );
$$;

revoke execute on function public.bright_theme_tokens() from public, anon, authenticated;

-- Existing households get it now (the old whiteboard theme row stays, unused)...
insert into public.themes (household_id, slug, name, tokens)
select h.id, 'bright', 'Bright', public.bright_theme_tokens()
from public.households h
where not exists (select 1 from public.themes t where t.household_id = h.id and t.slug = 'bright');

update public.households
set settings = settings || jsonb_build_object('activeTheme', 'bright', 'handwriting', coalesce(settings -> 'handwriting', 'true'::jsonb));

-- ...and new households get it from the start.
alter table public.households alter column settings set default jsonb_build_object(
  'timeZone', 'America/Toronto',
  'locale', 'en-CA',
  'units', 'metric',
  'temperatureUnit', 'celsius',
  'currency', 'CAD',
  'weekStartsOn', 0,
  'activeTheme', 'bright',
  'handwriting', true,
  'dayProfile', jsonb_build_object(
    'dayStarts', '07:00',
    'dayEnds', '21:00',
    'eveningStarts', '17:00',
    'busyDayMinutes', 240,
    'busyEveningMinutes', 90
  )
);

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

  insert into public.themes (household_id, slug, name, tokens)
  values (new_id, 'bright', 'Bright', public.bright_theme_tokens());

  perform public.add_starter_layers(new_id);

  insert into public.activity_log (household_id, action, target_type, target_id)
  values (new_id, 'household_created', 'household', new_id);

  return new_id;
end;
$$;

-------------------------------------------------------------------------------
-- Person colours
-------------------------------------------------------------------------------
create function public.person_colour_from_marker(old text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case old
    when 'marker-blue' then 'blue'
    when 'marker-red' then 'pink'
    when 'marker-green' then 'teal'
    when 'marker-black' then 'slate'
    else old
  end;
$$;

update public.members set colour = public.person_colour_from_marker(colour);
update public.layers set colour = public.person_colour_from_marker(colour);
drop function public.person_colour_from_marker(text);

alter table public.members alter column colour set default 'blue';
alter table public.layers alter column colour set default 'blue';

-- Only colours the theme knows about.
alter table public.members add constraint members_colour_known
  check (colour in ('blue', 'pink', 'teal', 'purple', 'orange', 'green', 'slate'));
alter table public.layers add constraint layers_colour_known
  check (colour in ('blue', 'pink', 'teal', 'purple', 'orange', 'green', 'slate'));

create or replace function public.add_starter_layers(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.layers (household_id, name, colour, sort_order)
  values
    (target_household, 'Court', 'pink', 1),
    (target_household, 'Appointments', 'blue', 2),
    (target_household, 'Kids', 'teal', 3),
    (target_household, 'Family', 'orange', 4);
$$;

revoke execute on function public.add_starter_layers(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Event pictures
-------------------------------------------------------------------------------
-- One emoji, like 🦷 for the dentist. Empty means the app picks one to show.
alter table public.events add column icon text check (char_length(icon) <= 8);
