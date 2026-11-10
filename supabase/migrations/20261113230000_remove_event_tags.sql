-- Kinds of day instead of event tags, step 4 (Connor, 2026-11-10):
-- events don't need tags. Their one real job (an office day is good for
-- errands) is now done by kinds of day, and overlays give way to a person
-- filter that each screen remembers by itself (no table needed).
--
-- * chore_days.errands   a chore day good for errands (Marketing day), a
--                        plain switch instead of the Errand tag.
-- * Events tagged Errand whose title matches a kind of day make their
--   dates that kind of day, so nothing is lost.
-- * The shared tag pool goes: tags, event_tags, chore_day_tags, views
--   (overlays) and event_templates.tag_ids. Chores keep their four fixed
--   flags (essential, big, outdoor, errand) as before; dish tags are
--   separate (meal_tags) and stay.

-------------------------------------------------------------------------------
-- Keep what the tags meant
-------------------------------------------------------------------------------
alter table public.chore_days add column errands boolean not null default false;
comment on column public.chore_days.errands is 'Good for errands: the chore planner puts errands on this day first.';

update public.chore_days cd set errands = true
where exists (
  select 1 from public.chore_day_tags ct join public.tags t on t.id = ct.tag_id
  where ct.chore_day_id = cd.id and t.role = 'errand'
);

update public.events e set day_kind = (
  select d.name from public.day_types d
  where d.household_id = e.household_id and lower(trim(d.name)) = lower(trim(e.title))
  order by d.sort_order limit 1
)
where e.day_kind is null
  and exists (
    select 1 from public.event_tags et join public.tags t on t.id = et.tag_id
    where et.event_id = e.id and t.role = 'errand'
  )
  and exists (
    select 1 from public.day_types d
    where d.household_id = e.household_id and lower(trim(d.name)) = lower(trim(e.title))
  );

-------------------------------------------------------------------------------
-- Remove the tag pool and overlays
-------------------------------------------------------------------------------
drop trigger if exists households_add_role_tags on public.households;
drop function if exists public.households_add_role_tags();
drop function if exists public.add_role_tags(uuid);

drop table public.chore_day_tags;
drop table public.event_tags;
drop table public.views;
alter table public.event_templates drop column tag_ids;

drop trigger if exists tags_keep_roles on public.tags;
drop function if exists public.tags_keep_roles();
drop table public.tags;
