-------------------------------------------------------------------------------
-- Menu tweaks (Connor, 2026-11-11).
--
-- 1. Leftovers is a blank, not a kind of meal. Every household has exactly
--    one (meal_categories.is_leftovers). It can be renamed but not removed,
--    and no meals or dishes can go in it. A planned Leftovers meal has no
--    dishes: no cooking, no heads-ups, nothing on the grocery list.
-- 2. Nobody needs "who can see" on dishes, meals or kinds of meal: everyone
--    sees everything. (Who a planned meal is for stays, in meal_members.)
-- 3. Meal times move to the Routine Manager as meal blocks. A meal block
--    (still the meal_times table) is given to people's kinds of day, like a
--    routine (meal_time_uses), has a length, and can preset a meal or a kind
--    of meal on each weekday (meal_presets). The weekly review shows a meal
--    on a day when someone's kind of day that day has the block.
--    Kinds of meal no longer say which meal times they suit.
-- 4. A planned meal can be moved on the calendar for that day only
--    (meals.eat_at). The block's usual time stays as it is.
-------------------------------------------------------------------------------

-- 1. Leftovers ------------------------------------------------------------------

alter table public.meal_categories add column is_leftovers boolean not null default false;
create unique index meal_categories_one_leftovers on public.meal_categories (household_id) where is_leftovers;

-- The household's own "Leftovers" kind becomes the blank (the first one, if there are several).
update public.meal_categories c set is_leftovers = true
where c.id in (
  select distinct on (household_id) id from public.meal_categories
  where lower(trim(name)) = 'leftovers'
  order by household_id, premade desc, sort_order, created_at
);

-- Households without one get one.
insert into public.meal_categories (household_id, name, icon, premade, sort_order, is_leftovers)
select h.id, 'Leftovers', '🍱', true, 99, true
from public.households h
where not exists (select 1 from public.meal_categories c where c.household_id = h.id and c.is_leftovers);

update public.meal_categories set active = true where is_leftovers;

-- Planned meals that used the old "Leftovers" dish become the blank.
update public.meals m set category_id = c.id
from public.recipes r, public.meal_categories c
where r.id = m.recipe_id and lower(trim(r.name)) = 'leftovers'
  and c.household_id = m.household_id and c.is_leftovers;

-- Leftovers meals hold nothing.
delete from public.meal_dishes d using public.meals m, public.meal_categories c
where d.meal_id = m.id and c.id = m.category_id and c.is_leftovers;
update public.meals m set recipe_id = null, menu_meal_id = null, servings = null
from public.meal_categories c
where c.id = m.category_id and c.is_leftovers;

-- Nothing sits in it: no meals, no "goes with" dishes.
delete from public.menu_meal_categories l using public.meal_categories c where c.id = l.category_id and c.is_leftovers;
delete from public.recipe_categories l using public.meal_categories c where c.id = l.category_id and c.is_leftovers;

-- The old starter "Leftovers" dish goes (only the premade one, and only when nothing else uses it).
delete from public.recipes r
where r.premade and lower(trim(r.name)) = 'leftovers'
  and not exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id)
  and not exists (select 1 from public.recipe_steps s where s.recipe_id = r.id);

-- Starter menu meals left with no dishes at all (it was their only dish) go too.
delete from public.menu_meals m where m.premade and not exists (select 1 from public.menu_meal_spots s where s.menu_meal_id = m.id);

create function public.meal_categories_keep_leftovers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_leftovers and exists (select 1 from public.households where id = old.household_id) then
      raise exception 'Leftovers can''t be removed' using errcode = '23514';
    end if;
    return old;
  end if;
  if old.is_leftovers and not new.is_leftovers then
    raise exception 'Leftovers can''t be made a normal kind of meal' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger meal_categories_keep_leftovers before update or delete on public.meal_categories
for each row execute function public.meal_categories_keep_leftovers();

