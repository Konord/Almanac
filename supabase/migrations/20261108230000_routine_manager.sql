-- Routine Manager (2026-11-07).
--
-- Connor: "The tasks in each routine do not need times attached, the block
-- will manage the time and the tasks just need to be ordered."
--
-- Routines that took their time from their steps ("at its step times")
-- now keep that time on the routine itself, so nothing moves:
--   usual_start    = the earliest step time (for set-time routines)
--   usual_minutes  = from the first to the last step time, plus 10 minutes
-- Then the step times are cleared. The column stays for now, unused.

with spans as (
  select template_id, min(target_time) as first_time, max(target_time) as last_time
  from public.routine_steps
  where target_time is not null
  group by template_id
)
update public.routine_templates t
set
  usual_start = case when t.anchor = 'clock' and t.usual_start is null then s.first_time else t.usual_start end,
  usual_minutes = coalesce(
    t.usual_minutes,
    greatest(15, (extract(epoch from (s.last_time - s.first_time)) / 60)::integer + 10)
  )
from spans s
where s.template_id = t.id;

update public.routine_steps set target_time = null where target_time is not null;

comment on column public.routine_steps.target_time is 'No longer used (2026-11-07): a routine''s time is set on the routine, and steps are just in order.';
