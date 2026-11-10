-- Checks for Meals. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, aud, role) values
  ('88888888-8888-8888-8888-888888888888', 'meals-a@test', 'authenticated', 'authenticated'),
  ('99999999-9999-9999-9999-999999999999', 'meals-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select public.create_household('Meal House');

select is((select string_agg(name, ',' order by sort_order) from public.meal_times), 'Lunch,Dinner', 'A new household starts with Lunch and Dinner');
select is((select count(*)::int from public.meal_categories), 10, 'And ten starter categories');
select is(
  (select string_agg(r.name, ',' order by r.name) from public.recipes r
   join public.recipe_categories rc on rc.recipe_id = r.id
   join public.meal_categories c on c.id = rc.category_id where c.name = 'Tacos'),
  'Bean tacos,Beef tacos,Chicken tacos', 'Tacos come with beef, chicken and bean');
select is((select count(*)::int from public.weekly_buys), 4, 'And a few weekly buys');

-- Two lunches on one day, for different people.
insert into public.members (household_id, name, role) values
  (public.current_household_id(), 'Connor', 'parent'), (public.current_household_id(), 'Ava', 'child');
insert into public.meals (household_id, date, meal_time_id, recipe_id)
select public.current_household_id(), '2026-11-04', t.id, r.id
from public.meal_times t, public.recipes r where t.name = 'Lunch' and r.name in ('Ham sandwich', 'Leftovers');
select is((select count(*)::int from public.meals where date = '2026-11-04'), 2, 'A meal time can hold more than one meal');

insert into public.meal_members (meal_id, member_id, household_id)
select m.id, mem.id, m.household_id from public.meals m, public.members mem
where mem.name = 'Connor' and m.recipe_id = (select id from public.recipes where name = 'Leftovers');
select is((select count(*)::int from public.meal_members), 1, 'A meal can be for just some people');

-- A meal's dishes live in meal_dishes now; each one needs a kind or a dish.
select throws_ok(
  $$ insert into public.meal_dishes (household_id, meal_id, position)
     select public.current_household_id(), id, 5 from public.meals limit 1 $$,
  '23514', null, 'A dish on a meal needs a kind or a recipe');

select throws_ok(
  $$ insert into public.step_helpers (household_id, step_id, kind) values (public.current_household_id(), gen_random_uuid(), 'timer') $$,
  '23514', null, 'A timer needs its minutes');

insert into public.days (household_id, date, energy_mode) values (public.current_household_id(), '2026-11-05', 'survival');
select is((select energy_mode from public.days where date = '2026-11-05'), 'survival', 'A day can be a survival day');

select throws_ok(
  $$ insert into public.items (household_id, name) values (public.current_household_id(), 'milk') $$,
  '23505', null, 'Grocery items are not repeated');

-- Household B sees none of A's meals.
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.meals), 0, 'Another household cannot see these meals');

select * from finish();
rollback;
