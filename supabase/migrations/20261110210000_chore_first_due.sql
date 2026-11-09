-------------------------------------------------------------------------------
-- Spreading out occasional chores (2026-11-09).
--
-- A new occasional chore used to be due the day it was made, so chores made
-- in the same week came due together every time round. Now the Chore
-- Manager picks a quiet day for its first time, within one repeat (at most
-- eight weeks), and keeps it here. Empty means "work it out" (a steady
-- spread from the day it was made).
-------------------------------------------------------------------------------

alter table public.task_templates add column first_due date;
