-- Survival mode: for now a day is either normal or survival.
--
-- The design doc also has a Low mode in between. Connor chose to start with
-- just Normal and Survival (2026-11-06), so the app no longer offers Low.
-- The database still allows 'low' so it can come back later without
-- another change; this only moves anything already set to Low back to
-- Normal so nothing is stuck in a mode the app can't show.

update public.days set energy_mode = 'normal' where energy_mode = 'low';

update public.task_templates set min_energy_mode = 'normal' where min_energy_mode = 'low';
