-- Checks for routines. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_household('House A');
insert into public.members (household_id, name, role) values (public.current_household_id(), 'Ava', 'child');
select set_config('test.ava', (select id::text from public.members where name = 'Ava'), true);
select set_config('test.bedtime', (select id::text from public.routine_templates where name = 'Bedtime'), true);
select set_config('test.step', (select id::text from public.routine_steps where text = 'Lights out'), true);

select is((select count(*)::int from public.routine_templates where premade), 5, 'New households get five ready-made routines');
select is(
  (select count(*)::int from public.routine_steps where template_id = current_setting('test.bedtime')::uuid and essential),
  4,
  'Bedtime has its essential steps marked'
);

select lives_ok(
  $$ insert into public.routine_assignments (household_id, template_id, member_id, weekdays)
     values (public.current_household_id(), current_setting('test.bedtime')::uuid, current_setting('test.ava')::uuid, '{0,1,2,3,4}') $$,
  'A routine can be given to someone on certain weekdays'
);

select throws_ok(
  $$ insert into public.routine_assignments (household_id, template_id, member_id, weekdays, on_date)
     values (public.current_household_id(), current_setting('test.bedtime')::uuid, current_setting('test.ava')::uuid, '{1}', '2026-11-05') $$,
  '23514', null, 'An assignment is weekdays or one date, not both'
);

select throws_ok(
  $$ insert into public.routine_assignments (household_id, template_id, member_id, weekdays)
     values (public.current_household_id(), current_setting('test.bedtime')::uuid, current_setting('test.ava')::uuid, '{7}') $$,
  '23514', null, 'Weekdays run from 0 (Sunday) to 6 (Saturday)'
);

select lives_ok(
  $$ insert into public.routine_checks (household_id, member_id, step_id, check_date)
     values (public.current_household_id(), current_setting('test.ava')::uuid, current_setting('test.step')::uuid, '2026-11-04') $$,
  'A step can be ticked off for a day'
);

select throws_ok(
  $$ insert into public.routine_checks (household_id, member_id, step_id, check_date)
     values (public.current_household_id(), current_setting('test.ava')::uuid, current_setting('test.step')::uuid, '2026-11-04') $$,
  '23505', null, 'A step is only ticked once per person per day'
);

delete from public.routine_templates where name = 'Bedtime';
select is(
  (select count(*)::int from public.routine_checks),
  0,
  'Removing a routine removes its steps, assignments and ticks'
);

-- Now as household B.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('House B');

select is(
  (select count(*)::int from public.routine_templates),
  5,
  'B only sees its own routines'
);

select throws_ok(
  $$ insert into public.routine_checks (household_id, member_id, step_id, check_date)
     select public.current_household_id(), current_setting('test.ava')::uuid, id, '2026-11-04'
     from public.routine_steps limit 1 $$,
  '23503', null, 'B cannot tick steps for A''s family members'
);

select * from finish();
rollback;
