-- Tasks rework, step 1 (agreed 2026-11-09): no more energy costs.
--
-- Events used to carry an "energy cost" (none, light, medium, heavy) that
-- nothing ever used. The new design drops the idea: the chore generator
-- uses a count of tasks per day and a few preset tags (Essential, Big,
-- Outdoor, Errand) instead. This removes the column from events.
--
-- Nothing else changes in the database for step 1: to-dos, chore rounds
-- and heads-ups already share one table (task_instances), and a point
-- event (a time with no length) is just an event whose end is its start,
-- which events already allow.

alter table public.events drop column energy_cost;
