-- Checks for floating routine times (Phase 3, step 4). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, aud, role) values
  ('88888888-8888-8888-8888-888888888888', 'float-a@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select public.create_household('Float House');

select is((select count(*)::int from public.routine_templates where usual_start is null), (select count(*)::int from public.routine_templates),
  'Premade routines start without a fixed time (it comes from their steps)');

update public.routine_templates set usual_start = '18:45', usual_minutes = 40 where name = 'Bedtime';
select is((select usual_minutes::int from public.routine_templates where name = 'Bedtime'), 40, 'A routine can have a usual time and length');

select throws_ok(
  $$ update public.routine_templates set usual_minutes = 0 where name = 'Bedtime' $$,
  '23514', null, 'A routine takes at least 5 minutes');

select * from finish();
rollback;
