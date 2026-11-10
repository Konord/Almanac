-- Shared routines (thread "Share routines across people", 2026-11-10).
--
-- routine_step_members  who does a step. A routine can be on several
--                       people's days (Tidy up after dinner for the whole
--                       family) while each person gets their own steps: the
--                       kids clear the table, a parent loads the dishwasher.
--                       No rows means everyone on the routine does it, like
--                       event_members for events.
-- routine_steps.daily_list
--                       this step also shows on the daily list in the Today
--                       panel. Replaces routine_templates.show_on_daily_list,
--                       which was one switch for the whole routine. When all
--                       of a person's steps are on, the list shows the
--                       routine as one row instead.

-------------------------------------------------------------------------------
-- routine_step_members
-------------------------------------------------------------------------------
create table public.routine_step_members (
  step_id uuid not null,
  member_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (step_id, member_id),
  foreign key (step_id, household_id) references public.routine_steps (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);

create index routine_step_members_member_id_idx on public.routine_step_members (member_id);
create index routine_step_members_household_id_idx on public.routine_step_members (household_id);

alter table public.routine_step_members enable row level security;
revoke all on public.routine_step_members from anon;

create policy "Households manage their own routine step people"
on public.routine_step_members for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Daily list, step by step
-------------------------------------------------------------------------------
alter table public.routine_steps
  add column daily_list boolean not null default false;

comment on column public.routine_steps.daily_list is 'Also shows on the daily list in the Today panel. All of a person''s steps on: the routine shows as one row.';

update public.routine_steps s
set daily_list = true
from public.routine_templates t
where t.id = s.template_id and t.show_on_daily_list;

alter table public.routine_templates drop column show_on_daily_list;
