-- Habit tracking on routines (2026-11-07).
--
-- Connor wants routines to work as a habit tracker when you choose to, but
-- not by default. Every tick is already saved in routine_checks, so all
-- tracking needs is a switch:
--
-- routine_templates.habit_since  the day tracking was switched on. Empty
--                                means the routine isn't tracked (the
--                                default). Days before it never count as
--                                missed.
-- routine_steps.habit            whether this step gets its own row on the
--                                habit chart. On by default, so switching a
--                                routine on tracks all its steps; untick the
--                                ones not worth tracking (like Get dressed).

alter table public.routine_templates
  add column habit_since date;

alter table public.routine_steps
  add column habit boolean not null default true;

comment on column public.routine_templates.habit_since is 'When habit tracking was switched on for this routine. Null: not tracked.';
comment on column public.routine_steps.habit is 'Whether this step is tracked as a habit when its routine is tracked.';

-- The habit chart reads a few weeks of ticks for one person at a time.
create index routine_checks_member_date_idx on public.routine_checks (member_id, check_date);
