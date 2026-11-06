-- One login with several households. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select set_config('test.home', public.create_household('Home')::text, true);
select set_config('test.test', public.create_household('Test House')::text, true);

select is((select count(*)::int from public.my_households()), 2, 'One login can make two households');
select is(public.current_household_id(), current_setting('test.test')::uuid, 'The newest household becomes current');
select is((select name from public.my_households() where is_current), 'Test House', 'my_households marks the current one');
select is((select count(*)::int from public.households), 1, 'Only the current household shows in the households table');

insert into public.members (household_id, name, role) values (public.current_household_id(), 'Tester', 'parent');

select lives_ok($$ select public.switch_household(current_setting('test.home')::uuid) $$, 'It can switch back');
select is(public.current_household_id(), current_setting('test.home')::uuid, 'The switched-to household is current');
select is((select count(*)::int from public.members), 0, 'The other household''s people are hidden after switching');
select ok((select count(*) from public.routine_templates) > 0, 'Each household gets its own starter routines');

select throws_ok($$ select public.delete_household(current_setting('test.test')::uuid, 'wrong') $$,
  'Type the household''s name exactly to delete it', 'Deleting needs the name typed');

-- Another login can't see, switch to or delete these households.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('Neighbours');
select is((select count(*)::int from public.my_households()), 1, 'Another login only lists its own households');
select throws_ok($$ select public.switch_household(current_setting('test.home')::uuid) $$,
  'No household with that id for this login', 'Another login cannot switch to them');
select throws_ok($$ select public.delete_household(current_setting('test.home')::uuid, 'Home') $$,
  'No household with that id for this login', 'Another login cannot delete them');

-- Back as the first login: delete the current household, and the other one takes over.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.switch_household(current_setting('test.test')::uuid);
select lives_ok($$ select public.delete_household(current_setting('test.test')::uuid, ' test house ') $$, 'A household can be deleted');
select is(public.current_household_id(), current_setting('test.home')::uuid, 'The remaining household becomes current');

select * from finish();
rollback;
