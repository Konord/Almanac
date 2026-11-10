-- Repeating grocery items replace weekly buys (Connor, 2026-11-10).
--
-- grocery_repeats   something that goes on the grocery list by itself
--                   every so often: milk every week, coffee every 3
--                   weeks, water filters every 2 months. It's added when
--                   it comes due (whenever the list is read), not when the
--                   weekly review is saved, and it's managed from the
--                   grocery list itself instead of the Menu Manager.
--
-- Weekly buys are moved over (every N weeks, due the week after they last
-- went on a list) and the weekly_buys table is dropped. Grocery lines they
-- made are marked as repeats.

create table public.grocery_repeats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  amount numeric(8, 2) check (amount is null or amount > 0),
  unit text check (unit is null or length(unit) <= 20),
  -- Every 2 weeks, every 10 days, every 3 months.
  every smallint not null default 1 check (every between 1 and 365),
  every_unit text not null default 'week' check (every_unit in ('day', 'week', 'month')),
  -- When it next goes on the list.
  next_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, item_id),
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade
);

create index grocery_repeats_due_idx on public.grocery_repeats (household_id, next_on);

alter table public.grocery_repeats enable row level security;
revoke all on public.grocery_repeats from anon;
create policy "Households manage their own repeating groceries" on public.grocery_repeats for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));

insert into public.grocery_repeats (household_id, item_id, amount, unit, every, every_unit, next_on)
select distinct on (household_id, item_id) household_id, item_id, amount, unit, every_weeks, 'week',
  coalesce(last_week + 7 * every_weeks, current_date)
from public.weekly_buys
order by household_id, item_id, created_at;

drop table public.weekly_buys;

alter table public.shopping_list drop constraint shopping_list_source_check;
update public.shopping_list set source = 'repeat' where source = 'weekly';
alter table public.shopping_list add constraint shopping_list_source_check
  check (source in ('manual', 'meal', 'repeat', 'backup', 'heads_up'));

-- New households start with milk, eggs, bread and bananas repeating weekly.
create or replace function public.add_starter_meals(target_household uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  lunch uuid;
  dinner uuid;
  cat uuid;
  rec uuid;
  entry record;
  variant text;
begin
  insert into public.meal_times (household_id, name, icon, usual_time, sort_order)
  values (target_household, 'Lunch', '🥪', '12:00', 1) returning id into lunch;
  insert into public.meal_times (household_id, name, icon, usual_time, sort_order)
  values (target_household, 'Dinner', '🍽️', '18:00', 2) returning id into dinner;

  for entry in
    select * from (values
      (1, 'Tacos', '🌮', 'dinner', array['Beef tacos|🌮', 'Chicken tacos|🌮', 'Bean tacos|🌮']),
      (2, 'Pasta', '🍝', 'dinner', array['Spaghetti|🍝', 'Macaroni|🧀', 'Lasagne|🥘']),
      (3, 'Meat & potatoes', '🍗', 'dinner', array['Roast chicken|🍗', 'Pork chops|🥩', 'Steak|🥩']),
      (4, 'Slow cooker', '🍲', 'dinner', array['Chili|🍲', 'Pot roast|🥘']),
      (5, 'Pizza', '🍕', 'dinner', array['Homemade pizza|🍕', 'Frozen pizza|🍕']),
      (6, 'Stir-fry', '🥡', 'dinner', array['Chicken stir-fry|🥡', 'Fried rice|🍚']),
      (7, 'Soup', '🥣', 'any', array['Chicken noodle soup|🥣', 'Tomato soup|🍅']),
      (8, 'Breakfast for dinner', '🥞', 'dinner', array['Pancakes|🥞', 'Eggs and toast|🍳']),
      (9, 'Sandwiches', '🥪', 'lunch', array['Ham sandwich|🥪', 'Turkey wrap|🌯', 'Grilled cheese|🧀']),
      (10, 'Leftovers', '🍱', 'any', array['Leftovers|🍱'])
    ) as v(sort_order, name, icon, suits, variants)
  loop
    insert into public.meal_categories (household_id, name, icon, meal_time_ids, premade, sort_order)
    values (
      target_household, entry.name, entry.icon,
      case entry.suits when 'dinner' then array[dinner] when 'lunch' then array[lunch] else '{}'::uuid[] end,
      true, entry.sort_order
    )
    returning id into cat;
    foreach variant in array entry.variants loop
      insert into public.recipes (household_id, name, icon, premade)
      values (target_household, split_part(variant, '|', 1), split_part(variant, '|', 2), true)
      returning id into rec;
      insert into public.recipe_categories (recipe_id, category_id, household_id) values (rec, cat, target_household);
    end loop;
  end loop;

  insert into public.meal_tags (household_id, name, icon, sort_order) values
    (target_household, 'Quick', '⚡', 1),
    (target_household, 'Vegetarian', '🥦', 2),
    (target_household, 'Kid favourite', '⭐', 3),
    (target_household, 'Budget', '💰', 4),
    (target_household, 'Freezer-friendly', '🧊', 5);

  insert into public.items (household_id, name, icon, aisle) values
    (target_household, 'Milk', '🥛', 'Dairy'),
    (target_household, 'Eggs', '🥚', 'Dairy'),
    (target_household, 'Bread', '🍞', 'Bakery'),
    (target_household, 'Bananas', '🍌', 'Produce');
  insert into public.grocery_repeats (household_id, item_id)
  select target_household, id from public.items where household_id = target_household;
end;
$function$
;
