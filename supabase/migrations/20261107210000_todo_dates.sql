-- Scheduling model, step 2: to-dos with a due date or a start, and links.
--
-- A to-do's date means one of two things:
--   due    "done by the 15th": it shows in the days leading up to it
--          (all along, or only the last few days if lead_days is set)
--   start  "on the 15th" (optionally at a time): it shows only from then
-- Either way, a to-do still open after its date carries over to the next
-- day until it's done. A to-do never has a length on the calendar; one
-- with a start time is a point in the day.
--
-- A to-do (or a chore, which makes to-dos) can link to part of the app:
-- "Plan meals" opens the meal planner.

alter table public.task_instances
  add column date_kind text not null default 'due' check (date_kind in ('due', 'start')),
  add column at_time time,
  add column lead_days smallint check (lead_days between 0 and 60),
  add column link text check (link is null or link ~ '^/[a-z0-9/?=&-]{0,80}$');

alter table public.task_templates
  add column link text check (link is null or link ~ '^/[a-z0-9/?=&-]{0,80}$');

comment on column public.task_instances.date_kind is 'due: done by due_date, shown in the lead-up. start: shown from due_date (and at_time).';
comment on column public.task_instances.lead_days is 'For due to-dos: show this many days before. Empty: show all along.';