-- Nothing can be put in Leftovers: no menu meals, no "goes with" dishes,
-- and a Leftovers meal has no dishes.
create function public.refuse_leftovers_contents()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'meal_dishes' then
    if exists (
      select 1 from public.meals m join public.meal_categories c on c.id = m.category_id
      where m.id = new.meal_id and c.is_leftovers
    ) then
      raise exception 'Leftovers have no dishes' using errcode = '23514';
    end if;
  elsif exists (select 1 from public.meal_categories c where c.id = new.category_id and c.is_leftovers) then
    raise exception 'Nothing can be added to Leftovers' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger menu_meal_categories_no_leftovers before insert or update on public.menu_meal_categories
for each row execute function public.refuse_leftovers_contents();
create trigger recipe_categories_no_leftovers before insert or update on public.recipe_categories
for each row execute function public.refuse_leftovers_contents();
create trigger meal_dishes_no_leftovers before insert or update on public.meal_dishes
for each row execute function public.refuse_leftovers_contents();

-- A meal turned into Leftovers drops its dishes (so it stays a blank).
create function public.meals_leftovers_are_blank()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and exists (select 1 from public.meal_categories c where c.id = new.category_id and c.is_leftovers) then
    new.recipe_id := null;
    new.menu_meal_id := null;
    new.servings := null;
  end if;
  return new;
end;
$$;

create trigger meals_leftovers_are_blank before insert or update on public.meals
for each row execute function public.meals_leftovers_are_blank();

create function public.meals_leftovers_drop_dishes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.meal_categories c where c.id = new.category_id and c.is_leftovers) then
    delete from public.meal_dishes where meal_id = new.id;
  end if;
  return null;
end;
$$;

create trigger meals_leftovers_drop_dishes after update of category_id on public.meals
for each row execute function public.meals_leftovers_drop_dishes();

-- 2. No "who can see" -------------------------------------------------------------

alter table public.meal_categories drop column visibility;
alter table public.recipes drop column visibility;
alter table public.menu_meals drop column visibility;

-- 3. Meal blocks ----------------------------------------------------------------------

alter table public.meal_categories drop column meal_time_ids;

-- How long eating takes (the block's height in the Routine Manager).
alter table public.meal_times
  add column minutes smallint not null default 30 check (minutes between 10 and 240);

comment on table public.meal_times is 'Meal blocks (Lunch, Dinner): set in the Routine Manager, given to kinds of day in meal_time_uses.';

-- Which people's kinds of day have a meal block.
create table public.meal_time_uses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  meal_time_id uuid not null,
  member_id uuid not null,
  day_type_id uuid not null,
  created_at timestamptz not null default now(),
  unique (meal_time_id, member_id, day_type_id),
  foreign key (meal_time_id, household_id) references public.meal_times (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade,
  foreign key (day_type_id, household_id) references public.day_types (id, household_id) on delete cascade
);

create index meal_time_uses_household_idx on public.meal_time_uses (household_id);
create index meal_time_uses_day_type_idx on public.meal_time_uses (day_type_id);

alter table public.meal_time_uses enable row level security;
revoke all on public.meal_time_uses from anon;
create policy "Households manage their own meal block uses" on public.meal_time_uses for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));

-- Every meal time that was on the planner becomes a block for everyone, on
-- every kind of day. Hidden ones stay as blocks nobody has yet.
insert into public.meal_time_uses (household_id, meal_time_id, member_id, day_type_id)
select t.household_id, t.id, d.member_id, d.id
from public.meal_times t
join public.day_types d on d.household_id = t.household_id
where t.show_on_planner
on conflict do nothing;

alter table public.meal_times drop column show_on_planner;

-- A new kind of day (a new person, or one added in Set days) gets the
-- household's meal blocks: every block someone has, or all of them while
-- nobody has any yet (a brand-new household).
create function public.day_types_add_meal_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.meal_time_uses (household_id, meal_time_id, member_id, day_type_id)
  select new.household_id, t.id, new.member_id, new.id
  from public.meal_times t
  where t.household_id = new.household_id
    and (
      exists (select 1 from public.meal_time_uses u where u.meal_time_id = t.id)
      or not exists (select 1 from public.meal_time_uses u where u.household_id = new.household_id)
    )
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.day_types_add_meal_blocks() from public, anon, authenticated;

