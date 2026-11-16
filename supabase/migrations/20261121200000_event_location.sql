-- Glance: events get a place (Connor, 15 Nov 2026).
--
-- A plain line of text, like "Bloor St W" or "Grandma's". There is no map
-- and no address lookup: it is only shown on the event card and in the
-- event sheet. Templates keep one too, so a template for "Swim lessons"
-- can fill in the pool.
--
-- Both columns are optional (null means no place). The existing row
-- security rules on both tables already cover the new columns.

alter table public.events
  add column location text
  check (location is null or char_length(location) <= 200);

alter table public.event_templates
  add column location text
  check (location is null or char_length(location) <= 200);
