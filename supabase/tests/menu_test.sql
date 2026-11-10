-- Checks for dishes, meals on the menu and the grocery list. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, aud, role) values
  ('97979797-9797-9797-9797-979797979797', 'menu-a@test', 'authenticated', 'authenticated'),
  ('97979797-9797-9797-9797-979797979798', 'menu-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"97979797-9797-9797-9797-979797979797","role":"authenticated"}', true);
select public.create_household('Menu House');

select ok((select count(*) from public.dish_kinds where name in ('Main', 'Starch', 'Veggie')) = 3, 'A new household gets Main, Starch and Veggie');
select ok((select count(*) from public.menu_meals) > 0, 'And meals on the menu');
select is(
  (select count(*)::int from public.menu_meal_spots s join public.menu_meals m on m.id = s.menu_meal_id where m.name = 'Steak and baked potatoes'),
  3, 'Steak and baked potatoes has three dishes');
select is((select count(*)::int from public.task_lists where is_groceries), 1, 'And one grocery list');
select throws_ok($$ delete from public.task_lists where is_groceries $$, null, null, 'The grocery list can''t be deleted');

-- A planned meal's first picked dish is its recipe.
insert into public.meals (household_id, date, meal_time_id)
select public.current_household_id(), '2026-11-12', id from public.meal_times order by sort_order desc limit 1;
insert into public.meal_dishes (household_id, meal_id, position, kind_id)
select public.current_household_id(), m.id, 0, k.id from public.meals m, public.dish_kinds k where k.name = 'Main';
insert into public.meal_dishes (household_id, meal_id, position, recipe_id)
select public.current_household_id(), m.id, 1, r.id from public.meals m, public.recipes r where r.name = 'Rice';
select is((select r.name from public.meals m join public.recipes r on r.id = m.recipe_id), 'Rice', 'The meal''s recipe follows its first picked dish');

select throws_ok(
  $$ insert into public.menu_meal_spots (household_id, menu_meal_id, position, batches)
     select public.current_household_id(), id, 9, 4 from public.menu_meals limit 1 $$,
  '23514', null, 'Batches are 1 to 3, and a spot needs a kind or a dish');

-- Another household sees none of it.
select set_config('request.jwt.claims', '{"sub":"97979797-9797-9797-9797-979797979798","role":"authenticated"}', true);
select is((select count(*)::int from public.menu_meals), 0, 'Another household sees no meals');

select * from finish();
rollback;
