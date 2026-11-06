-- Scheduling model, step 3: heads-ups.
--
-- A heads-up is a reminder that comes before something: "Pack the hockey
-- bag" the night before a game, "Buy batteries" a week before the smoke
-- alarm check. Events and chores can have heads-ups (recipes already have
-- their own, in step_helpers). When the time comes, a heads-up makes a
-- to-do, or puts something on the grocery list.
--
-- heads_ups        what to do, how long before, and what it makes
--
-- The to-dos and grocery lines it makes remember which heads-up and which
-- date they were for, so each one is only made once.

create table public.heads_ups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- What it comes before: an event or a chore.
  event_id uuid,
  chore_id uuid,
  label text not null check (length(trim(label)) between 1 and 80),
  -- How long before the start. Up to 60 days.
  minutes_before integer not null check (minutes_before between 0 and 86400),
  -- What it makes: a to-do, or a line on the grocery list.
  makes text not null default 'todo' check (makes in ('todo', 'grocery')),
  -- Who the to-do is for (empty: the event's person, if it has one).
  assignee_id uuid,
  sort_order integer not null default 0,
  -- The last date it put something on the grocery list for, so a line
  -- someone took off isn't put back.
  last_grocery_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  constraint heads_ups_one_source check ((event_id is null) <> (chore_id is null)),
  foreign key (event_id, household_id) references public.events (id, household_id) on delete cascade,
  foreign key (chore_id, household_id) references public.task_templates (id, household_id) on delete cascade,
  foreign key (assignee_id, household_id) references public.members (id, household_id) on delete set null (assignee_id)
);

create index heads_ups_event_idx on public.heads_ups (event_id);
create index heads_ups_chore_idx on public.heads_ups (chore_id);
create trigger heads_ups_set_updated_at before update on public.heads_ups
for each row execute function public.set_updated_at();

-- What each heads-up has made. heads_up_for is the date of the thing it
-- comes before (the event's day, or the day the chore is due).
alter table public.task_instances
  add column heads_up_id uuid,
  add column heads_up_for date,
  add constraint task_instances_heads_up_fk foreign key (heads_up_id, household_id)
    references public.heads_ups (id, household_id) on delete cascade,
  add constraint task_instances_heads_up_once unique (heads_up_id, heads_up_for);

alter table public.shopping_list
  add column heads_up_id uuid,
  add column heads_up_for date,
  add constraint shopping_list_heads_up_fk foreign key (heads_up_id, household_id)
    references public.heads_ups (id, household_id) on delete cascade,
  add constraint shopping_list_heads_up_once unique (heads_up_id, heads_up_for);

alter table public.shopping_list drop constraint shopping_list_source_check;
alter table public.shopping_list add constraint shopping_list_source_check
  check (source in ('manual', 'meal', 'weekly', 'backup', 'heads_up'));

-- Security
alter table public.heads_ups enable row level security;
revoke all on public.heads_ups from anon;
create policy "Households manage their own heads-ups" on public.heads_ups for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
