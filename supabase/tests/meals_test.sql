-- Checks for Meals. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, aud, role) values
  ('88888888-8888-8888-8888-888888888888', 'meals-a@test', 'authenticated', 'authenticated'),
  ('99999999-9999-9999-9999-999999999999', 'meals-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select public.create_household('Meal House');

select is((select string_agg(name, ',' order by sort_order) from public.meal_times), 'Lunch,Dinner', 'A new household starts with Lunch and Dinner');
select is((select count(*)::int from public.meal_categories), 10, 'And ten starter categories');
select is((select count(*)::int from public.meal_categories where is_leftovers and name = 'Leftovers'), 1, 'One of them is Leftovers, the blank');
select is((select count(*)::int from public.recipes where name = 'Leftovers'), 0, 'Leftovers has no dish of its own');
select is(
  (select string_agg(r.name, ',' order by r.name) from public.recipes r
   join public.recipe_categories rc on rc.recipe_id = r.id
   join public.meal_categories c on c.id = rc.category_id where c.name = 'Tacos'),
  'Bean tacos,Beef tacos,Chicken tacos', 'Tacos come with beef, chicken and bean');
select is((select count(*)::int from public.grocery_repeats), 4, 'And a few repeating groceries');

-- Two lunches on one day, for different people.
insert into public.members (household_id, name, role) values
  (public.current_household_id(), 'Connor', 'parent'), (public.current_household_id(), 'Ava', 'child');
insert into public.meals (household_id, date, meal_time_id, recipe_id)
select public.current_household_id(), '2026-11-04', t.id, r.id
from public.meal_times t, public.recipes r where t.name = 'Lunch' and r.name in ('Ham sandwich', 'Grilled cheese');
select is((select count(*)::int from public.meals where date = '2026-11-04'), 2, 'A meal time can hold more than one meal');

insert into public.meal_members (meal_id, member_id, household_id)
select m.id, mem.id, m.household_id from public.meals m, public.members mem
where mem.name = 'Connor' and m.recipe_id = (select id from public.recipes where name = 'Grilled cheese');
select is((select count(*)::int from public.meal_members), 1, 'A meal can be for just some people');

-- New people get the meal blocks on each of their kinds of day.
select is(
  (select count(*)::int from public.meal_time_uses u join public.members m on m.id = u.member_id where m.name = 'Ava'),
  (select count(*)::int * 2 from public.day_types d join public.members m on m.id = d.member_id where m.name = 'Ava'),
  'A new person has Lunch and Dinner on every kind of day');

-- Leftovers is a blank: nothing goes in it, and it can't be removed.
select throws_ok(
  $$ insert into public.recipe_categories (recipe_id, category_id, household_id)
     select r.id, c.id, c.household_id from public.recipes r, public.meal_categories c where r.name = 'Steak' and c.is_leftovers $$,
  '23514', null, 'No dish can go in Leftovers');
select throws_ok(
  $$ insert into public.menu_meal_categories (menu_meal_id, category_id, household_id)
     select m.id, c.id, c.household_id from public.menu_meals m, public.meal_categories c where c.is_leftovers limit 1 $$,
  '23514', null, 'No meal can go in Leftovers');
select throws_ok($$ delete from public.meal_categories where is_leftovers $$, '23514', null, 'Leftovers can''t be removed');
update public.meals set category_id = (select id from public.meal_categories where is_leftovers)
where recipe_id = (select id from public.recipes where name = 'Grilled cheese');
select is(
  (select count(*)::int from public.meals m join public.meal_categories c on c.id = m.category_id where c.is_leftovers and m.recipe_id is null),
  1, 'A meal turned into Leftovers drops its dish');
select throws_ok(
  $$ insert into public.meal_dishes (household_id, meal_id, position, recipe_id)
     select m.household_id, m.id, 0, (select id from public.recipes where name = 'Steak')
     from public.meals m join public.meal_categories c on c.id = m.category_id where c.is_leftovers $$,
  '23514', null, 'Leftovers have no dishes');

-- Presets: one per weekday of a meal block, a kind of meal or one meal.
insert into public.meal_presets (household_id, weekday, meal_time_id, category_id)
select public.current_household_id(), 2, t.id, c.id from public.meal_times t, public.meal_categories c where t.name = 'Dinner' and c.name = 'Tacos';
select throws_ok(
  $$ insert into public.meal_presets (household_id, weekday, meal_time_id, menu_meal_id)
     select public.current_household_id(), 2, t.id, (select id from public.menu_meals limit 1) from public.meal_times t where t.name = 'Dinner' $$,
  '23505', null, 'A weekday of a meal block has one preset');

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
