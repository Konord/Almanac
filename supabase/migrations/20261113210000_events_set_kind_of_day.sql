-- Kinds of day instead of event tags, step 2 (Connor, 2026-11-10):
-- an event can make its dates a kind of day ("Office day", "Night shift")
-- for each person on it (no one: everyone).
--
-- events.day_kind           the kind of day's name, or null to leave the day
--                           alone. Kinds of day belong to each person, so
--                           this is a name, matched against each person's own.
--                           Someone without a kind of that name keeps their day.
-- event_templates.day_kind  the same, for events made from the template.
--
-- What wins, most first: a day changed by hand or in the weekly review,
-- a break, an event, then the week plan.

alter table public.events add column day_kind text check (day_kind is null or char_length(trim(day_kind)) between 1 and 40);
comment on column public.events.day_kind is 'Makes its dates this kind of day (by name) for the people on it. Null: no change.';

alter table public.event_templates add column day_kind text check (day_kind is null or char_length(trim(day_kind)) between 1 and 40);
comment on column public.event_templates.day_kind is 'Events made from this template make their dates this kind of day.';

create index events_day_kind_idx on public.events (household_id) where day_kind is not null;
