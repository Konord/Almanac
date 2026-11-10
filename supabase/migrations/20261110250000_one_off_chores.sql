-------------------------------------------------------------------------------
-- One-off chores live on a Chores list (Connor, 2026-11-10).
--
-- Every household has one Chores list. It can be renamed but not removed.
-- Anything on it is a one-off chore: it has tags like chores do
-- (Essential, Big, Outdoor, Errand), maybe a chore day, and the chore
-- planner puts it on the next day with room. "Repair eaves trough", Big +
-- Outdoor. Once it's done it's gone, like any list task. Tasks don't move
-- on or off the Chores list: delete and remake instead.
-------------------------------------------------------------------------------

alter table public.task_lists
  add column is_chores boolean not null default false;

create unique index task_lists_one_chores_list on public.task_lists (household_id) where is_chores;

alter table public.task_instances
  add column tags text[] not null default '{}' check (tags <@ array['essential', 'big', 'outdoor', 'errand']);

-- A Chores list for every household, after its other lists.
insert into public.task_lists (household_id, name, icon, sort_order, is_chores)
select h.id, 'Chores', '🧹', 100, true from public.households h;

-- List tasks that already waited for a chore day were one-off chores: move them there.
update public.task_instances t
set list_id = l.id
from public.task_lists l
where l.household_id = t.household_id and l.is_chores
  and t.template_id is null and t.heads_up_id is null and t.chore_day_id is not null and t.list_id is not null;

-- New households get the Chores list with their first two lists.
create or replace function public.add_starter_chores(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (household_id, name, icon, sort_order, is_chores) values
    (target_household, 'To-do', '📝', 1, false),
    (target_household, 'Errands', '🚗', 2, false),
    (target_household, 'Chores', '🧹', 100, true);
$$;

revoke execute on function public.add_starter_chores(uuid) from public, anon, authenticated;

-- The Chores list can't be removed (except with its household).
create function public.task_lists_keep_chores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_chores and exists (select 1 from public.households where id = old.household_id) then
    raise exception 'The Chores list can''t be removed' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger task_lists_keep_chores before delete on public.task_lists
  for each row execute function public.task_lists_keep_chores();
