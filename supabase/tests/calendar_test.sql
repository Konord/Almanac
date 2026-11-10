-- Security and integrity checks for events. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

set local role authenticated;

-- Household A
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_household('House A');

insert into public.events (household_id, title, starts_at, ends_at, timezone, day_kind)
values (public.current_household_id(), 'Office', '2026-11-05 09:00-05', '2026-11-05 17:00-05', 'America/Toronto', 'Office day');
select is((select count(*)::int from public.events), 1, 'A household can add an event (one that makes it an Office day)');

select throws_ok(
  $$ insert into public.events (household_id, title, starts_at, ends_at, timezone)
     values (public.current_household_id(), 'Backwards', '2026-11-05 15:00-05', '2026-11-05 14:00-05', 'America/Toronto') $$,
  '23514', null, 'An event cannot end before it starts'
);

select throws_ok(
  $$ insert into public.events (household_id, title, starts_at, ends_at, timezone, day_kind)
     values (public.current_household_id(), 'Odd', now(), now(), 'America/Toronto', '  ') $$,
  '23514', null, 'A kind of day needs a name'
);

select set_config('test.household_a', public.current_household_id()::text, true);

-- Household B
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('House B');

select is((select count(*)::int from public.events), 0, 'B cannot see A''s events');

select throws_ok(
  $$ insert into public.events (household_id, title, starts_at, ends_at, timezone)
     values (current_setting('test.household_a')::uuid, 'Sneaky', now(), now(), 'America/Toronto') $$,
  '42501', null, 'B cannot add events to A''s household'
);

select hasnt_table('public', 'layers', 'Layers are gone (events stand on their own)');

set local role anon;
select throws_ok($$ select count(*) from public.events $$, '42501', null, 'Signed-out visitors see no events');

select * from finish();
rollback;