create trigger day_types_add_meal_blocks after insert on public.day_types
for each row execute function public.day_types_add_meal_blocks();

-- Presets can be a whole meal (Spaghetti) or a kind of meal (Tacos), and
-- each weekday of a block has at most one.
alter table public.meal_presets
  add column menu_meal_id uuid,
  add constraint meal_presets_menu_meal_fk foreign key (menu_meal_id, household_id)
    references public.menu_meals (id, household_id) on delete cascade,
  alter column category_id drop not null,
  drop constraint meal_presets_household_id_weekday_meal_time_id_category_id_key;

delete from public.meal_presets p using public.meal_presets q
where p.household_id = q.household_id and p.weekday = q.weekday and p.meal_time_id = q.meal_time_id
  and (p.created_at, p.id) > (q.created_at, q.id);

alter table public.meal_presets
  add constraint meal_presets_one_per_day unique (household_id, weekday, meal_time_id),
  add constraint meal_presets_has_something check (num_nonnulls(category_id, menu_meal_id) = 1);

-- 4. This day only ---------------------------------------------------------------------

alter table public.meals add column eat_at time;
comment on column public.meals.eat_at is 'When this one meal is eaten, if it was moved on the calendar. Blank = the meal block''s usual time.';

-- Starters ------------------------------------------------------------------------------

-- New households: Lunch and Dinner blocks (given to each kind of day as
-- people are added), starter kinds of meal and dishes, and Leftovers as the blank.
create or replace function public.add_starter_meals(target_household uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  cat uuid;
  rec uuid;
  entry record;
  variant text;
begin
  insert into public.meal_times (household_id, name, icon, usual_time, sort_order)
  values (target_household, 'Lunch', '🥪', '12:00', 1);
  insert into public.meal_times (household_id, name, icon, usual_time, sort_order)
  values (target_household, 'Dinner', '🍽️', '18:00', 2);

  for entry in
    select * from (values
      (1, 'Tacos', '🌮', array['Beef tacos|🌮', 'Chicken tacos|🌮', 'Bean tacos|🌮']),
      (2, 'Pasta', '🍝', array['Spaghetti|🍝', 'Macaroni|🧀', 'Lasagne|🥘']),
      (3, 'Meat & potatoes', '🍗', array['Roast chicken|🍗', 'Pork chops|🥩', 'Steak|🥩']),
      (4, 'Slow cooker', '🍲', array['Chili|🍲', 'Pot roast|🥘']),
      (5, 'Pizza', '🍕', array['Homemade pizza|🍕', 'Frozen pizza|🍕']),
      (6, 'Stir-fry', '🥡', array['Chicken stir-fry|🥡', 'Fried rice|🍚']),
      (7, 'Soup', '🥣', array['Chicken noodle soup|🥣', 'Tomato soup|🍅']),
      (8, 'Breakfast for dinner', '🥞', array['Pancakes|🥞', 'Eggs and toast|🍳']),
      (9, 'Sandwiches', '🥪', array['Ham sandwich|🥪', 'Turkey wrap|🌯', 'Grilled cheese|🧀'])
    ) as v(sort_order, name, icon, variants)
  loop
    insert into public.meal_categories (household_id, name, icon, premade, sort_order)
    values (target_household, entry.name, entry.icon, true, entry.sort_order)
    returning id into cat;
    foreach variant in array entry.variants loop
      insert into public.recipes (household_id, name, icon, premade)
      values (target_household, split_part(variant, '|', 1), split_part(variant, '|', 2), true)
      returning id into rec;
      insert into public.recipe_categories (recipe_id, category_id, household_id) values (rec, cat, target_household);
    end loop;
  end loop;

  insert into public.meal_categories (household_id, name, icon, premade, sort_order, is_leftovers)
  values (target_household, 'Leftovers', '🍱', true, 99, true);

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
$function$;

revoke execute on function public.add_starter_meals(uuid) from public, anon, authenticated;
