-- Event templates can be points (2026-11-09).
--
-- A point event is a time with no length ("Homework due 9am"), stored as
-- 0 minutes. Saving one as a template used to fail, because templates had
-- to be at least 5 minutes long.

alter table public.event_templates drop constraint event_templates_minutes_check;
alter table public.event_templates add constraint event_templates_minutes_check check (minutes between 0 and 1440);
