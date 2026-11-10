-- One shared pool of tags, tag overlays instead of layers, and errand days
-- (core features review, Connor 2026-11-10).
--
-- tags.role         the four tags the chore planner understands (Essential,
--                   Big, Outdoor, Errand) are now ordinary tags in the
--                   household's one tag pool, so an event can carry them
--                   too: an "Office day" event tagged Errand makes that day
--                   good for errands. Chores still store the role names
--                   (task_templates.tags, task_instances.tags); these rows
--                   give them their picture and put them in the pool. They
--                   can't be removed.
-- chore_day_tags    tags on a chore day. A chore day tagged Errand
--                   (Marketing day) is where errands go first.
-- views.tag_ids     a view is now an overlay: a set of tags. A screen
--                   showing an overlay shows only events with one of its
--                   tags. Layers stay in the database for now (every event
--                   still has one, set quietly) but nothing shows them.

-------------------------------------------------------------------------------
-- The planner's tags, in every household's pool
-------------------------------------------------------------------------------
alter table public.tags add column role text check (role in ('essential', 'big', 'outdoor', 'errand'));
comment on column public.tags.role is 'One of the tags the chore planner understands. Null for an ordinary tag.';
create unique index tags_household_role_idx on public.tags (household_id, role) where role is not null;

create function public.add_role_tags(target_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select * from (values
      ('essential', 'Essential', '⭐', 1),
      ('big', 'Big', '💪', 2),
      ('outdoor', 'Outdoor', '🌳', 3),
      ('errand', 'Errand', '🚗', 4)
    ) as v (role, name, icon, sort_order)
  loop
    -- A tag of the same name already there (made for an event) becomes it.
    update public.tags set role = r.role
    where household_id = target_household and role is null and lower(trim(name)) = lower(r.name)
      and not exists (select 1 from public.tags t where t.household_id = target_household and t.role = r.role);
    insert into public.tags (household_id, name, icon, sort_order, role)
    select target_household, r.name, r.icon, r.sort_order, r.role
    where not exists (select 1 from public.tags t where t.household_id = target_household and t.role = r.role);
  end loop;
end;
$$;

revoke execute on function public.add_role_tags(uuid) from public, anon, authenticated;

select public.add_role_tags(id) from public.households;

create function public.households_add_role_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_role_tags(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_role_tags() from public, anon, authenticated;

create trigger households_add_role_tags
after insert on public.households
for each row execute function public.households_add_role_tags();

-- The planner's tags can't be removed (renaming and a new picture are fine).
create function public.tags_keep_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Removing the whole household still removes them.
  if old.role is not null and exists (select 1 from public.households h where h.id = old.household_id) then
    raise exception 'The % tag is used by the chore planner and can''t be removed.', old.name using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger tags_keep_roles
before delete on public.tags
for each row execute function public.tags_keep_roles();

-------------------------------------------------------------------------------
-- chore_day_tags
-------------------------------------------------------------------------------
create table public.chore_day_tags (
  chore_day_id uuid not null,
  tag_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (chore_day_id, tag_id),
  foreign key (chore_day_id, household_id) references public.chore_days (id, household_id) on delete cascade,
  foreign key (tag_id, household_id) references public.tags (id, household_id) on delete cascade
);

create index chore_day_tags_tag_idx on public.chore_day_tags (tag_id);
create index chore_day_tags_household_idx on public.chore_day_tags (household_id);

alter table public.chore_day_tags enable row level security;
revoke all on public.chore_day_tags from anon;
create policy "Households manage their own chore day tags" on public.chore_day_tags for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Overlays: views pick tags instead of layers
-------------------------------------------------------------------------------
alter table public.views add column tag_ids uuid[] not null default '{}';
comment on column public.views.tag_ids is 'The tags this overlay shows: only events with one of them.';

-- Each layer already has a tag of the same name (2026-11-05), so an old
-- view picks those tags.
update public.views v set tag_ids = coalesce((
  select array_agg(t.id)
  from public.layers l
  join public.tags t on t.household_id = l.household_id and lower(trim(t.name)) = lower(trim(l.name))
  where l.id = any (v.layer_ids)
), '{}');
