-- Scheduling model, step 4: the chore date rule builder.
--
-- A chore's rule has four parts:
--   start from   when it was last done (as before), or a set date
--   step         every N days, weeks, months or years (as before)
--   snap to      the nearest weekday, or the first/last weekday of the
--                month or of the season
--   only in      some months, or some seasons (spring from March 20,
--                summer from June 21, fall from September 22, winter
--                from December 21)
-- The old "once a year between two dates" chores keep working as before.

alter table public.task_templates
  add column repeat_from text not null default 'done' check (repeat_from in ('done', 'date')),
  add column start_date date,
  -- Left out when adding (as the starter chores are): the nearest
  -- favourite weekday if there is one (see the trigger below).
  add column snap text not null default 'none'
    check (snap in ('none', 'weekday', 'first_of_month', 'last_of_month', 'first_of_season', 'last_of_season')),
  add column only_months smallint[] check (only_months is null or only_months <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::smallint[]),
  add column only_seasons text[] check (only_seasons is null or only_seasons <@ array['spring', 'summer', 'fall', 'winter']);

-- Chores with a favourite day already moved to the nearest one.
update public.task_templates set snap = 'weekday' where preferred_weekday is not null;

alter table public.task_templates
  add constraint task_templates_snap_has_weekday check (snap = 'none' or preferred_weekday is not null),
  add constraint task_templates_date_has_start check (repeat_from = 'done' or start_date is not null);

alter table public.task_templates alter column snap drop default;

create function public.task_templates_default_snap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.snap is null then
    new.snap := case when new.preferred_weekday is null then 'none' else 'weekday' end;
  end if;
  return new;
end;
$$;

create trigger task_templates_default_snap
before insert on public.task_templates
for each row execute function public.task_templates_default_snap();
