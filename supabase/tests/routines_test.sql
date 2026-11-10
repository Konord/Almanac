-- Checks for routines. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
  $$ insert into public.routine_assignments (household_id, template_id, member_id, day_type_id)
     values (public.current_household_id(), current_setting('test.bedtime')::uuid, current_setting('test.ava')::uuid,
       (select id from public.day_types where member_id = current_setting('test.ava')::uuid and name = 'Weekday')) $$,
  'A routine can be given to one of someone''s kinds of day'
);

select throws_ok(
  $$ insert into public.routine_assignments (household_id, template_id, member_id, day_type_id, on_date)
     values (public.current_household_id(), current_setting('test.bedtime')::uuid, current_setting('test.ava')::uuid,
       (select id from public.day_types where member_id = current_setting('test.ava')::uuid limit 1), '2026-11-05') $$,
  '23514', null, 'An assignment is a kind of day or one date, not both'
);

select throws_ok(
  $$ insert into public.routine_assignments (household_id, template_id, member_id, weekdays)
     values (public.current_household_id(), current_setting('test.bedtime')::uuid, current_setting('test.ava')::uuid, '{1}') $$,
  '23514', null, 'Routines are no longer given out by picked weekdays'
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

select lives_ok(
  $$ insert into public.routine_step_members (household_id, step_id, member_id)
     select public.current_household_id(), id, current_setting('test.ava')::uuid
     from public.routine_steps where template_id <> current_setting('test.bedtime')::uuid limit 1 $$,
  'A step in a shared routine can be given to one person'
);
select is(
  (select daily_list from public.routine_steps where id = current_setting('test.step')::uuid),
  false,
  'Steps stay off the daily list unless switched on'
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

select is(
  (select count(*)::int from public.routine_step_members),
  0,
  'B cannot see who does A''s steps'
);

select * from finish();
rollback;
