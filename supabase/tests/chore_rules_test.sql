-- Checks for chore date rules. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, aud, role) values
  ('95959595-9595-9595-9595-959595959595', 'rules-a@test', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"95959595-9595-9595-9595-959595959595","role":"authenticated"}', true);
select public.create_household('Rules House');

select is((select snap from public.task_templates where name = 'Vacuum and mop the floors'), 'weekday', 'Starter chores with a favourite day land on the nearest one');
select throws_ok(
  $$update public.task_templates set snap = 'first_of_month', preferred_weekday = null where name = 'Wash the towels'$$,
  '23514', null, 'A snap needs a day of the week'
);
select throws_ok(
  $$update public.task_templates set only_seasons = array['monsoon'] where name = 'Wash the towels'$$,
  '23514', null, 'Seasons are spring, summer, fall and winter'
);

select * from finish();
rollback;
