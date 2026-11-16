-- Errands isn't a list of its own (Connor, 2026-11-16): an errand is a chore
-- with the Errand tag. Each household's starter "Errands" list goes away;
-- anything on it moves to the Chores list with the Errand tag, so nothing
-- is lost. A list someone made themselves under another name is left alone.

update public.task_instances t
set list_id = chores.id,
    tags = case when 'errand' = any(t.tags) then t.tags else array_append(t.tags, 'errand') end
from public.task_lists errands
join public.task_lists chores on chores.household_id = errands.household_id and chores.is_chores
where t.list_id = errands.id
  and errands.name = 'Errands'
  and not errands.is_chores
  and not errands.is_groceries;

delete from public.task_lists
where name = 'Errands' and not is_chores and not is_groceries;

-- New households start with Groceries, To-do and Chores.
create or replace function public.add_starter_chores(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (household_id, name, icon, sort_order, is_chores, is_groceries) values
    (target_household, 'Groceries', '🛒', 0, false, true),
    (target_household, 'To-do', '📝', 1, false, false),
    (target_household, 'Chores', '🧹', 100, true, false);
$$;

revoke execute on function public.add_starter_chores(uuid) from public, anon, authenticated;
