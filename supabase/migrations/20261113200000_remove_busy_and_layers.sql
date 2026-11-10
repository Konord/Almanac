-- Kinds of day instead of event tags, step 1 (Connor, 2026-11-10):
-- no more busy days, and layers are gone for good.
--
-- * The "Free and busy days" setting (households.settings.dayProfile) goes.
--   The Agenda's day pill shows today's kind of day instead.
-- * Layers have been hidden since tags came in (2026-11-05). Every event
--   still quietly had one; now events stand on their own, and new
--   households no longer get starter layers.

-------------------------------------------------------------------------------
-- Busy days
-------------------------------------------------------------------------------
alter table public.households alter column settings set default jsonb_build_object(
  'timeZone', 'America/Toronto',
  'locale', 'en-CA',
  'units', 'metric',
  'temperatureUnit', 'celsius',
  'currency', 'CAD',
  'weekStartsOn', 0,
  'activeTheme', 'bright',
  'handwriting', true
);

update public.households set settings = settings - 'dayProfile' where settings ? 'dayProfile';

-------------------------------------------------------------------------------
-- Layers
-------------------------------------------------------------------------------
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

  insert into public.activity_log (household_id, action, target_type, target_id)
  values (new_id, 'household_created', 'household', new_id);

  return new_id;
end;
$$;

drop trigger if exists views_check_layers on public.views;
drop trigger if exists layers_remove_from_views on public.layers;
drop function if exists public.check_view_layers();
drop function if exists public.remove_layer_from_views();
drop function if exists public.add_starter_layers(uuid);

alter table public.events drop column layer_id;
alter table public.views drop column layer_ids;
drop table public.layers;
