-- Checks for the weekly review: chore day moves and confirmed weeks. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('98989898-9898-9898-9898-989898989898', 'review-a@test', 'authenticated', 'authenticated'),
  ('99999999-9898-9898-9898-989898989898', 'review-b@test', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"98989898-9898-9898-9898-989898989898","role":"authenticated"}', true);
select public.create_household('Review House');

insert into public.chore_days (household_id, name, weekdays) values (public.current_household_id(), 'Marketing', '{1}');
-- "Move Marketing to Sunday": off Monday, on Sunday.
insert into public.chore_day_moves (household_id, chore_day_id, date, "on")
select public.current_household_id(), id, d, d = '2026-11-15' from public.chore_days, unnest(array['2026-11-15', '2026-11-16']::date[]) d
where name = 'Marketing';
select is((select count(*)::int from public.chore_day_moves), 2, 'A chore day can be moved for one week');
select throws_ok(
  $$insert into public.chore_day_moves (household_id, chore_day_id, date, "on") select public.current_household_id(), id, '2026-11-15', false from public.chore_days where name = 'Marketing'$$,
  '23505', null, 'One move per chore day per date'
);
insert into public.weekly_reviews (household_id, week_start, dismissed) values (public.current_household_id(), '2026-11-15', '{busy|2026-11-18|x}');
select is((select dismissed from public.weekly_reviews), '{busy|2026-11-18|x}'::text[], 'A confirmed week keeps what was left as it is');

select set_config('request.jwt.claims', '{"sub":"99999999-9898-9898-9898-989898989898","role":"authenticated"}', true);
select public.create_household('Other Review House');
select is((select count(*)::int from public.chore_day_moves), 0, 'Other households cannot see moves');
select is((select count(*)::int from public.weekly_reviews), 0, 'Other households cannot see reviews');

select * from finish();
rollback;
