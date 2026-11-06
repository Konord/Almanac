-- Checks for day types and anchored routines. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, aud, role) values
  ('91919191-9191-9191-9191-919191919191', 'days-a@test', 'authenticated', 'authenticated'),
  ('92929292-9292-9292-9292-929292929292', 'days-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}', true);
select public.create_household('Days House');
insert into public.members (household_id, name, role) values (public.current_household_id(), 'Kid', 'child');

select is((select count(*)::int from public.day_types), 2, 'A new person gets two kinds of day');
select is((select array_agg(name order by sort_order) from public.day_types), array['Weekday', 'Weekend'], 'Weekday and Weekend');
select is((select count(*)::int from public.week_plan_days), 7, 'Their usual week covers all seven days');
select isnt((select current_week_plan_id from public.members where name = 'Kid'), null, 'They are on their usual week');
select is((select anchor from public.routine_templates where name = 'Bedtime'), 'bed', 'Bedtime routines end by bedtime');
select is((select anchor from public.routine_templates where name = 'School morning'), 'wake', 'Morning routines follow wake-up');

insert into public.day_overrides (household_id, member_id, date, wake_time)
select public.current_household_id(), id, '2026-11-11', '09:00' from public.members where name = 'Kid';

-- Another household sees none of it.
select set_config('request.jwt.claims', '{"sub":"92929292-9292-9292-9292-929292929292","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.day_types), 0, 'Other households cannot see these kinds of day');
select is((select count(*)::int from public.day_overrides), 0, 'Other households cannot see these day changes');

select * from finish();
rollback;
