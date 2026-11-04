-- Security and integrity checks for layers and events. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

set local role authenticated;

-- Household A
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_household('House A');
select is((select count(*)::int from public.layers), 4, 'A new household gets the four starter layers');

insert into public.events (household_id, layer_id, title, starts_at, ends_at, timezone)
select public.current_household_id(), id, 'Dentist', '2026-11-05 14:00-05', '2026-11-05 15:00-05', 'America/Toronto'
from public.layers where name = 'Appointments';
select is((select count(*)::int from public.events), 1, 'A household can add an event');

select throws_ok(
  $$ insert into public.events (household_id, layer_id, title, starts_at, ends_at, timezone)
     select public.current_household_id(), id, 'Backwards', '2026-11-05 15:00-05', '2026-11-05 14:00-05', 'America/Toronto'
     from public.layers where name = 'Kids' $$,
  '23514', null, 'An event cannot end before it starts'
);

select set_config('test.household_a', public.current_household_id()::text, true);
select set_config('test.layer_a', (select id::text from public.layers where name = 'Kids'), true);

-- Household B
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('House B');

select is((select count(*)::int from public.events), 0, 'B cannot see A''s events');
select is((select count(*)::int from public.layers), 4, 'B only sees its own layers');

select throws_ok(
  $$ insert into public.events (household_id, layer_id, title, starts_at, ends_at, timezone)
     values (current_setting('test.household_a')::uuid, current_setting('test.layer_a')::uuid,
             'Sneaky', now(), now(), 'America/Toronto') $$,
  '42501', null, 'B cannot add events to A''s household'
);

select throws_ok(
  $$ insert into public.events (household_id, layer_id, title, starts_at, ends_at, timezone)
     values (public.current_household_id(), current_setting('test.layer_a')::uuid,
             'Borrowed layer', now(), now(), 'America/Toronto') $$,
  '23503', null, 'B cannot put an event on A''s layer'
);

select throws_ok($$ select public.add_starter_layers(public.current_household_id()) $$, '42501', null,
  'The app cannot call add_starter_layers directly');

set local role anon;
select throws_ok($$ select count(*) from public.events $$, '42501', null, 'Signed-out visitors see no events');

select * from finish();
rollback;
