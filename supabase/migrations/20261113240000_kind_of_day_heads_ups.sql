-- Kinds of day instead of event tags, step 5 (Connor, 2026-11-10):
-- heads-ups on a kind of day. "Pack a lunch" the night before every Office
-- day, whatever made it an Office day (the week plan, a break, an event or
-- a change by hand).
--
-- heads_ups.day_kind  the kind of day's name (kinds of day belong to each
--                     person, so it's matched by name). The lead counts
--                     back from the wake-up time on that day.

alter table public.heads_ups add column day_kind text check (day_kind is null or char_length(trim(day_kind)) between 1 and 40);
comment on column public.heads_ups.day_kind is 'A heads-up before each day someone has this kind of day (by name), counted back from wake-up.';

alter table public.heads_ups drop constraint heads_ups_one_source;
alter table public.heads_ups add constraint heads_ups_one_source check (num_nonnulls(event_id, chore_id, day_kind) = 1);

create index heads_ups_day_kind_idx on public.heads_ups (household_id) where day_kind is not null;
