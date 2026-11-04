-- Checks for saved views and the day-profile settings default. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_household('House A');
select set_config('test.household_a', public.current_household_id()::text, true);
select set_config('test.court', (select id::text from public.layers where name = 'Court'), true);
select set_config('test.kids', (select id::text from public.layers where name = 'Kids'), true);

select is(
  (select settings -> 'dayProfile' ->> 'busyDayMinutes' from public.households),
  '240',
  'New households get default free/busy thresholds'
);

select lives_ok(
  $$ insert into public.views (household_id, name, layer_ids)
     values (public.current_household_id(), 'Court and kids',
             array[current_setting('test.court')::uuid, current_setting('test.kids')::uuid]) $$,
  'A household can save a view of its own layers'
);

select throws_ok(
  $$ insert into public.views (household_id, name, layer_ids)
     values (public.current_household_id(), 'Made up', array[gen_random_uuid()]) $$,
  '23503', null, 'A view cannot list a layer that does not exist'
);

delete from public.layers where name = 'Court';
select is(
  (select layer_ids from public.views where name = 'Court and kids'),
  array[current_setting('test.kids')::uuid],
  'Removing a layer takes it out of views'
);

-- Now as household B.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('House B');

select is((select count(*)::int from public.views), 0, 'B cannot see A''s views');

select throws_ok(
  $$ insert into public.views (household_id, name, layer_ids)
     values (public.current_household_id(), 'Sneaky', array[current_setting('test.kids')::uuid]) $$,
  '23503', null, 'B cannot put A''s layers in its own view'
);

select throws_ok(
  $$ insert into public.views (household_id, name) values (current_setting('test.household_a')::uuid, 'Sneaky') $$,
  '42501', null, 'B cannot add views to A''s household'
);

select * from finish();
rollback;
