-- Checks for chore blocks and chore to-dos. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('96969696-9696-9696-9696-969696969696', 'blocks-a@test', 'authenticated', 'authenticated'),
  ('97979797-9797-9797-9797-979797979797', 'blocks-b@test', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"96969696-9696-9696-9696-969696969696","role":"authenticated"}', true);
select public.create_household('Blocks House');

select is((select count(*)::int from public.task_templates), 0, 'New households start with no chores, not even Plan meals');
insert into public.task_templates (household_id, name, size, repeat_every, repeat_unit)
values (public.current_household_id(), 'Wash the towels', 'small', 1, 'week');

select throws_ok(
  $$insert into public.chore_blocks (household_id, name, kind, weekdays) values (public.current_household_id(), 'Laundry', 'closed', '{1}')$$,
  '23514', null, 'Closed chore time needs its chore'
);
insert into public.chore_blocks (household_id, name, weekdays) values (public.current_household_id(), 'Big clean', '{6}');

insert into public.task_instances (household_id, template_id, list_id, title, due_date)
select public.current_household_id(), t.id, (select id from public.task_lists limit 1), t.name, '2026-11-06'
from public.task_templates t where t.name = 'Wash the towels';
select throws_ok(
  $$insert into public.task_instances (household_id, template_id, list_id, title, due_date)
    select public.current_household_id(), t.id, (select id from public.task_lists limit 1), t.name, '2026-11-07'
    from public.task_templates t where t.name = 'Wash the towels'$$,
  '23505', null, 'A chore has one open to-do at a time'
);

select set_config('request.jwt.claims', '{"sub":"97979797-9797-9797-9797-979797979797","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.chore_blocks), 0, 'Other households cannot see chore time');
select is((select count(*)::int from public.task_instances where template_id is not null), 0, 'Other households cannot see chore to-dos');

select * from finish();
rollback;
