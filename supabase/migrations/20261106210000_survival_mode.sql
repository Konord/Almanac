-- Survival button and chore importance (2026-11-06).
--
-- Connor reshaped survival mode: instead of a day mode that hides things,
-- a Survival button on Today offers to swap meals for backup meals and to
-- skip today's chores. Routines and to-dos are left alone, and there is no
-- Low mode for now. The day is still noted as a survival day in `days`.
--
-- Chores swap "min energy mode" for an importance rating that sits beside
-- their size: low ("can wait"), normal, or high ("important"). Important
-- chores start unticked on the Survival card, so they aren't skipped by
-- accident.

-- Nothing is left in the Low mode the app no longer shows.
update public.days set energy_mode = 'normal' where energy_mode = 'low';

alter table public.task_templates
  add column importance text not null default 'normal' check (importance in ('low', 'normal', 'high'));

-- Chores that used to show "even on survival days" are the important ones.
update public.task_templates set importance = 'high' where min_energy_mode = 'survival';

-- Starter chores that weren't changed get the same ratings new households get.
update public.task_templates set importance = 'high'
  where premade and name in ('Garbage and recycling out', 'Shut off and drain the outside taps', 'Test smoke and CO alarms (fall time change)', 'Test smoke and CO alarms (spring time change)', 'Winter tires on');
update public.task_templates set importance = 'low'
  where premade and importance = 'normal' and name in ('Descale the kettle', 'Dust the main rooms', 'Flip or rotate the mattresses', 'Vacuum the couch', 'Wash the windows', 'Wipe the baseboards');

-- The starter chores for new households, now with importance.
create or replace function public.add_starter_chores(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (household_id, name, icon, sort_order) values
    (target_household, 'To-do', '📝', 1),
    (target_household, 'Errands', '🚗', 2);

  insert into public.task_templates
    (household_id, premade, sort_order, name, icon, size, est_minutes, repeat_every, repeat_unit, preferred_weekday, season_start, season_end, location, importance)
  values
    -- Weekly rhythm
    (target_household, true, 10, 'Vacuum and mop the floors', '🧹', 'big', 60, 1, 'week', 6, null, null, 'indoor', 'normal'),
    (target_household, true, 11, 'Clean the bathrooms', '🚽', 'medium', 40, 1, 'week', 6, null, null, 'indoor', 'normal'),
    (target_household, true, 12, 'Change the bed sheets', '🛏️', 'medium', 30, 1, 'week', 0, null, null, 'indoor', 'normal'),
    (target_household, true, 13, 'Wash the towels', '🧺', 'small', 15, 1, 'week', null, null, null, 'indoor', 'normal'),
    (target_household, true, 14, 'Garbage and recycling out', '🗑️', 'small', 10, 1, 'week', null, null, null, 'outdoor', 'high'),
    (target_household, true, 15, 'Water the plants', '🪴', 'small', 10, 1, 'week', null, null, null, 'indoor', 'normal'),
    (target_household, true, 16, 'Dust the main rooms', '🧽', 'medium', 30, 2, 'week', null, null, null, 'indoor', 'low'),
    (target_household, true, 17, 'Tidy the entry and boots', '🧥', 'small', 15, 1, 'week', null, null, null, 'indoor', 'normal'),
    -- Monthly and every few months
    (target_household, true, 20, 'Clean out the fridge', '🧊', 'medium', 30, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 21, 'Clean the dishwasher filter', '🍽️', 'small', 10, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 22, 'Descale the kettle', '🫖', 'small', 10, 1, 'month', null, null, null, 'indoor', 'low'),
    (target_household, true, 23, 'Vacuum the couch', '🛋️', 'small', 15, 1, 'month', null, null, null, 'indoor', 'low'),
    (target_household, true, 24, 'Wash the shower curtain and bath mats', '🚿', 'small', 15, 1, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 25, 'Clean the oven', '🍳', 'big', 60, 3, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 26, 'Wipe the baseboards', '🧽', 'medium', 45, 3, 'month', null, null, null, 'indoor', 'low'),
    (target_household, true, 27, 'Change the furnace filter', '🔥', 'small', 10, 3, 'month', null, null, null, 'indoor', 'normal'),
    (target_household, true, 28, 'Wash the windows', '🪟', 'big', 90, 6, 'month', null, null, null, 'outdoor', 'low'),
    (target_household, true, 29, 'Flip or rotate the mattresses', '🛏️', 'small', 15, 6, 'month', null, null, null, 'indoor', 'low'),
    -- Canadian seasonal list (once a year, inside its window)
    (target_household, true, 40, 'Winter tires on', '🛞', 'medium', 60, 1, 'year', null, '10-15', '11-30', 'outdoor', 'high'),
    (target_household, true, 41, 'Winter tires off', '🛞', 'medium', 60, 1, 'year', null, '04-15', '05-31', 'outdoor', 'normal'),
    (target_household, true, 42, 'Furnace check-up', '🔥', 'small', 15, 1, 'year', null, '09-01', '10-31', 'indoor', 'normal'),
    (target_household, true, 43, 'Clean the gutters', '🪜', 'big', 90, 1, 'year', null, '10-15', '11-30', 'outdoor', 'normal'),
    (target_household, true, 44, 'Shut off and drain the outside taps', '💧', 'small', 20, 1, 'year', null, '10-01', '11-15', 'outdoor', 'high'),
    (target_household, true, 45, 'Turn the outside taps back on', '💧', 'small', 10, 1, 'year', null, '04-15', '05-15', 'outdoor', 'normal'),
    (target_household, true, 46, 'Test smoke and CO alarms (fall time change)', '🔋', 'small', 15, 1, 'year', null, '10-25', '11-10', 'indoor', 'high'),
    (target_household, true, 47, 'Test smoke and CO alarms (spring time change)', '🔋', 'small', 15, 1, 'year', null, '03-01', '03-20', 'indoor', 'high'),
    (target_household, true, 48, 'Rake the leaves', '🍂', 'big', 90, 1, 'year', null, '10-15', '11-20', 'outdoor', 'normal'),
    (target_household, true, 49, 'Put away the patio furniture', '⛱️', 'medium', 45, 1, 'year', null, '10-01', '10-31', 'outdoor', 'normal'),
    (target_household, true, 50, 'Bring out the patio furniture', '⛱️', 'medium', 45, 1, 'year', null, '05-01', '05-31', 'outdoor', 'normal'),
    (target_household, true, 51, 'Shovel, salt and car winter kit ready', '🧂', 'small', 30, 1, 'year', null, '11-01', '11-30', 'outdoor', 'normal'),
    (target_household, true, 52, 'Clean the dryer vent', '🧦', 'medium', 30, 1, 'year', null, '09-01', '10-15', 'indoor', 'normal'),
    (target_household, true, 53, 'Air conditioner check', '❄️', 'small', 20, 1, 'year', null, '05-01', '06-15', 'outdoor', 'normal');
$$;


alter table public.task_templates drop column min_energy_mode;
