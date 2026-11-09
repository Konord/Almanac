-- Checks for chores and to-dos (Phase 3, step 3). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, aud, role) values
  ('66666666-6666-6666-6666-666666666666', 'chores-a@test', 'authenticated', 'authenticated'),
  ('77777777-7777-7777-7777-777777777777', 'chores-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select public.create_household('Chore House');

select is((select count(*)::int from public.task_templates), 0, 'A new household starts with no chores');
select is((select count(*)::int from public.task_lists), 2, 'But it gets two to-do lists');
insert into public.task_templates (household_id, name, repeat_every, repeat_unit)
values (public.current_household_id(), 'Clean out the fridge', 1, 'month');

insert into public.task_instances (household_id, list_id, title)
select public.current_household_id(), id, 'Book the dentist' from public.task_lists where name = 'To-do';
select is((select count(*)::int from public.task_instances where status = 'open'), 1, 'A to-do can be added to a list');

select throws_ok(
  $$ insert into public.task_instances (household_id, title) values (public.current_household_id(), 'Nowhere') $$,
  '23514', null, 'A to-do has to be on a list');

select throws_ok(
  $$ insert into public.task_instances (household_id, template_id, status)
     select public.current_household_id(), id, 'done' from public.task_templates limit 1 $$,
  '23514', null, 'A done chore has to say when');

select lives_ok(
  $$ insert into public.task_instances (household_id, template_id, status, completed_on)
     select public.current_household_id(), id, 'done', '2026-11-05' from public.task_templates where name = 'Clean out the fridge' $$,
  'A chore can be marked done');

select throws_ok(
  $$ update public.task_templates set season_start = '13-01', season_end = '01-01' where name = 'Clean out the fridge' $$,
  '23514', null, 'Season dates have to be real month-day dates');

-- Household B sees none of A's chores or to-dos.
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.task_instances), 0, 'Another household cannot see these to-dos');

select is((select count(*)::int from public.task_templates where premade), 0, 'No household has app-made chores any more');

select * from finish();
rollback;
