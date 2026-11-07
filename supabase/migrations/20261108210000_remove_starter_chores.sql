-- Remove the starter chores households already have.
--
-- Connor chose (2026-11-07) to clear out every chore the app added on its
-- own (the "premade" ones, including "Plan next week's meals"), in every
-- household. Chores a family added themselves stay. Deleting a chore also
-- removes, through the existing "on delete cascade" links, its done
-- history, its open to-dos, its heads-ups, and any chore time or preset
-- that was built on it.

delete from public.task_templates where premade;
