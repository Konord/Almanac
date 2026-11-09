-------------------------------------------------------------------------------
-- One-off chores on lists (Connor, 2026-11-09).
--
-- A task on a list can be switched to a chore and given the same tags as
-- chores (Essential, Big, Outdoor, Errand): "Repair eaves trough", Big +
-- Outdoor. It stays on its list, and the chore planner puts it on the next
-- day with room (its chore day, if it has one; otherwise any day that isn't
-- restrictive). Once it's done it's gone, like any list task.
-------------------------------------------------------------------------------

alter table public.task_instances
  add column is_chore boolean not null default false,
  add column tags text[] not null default '{}' check (tags <@ array['essential', 'big', 'outdoor', 'errand']);

-- List tasks that already wait for a chore day were one-off chores already.
update public.task_instances
set is_chore = true
where template_id is null and chore_day_id is not null and list_id is not null;
