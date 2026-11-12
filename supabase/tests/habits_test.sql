-- Checks for habits and health tracking (2026-11-12). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, aud, role) values
  ('77777777-7777-7777-7777-777777777771', 'habits-a@test', 'authenticated', 'authenticated'),
  ('77777777-7777-7777-7777-777777777772', 'habits-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777771","role":"authenticated"}', true);
select public.create_household('Habit House');
insert into public.members (household_id, name, role, colour) values (public.current_household_id(), 'Ava', 'child', 'teal');

insert into public.habits (household_id, name, measure, goal, unit, step, frequency, weekdays)
values (public.current_household_id(), 'Reading', 'count', 20, 'pages', 5, 'days', '{1,2,3,4,5}');
insert into public.habit_members (habit_id, member_id, household_id)
select h.id, m.id, h.household_id from public.habits h, public.members m;
insert into public.habit_logs (household_id, habit_id, member_id, log_date, amount)
select h.household_id, h.id, m.id, '2026-11-12', 15 from public.habits h, public.members m;
select is((select amount from public.habit_logs), 15, 'A household logs a count habit');

select throws_ok(
  $$ insert into public.habits (household_id, name, frequency) values (public.current_household_id(), 'Swim', 'days') $$,
  '23514', null, 'Some days needs at least one weekday');
select throws_ok(
  $$ insert into public.habit_logs (household_id, habit_id, member_id, log_date, amount)
     select h.household_id, h.id, m.id, '2026-11-12', 5 from public.habits h, public.members m $$,
  '23505', null, 'One log per habit, person and day');

insert into public.health_trackers (household_id, name, kind) values (public.current_household_id(), 'Medicine', 'medicine');
insert into public.health_choices (household_id, tracker_id, name, wait_minutes, max_per_day)
select household_id, id, 'Tylenol', 240, 5 from public.health_trackers;
insert into public.health_logs (household_id, tracker_id, member_id, choice_id, choice_name, amount)
select t.household_id, t.id, m.id, c.id, c.name, '7.5 ml' from public.health_trackers t, public.members m, public.health_choices c;
delete from public.health_choices;
select is((select choice_name from public.health_logs), 'Tylenol', 'A dose keeps its name when the choice is removed');

select throws_ok(
  $$ insert into public.health_trackers (household_id, name, kind, alert_above) values (public.current_household_id(), 'Notes', 'note', 38) $$,
  '23514', null, 'Only readings have an alert line');

-- Another household sees none of it.
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777772","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.habits) + (select count(*)::int from public.health_logs), 0, 'Habits and health entries are private to their household');
delete from public.health_logs;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777771","role":"authenticated"}', true);
select is((select count(*)::int from public.health_logs), 1, 'Another household can''t remove them');

select * from finish();
rollback;
