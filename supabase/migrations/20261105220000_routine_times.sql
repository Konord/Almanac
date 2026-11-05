-- Floating routines (Phase 3, step 4).
--
-- A routine can have a usual start time and length. Both are optional:
-- when they're empty the app uses the routine's step times, or a default
-- for its kind (morning, daytime, night). On the calendar the routine
-- then moves around the person's events for that day; nothing is saved
-- when it moves.

alter table public.routine_templates
  add column usual_start time,
  add column usual_minutes smallint check (usual_minutes is null or usual_minutes between 5 and 240);

comment on column public.routine_templates.usual_start is 'When the routine usually starts. Null: from its step times, else a default for its kind.';
comment on column public.routine_templates.usual_minutes is 'About how long it takes. Null: from its step times, else 30 minutes.';
