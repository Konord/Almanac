-- Start every household with the public holidays already added (Connor,
-- 2026-11-09: "Yes, start with them added"). You take away the ones you
-- don't want on the Holidays screen.
--
-- The list matches PUBLIC_HOLIDAYS in src/lib/holidays.ts (a test checks).
-- Holidays a household already added are left as they are.

create function public.add_starter_holidays(target_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.holidays (household_id, name, icon, rule, public_key, sort_order)
  values
    (target_household, 'New Year''s Day', '🎉', '{"kind":"fixed","month":1,"day":1}'::jsonb, 'new-year', 0),
    (target_household, 'Family Day', '🏠', '{"kind":"nth","month":2,"weekday":1,"n":3}'::jsonb, 'family-day', 1),
    (target_household, 'Valentine''s Day', '💝', '{"kind":"fixed","month":2,"day":14}'::jsonb, 'valentines', 2),
    (target_household, 'St. Patrick''s Day', '☘️', '{"kind":"fixed","month":3,"day":17}'::jsonb, 'st-patricks', 3),
    (target_household, 'Good Friday', '🌷', '{"kind":"easter","offset":-2}'::jsonb, 'good-friday', 4),
    (target_household, 'Easter Sunday', '🐰', '{"kind":"easter","offset":0}'::jsonb, 'easter', 5),
    (target_household, 'Easter Monday', '🐣', '{"kind":"easter","offset":1}'::jsonb, 'easter-monday', 6),
    (target_household, 'Mother''s Day', '💐', '{"kind":"nth","month":5,"weekday":0,"n":2}'::jsonb, 'mothers-day', 7),
    (target_household, 'Victoria Day', '👑', '{"kind":"before","month":5,"day":24,"weekday":1}'::jsonb, 'victoria-day', 8),
    (target_household, 'Father''s Day', '👔', '{"kind":"nth","month":6,"weekday":0,"n":3}'::jsonb, 'fathers-day', 9),
    (target_household, 'Saint-Jean-Baptiste Day', '🎆', '{"kind":"fixed","month":6,"day":24}'::jsonb, 'st-jean', 10),
    (target_household, 'Canada Day', '🍁', '{"kind":"fixed","month":7,"day":1}'::jsonb, 'canada-day', 11),
    (target_household, 'Civic Holiday', '🌞', '{"kind":"nth","month":8,"weekday":1,"n":1}'::jsonb, 'civic-holiday', 12),
    (target_household, 'Labour Day', '🛠️', '{"kind":"nth","month":9,"weekday":1,"n":1}'::jsonb, 'labour-day', 13),
    (target_household, 'Truth and Reconciliation Day', '🧡', '{"kind":"fixed","month":9,"day":30}'::jsonb, 'truth-reconciliation', 14),
    (target_household, 'Thanksgiving', '🦃', '{"kind":"nth","month":10,"weekday":1,"n":2}'::jsonb, 'thanksgiving', 15),
    (target_household, 'Halloween', '🎃', '{"kind":"fixed","month":10,"day":31}'::jsonb, 'halloween', 16),
    (target_household, 'Remembrance Day', '🌺', '{"kind":"fixed","month":11,"day":11}'::jsonb, 'remembrance-day', 17),
    (target_household, 'Christmas Eve', '🌟', '{"kind":"fixed","month":12,"day":24}'::jsonb, 'christmas-eve', 18),
    (target_household, 'Christmas Day', '🎄', '{"kind":"fixed","month":12,"day":25}'::jsonb, 'christmas', 19),
    (target_household, 'Boxing Day', '🎁', '{"kind":"fixed","month":12,"day":26}'::jsonb, 'boxing-day', 20),
    (target_household, 'New Year''s Eve', '🥂', '{"kind":"fixed","month":12,"day":31}'::jsonb, 'new-years-eve', 21)

  on conflict (household_id, public_key) do nothing;
end;
$$;

revoke execute on function public.add_starter_holidays(uuid) from public, anon, authenticated;

-- Households that already exist get them now...
select public.add_starter_holidays(id) from public.households;

-- ...and new households get them when they're created.
create function public.households_add_starter_holidays()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_starter_holidays(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_starter_holidays() from public, anon, authenticated;

create trigger households_add_starter_holidays
after insert on public.households
for each row execute function public.households_add_starter_holidays();
