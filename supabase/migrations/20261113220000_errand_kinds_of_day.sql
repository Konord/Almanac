-- Kinds of day instead of event tags, step 3 (Connor, 2026-11-10):
-- a kind of day can be good for errands ("Office day": you're in town
-- anyway). The chore planner puts errands on those days first, instead of
-- on days with an event tagged Errand.
--
-- Kinds of day with the same name are one card on Set days, so the switch
-- is set on all of them together.

alter table public.day_types add column errands boolean not null default false;
comment on column public.day_types.errands is 'Good for errands: the chore planner puts errands on these days first.';

-- Kinds of day named like an event that was tagged Errand start switched on.
update public.day_types d set errands = true
where exists (
  select 1
  from public.events e
  join public.event_tags et on et.event_id = e.id
  join public.tags t on t.id = et.tag_id and t.role = 'errand'
  where e.household_id = d.household_id and lower(trim(e.title)) = lower(trim(d.name))
);
