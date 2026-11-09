-- Tasks rework, step 3 (agreed 2026-11-09): routines as points and chains.
--
-- A routine is a single point (Take medicine 2pm) or a chain of points
-- (Bedtime: bath, teeth, story). It stays in its own displays: the Agenda
-- and its checklist. Two switches per routine, both off by default:
--
--   Track              habit_since (already here): records ticks for
--                      habit history
--   Show on daily list show_on_daily_list (new): rare extra emphasis, like
--                      a new medicine; the routine also shows on the daily
--                      list in the Today panel
--
-- Meals lose their prep and tidy-up time on the calendar (that's done in
-- the app, not the database): tidying up is an ordinary routine anchored
-- after the meal, and the cook gets a "Start dinner" task instead.

alter table public.routine_templates
  add column show_on_daily_list boolean not null default false;

-- Tidying up after dinner becomes an ordinary routine. Each household with
-- a Dinner meal time gets one to give to whoever does it (nobody has it
-- until it's given to someone in the Routine Manager).
with made as (
  insert into public.routine_templates (household_id, name, kind, anchor, anchor_meal_time_id, usual_minutes, premade, sort_order)
  select mt.household_id, 'Tidy up after dinner', 'night', 'meal', mt.id, 15, true, 50
  from public.meal_times mt
  where lower(mt.name) = 'dinner'
    and not exists (
      select 1 from public.routine_templates t where t.household_id = mt.household_id and lower(t.name) like '%tidy%dinner%'
    )
  returning id, household_id
)
insert into public.routine_steps (household_id, template_id, position, icon, text)
select made.household_id, made.id, s.position, s.icon, s.text
from made
cross join (values (0, '🍽️', 'Clear the table'), (1, '🫧', 'Load the dishwasher'), (2, '🧽', 'Wipe the counters')) as s (position, icon, text);
