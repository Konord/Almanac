-- Security checks for the foundation tables. Run with: npx supabase test db
-- Each test signs in as a pretend login and checks what it can and can't do.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

-- Sign in as household A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select isnt(public.create_household('House A'), null, 'A login can create its household');
select throws_ok($$ select public.create_household('Again') $$, 'This login already has a household', 'A login only gets one household');
select is((select count(*)::int from public.themes), 1, 'A new household gets the bright theme');

insert into public.members (household_id, name, role)
values (public.current_household_id(), 'Dad', 'parent'), (public.current_household_id(), 'Kid', 'child');

select lives_ok($$ select public.set_member_pin((select id from public.members where name = 'Dad'), '1234') $$, 'A parent can have a PIN');
select ok(public.verify_member_pin((select id from public.members where name = 'Dad'), '1234'), 'The right PIN is accepted');
select ok(not public.verify_member_pin((select id from public.members where name = 'Dad'), '0000'), 'A wrong PIN is refused');
select throws_ok($$ select public.set_member_pin((select id from public.members where name = 'Kid'), '1234') $$, 'No parent with that id in this household', 'Children cannot have PINs');
select throws_ok($$ select public.set_member_pin((select id from public.members where name = 'Dad'), '12') $$, 'A PIN must be 4 to 8 digits', 'PINs must be 4 to 8 digits');
select throws_ok($$ select pin_hash from public.members $$, '42501', null, 'Stored PINs cannot be read');
select throws_ok($$ update public.activity_log set action = 'changed' $$, '42501', null, 'The activity log cannot be edited');

-- Remember A's id so B can try to use it.
select set_config('test.household_a', public.current_household_id()::text, true);

-- Sign in as household B
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('House B');

select is((select count(*)::int from public.members), 0, 'B cannot see A''s members');
select is((select count(*)::int from public.households), 1, 'B only sees its own household');
select throws_ok(
  $$ insert into public.members (household_id, name, role)
     values (current_setting('test.household_a')::uuid, 'Intruder', 'child') $$,
  '42501', null, 'B cannot add members to A''s household'
);

-- Signed out
set local role anon;
select throws_ok($$ select count(*) from public.households $$, '42501', null, 'Signed-out visitors see nothing');

select * from finish();
rollback;
