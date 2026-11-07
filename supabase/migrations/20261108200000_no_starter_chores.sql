-- New households start with no chores.
--
-- Until now every new household was given about 30 starter chores (and a
-- "Plan next week's meals" chore). Connor asked for that to stop: a
-- household adds its own chores. The two to-do lists (To-do, Errands)
-- are still made, because the to-do list needs somewhere to put things.
--
-- Households that already exist keep the chores they have.

create or replace function public.add_starter_chores(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (household_id, name, icon, sort_order) values
    (target_household, 'To-do', '📝', 1),
    (target_household, 'Errands', '🚗', 2);
$$;

revoke execute on function public.add_starter_chores(uuid) from public, anon, authenticated;

drop trigger households_add_plan_meals_chore on public.households;
drop function public.households_add_plan_meals_chore();
drop function public.add_plan_meals_chore(uuid);
