-- Checks for chore days and chore tags. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, aud, role) values
  ('96969696-9696-9696-9696-969696969696', 'days-a@test', 'authenticated', 'authenticated'),
  ('97979797-9797-9797-9797-979797979797', 'days-b@test', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"96969696-9696-9696-9696-969696969696","role":"authenticated"}', true);
select public.create_household('Days House');

select is((select count(*)::int from public.task_templates), 0, 'New households start with no chores');
select is((select name from public.chore_days where is_free), 'Free day', 'New households get a Free day');
select throws_ok(
  $$insert into public.chore_days (household_id, name, is_free) values (public.current_household_id(), 'Another free day', true)$$,
  '23505', null, 'Only one Free day'
);
insert into public.chore_days (household_id, name, weekdays, restrictive) values (public.current_household_id(), 'Laundry', '{2}', true);

insert into public.task_templates (household_id, name, kind, tags, repeat_every, repeat_unit)
values (public.current_household_id(), 'Wash the blankets', 'generated', '{big}', 3, 'month');
select throws_ok(
  $$insert into public.task_templates (household_id, name, tags, repeat_every, repeat_unit) values (public.current_household_id(), 'Mystery', '{shiny}', 1, 'week')$$,
  '23514', null, 'Tags come from the preset list'
);
insert into public.task_template_chore_days (template_id, chore_day_id, household_id)
select t.id, d.id, public.current_household_id() from public.task_templates t, public.chore_days d
where t.name = 'Wash the blankets' and d.name = 'Laundry';
select is((select count(*)::int from public.task_template_chore_days), 1, 'A chore can be tagged for a chore day');

insert into public.task_instances (household_id, template_id, list_id, title, due_date)
select public.current_household_id(), t.id, (select id from public.task_lists limit 1), t.name, '2026-11-06'
from public.task_templates t where t.name = 'Wash the blankets';
select throws_ok(
  $$insert into public.task_instances (household_id, template_id, list_id, title, due_date)
    select public.current_household_id(), t.id, (select id from public.task_lists limit 1), t.name, '2026-11-07'
    from public.task_templates t where t.name = 'Wash the blankets'$$,
  '23505', null, 'A chore has one open to-do at a time'
);

select set_config('request.jwt.claims', '{"sub":"97979797-9797-9797-9797-979797979797","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.chore_days), 1, 'Other households only see their own Free day');
select is((select count(*)::int from public.task_template_chore_days), 0, 'Other households cannot see chore day tags');

select * from finish();
rollback;
