-- Phase 2, step 2: recurring events.
--
-- A recurring event stores its pattern in events.recurrence_rule (the
-- standard RRULE format, e.g. "FREQ=WEEKLY;BYDAY=TU"). The first
-- occurrence is the event's own starts_at/ends_at.
--
-- event_exceptions records changes to single occurrences: "skip this
-- Tuesday" or "move this one to 5pm", without touching the rest.

alter table public.events add constraint events_id_household_unique unique (id, household_id);

-- Only simple, known RRULE parts are allowed, so nothing odd gets stored.
alter table public.events add constraint events_recurrence_rule_shape
  check (recurrence_rule is null or recurrence_rule ~ '^(FREQ|INTERVAL|BYDAY|BYMONTHDAY|BYMONTH|COUNT|UNTIL|WKST)=[A-Z0-9,+-]+(;(FREQ|INTERVAL|BYDAY|BYMONTHDAY|BYMONTH|COUNT|UNTIL|WKST)=[A-Z0-9,+-]+)*$');

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  event_id uuid not null,
  -- Which occurrence this is about: its original local date.
  original_date date not null,
  -- Either skip it...
  skipped boolean not null default false,
  -- ...or move it to a new time.
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, original_date),
  foreign key (event_id, household_id) references public.events (id, household_id) on delete cascade,
  constraint event_exceptions_skip_or_move check (
    (skipped and new_starts_at is null and new_ends_at is null)
    or (not skipped and new_starts_at is not null and new_ends_at is not null and new_ends_at >= new_starts_at)
  )
);

create index event_exceptions_event_idx on public.event_exceptions (event_id);

create trigger event_exceptions_set_updated_at
before update on public.event_exceptions
for each row execute function public.set_updated_at();

alter table public.event_exceptions enable row level security;
revoke all on public.event_exceptions from anon;

create policy "Households manage their own event exceptions"
on public.event_exceptions for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));
