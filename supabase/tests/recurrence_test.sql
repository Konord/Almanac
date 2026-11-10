-- Checks for repeating events and their one-off exceptions. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_household('House A');

insert into public.events (household_id, title, starts_at, ends_at, timezone, recurrence_rule)
values (public.current_household_id(), 'Hockey', '2026-11-03 18:00-05', '2026-11-03 19:00-05', 'America/Toronto', 'FREQ=WEEKLY;BYDAY=TU');
select set_config('test.event', (select id::text from public.events where title = 'Hockey'), true);
select set_config('test.household_a', public.current_household_id()::text, true);

select throws_ok(
  $$ insert into public.events (household_id, title, starts_at, ends_at, timezone, recurrence_rule)
     values (public.current_household_id(), 'Bad', now(), now(), 'America/Toronto', 'FREQ=WEEKLY; DROP TABLE x') $$,
  '23514', null, 'Odd recurrence rules are refused'
);

select lives_ok(
  $$ insert into public.event_exceptions (household_id, event_id, original_date, skipped)
     values (public.current_household_id(), current_setting('test.event')::uuid, '2026-11-10', true) $$,
  'A household can skip one date of its own repeating event'
);

select throws_ok(
  $$ insert into public.event_exceptions (household_id, event_id, original_date, skipped)
     values (public.current_household_id(), current_setting('test.event')::uuid, '2026-11-17', false) $$,
  '23514', null, 'A moved date needs new times'
);

select throws_ok(
  $$ insert into public.event_exceptions (household_id, event_id, original_date, skipped)
     values (public.current_household_id(), current_setting('test.event')::uuid, '2026-11-10', true) $$,
  '23505', null, 'Each date can only have one exception'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_household('House B');

select is((select count(*)::int from public.event_exceptions), 0, 'B cannot see A''s exceptions');

select throws_ok(
  $$ insert into public.event_exceptions (household_id, event_id, original_date, skipped)
     values (current_setting('test.household_a')::uuid, current_setting('test.event')::uuid, '2026-11-24', true) $$,
  '42501', null, 'B cannot skip A''s events'
);

select * from finish();
rollback;
