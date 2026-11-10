-------------------------------------------------------------------------------
-- Dishes and meals (Connor, 2026-11-10).
--
-- A dish is one recipe: Beef tacos, Mashed potatoes, Pumpkin pie. Every
-- dish is just a dish. Kinds (Main, Starch, Veggie, Salad, Starter,
-- Dessert, Bread) only say what a dish can fill.
--
-- A meal is what you plan: one or more spots. Each spot is either a set
-- dish ("Pork chops") or one you pick ("any Veggie"). Most meals are a
-- single dish (Spaghetti). "Pork chops + Mashed potatoes + Veggie" and
-- "Roast chicken + Starch + Veggie" are meals with sides. A custom meal
-- is built in the weekly review from scratch and can be saved as a meal.
--
-- A planned meal (the meals table, one per day and meal time) now holds
-- its own dishes, each with a whole number of batches (×1, ×2, ×3: never
-- half, so the grocery list never asks for half an onion). Every dish on
-- a planned meal can be swapped for that day only.
--
-- The grocery list becomes a list of its own in the List Manager (it can
-- be renamed, not removed). Saving the weekly review puts the menu's
-- ingredients straight on it, added together; there's no approve step.
-------------------------------------------------------------------------------

-- Kinds of dish -----------------------------------------------------------------

create table public.dish_kinds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  icon text check (icon is null or length(icon) <= 16),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create unique index dish_kinds_household_name on public.dish_kinds (household_id, lower(name));

create table public.recipe_kinds (
  recipe_id uuid not null,
  kind_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (recipe_id, kind_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (kind_id, household_id) references public.dish_kinds (id, household_id) on delete cascade
);

create index recipe_kinds_kind_idx on public.recipe_kinds (kind_id);

-- Meals on the menu -------------------------------------------------------------

create table public.menu_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Blank = called after its first dish (one-dish meals follow the dish).
  name text check (name is null or length(trim(name)) between 1 and 80),
  icon text check (icon is null or length(icon) <= 16),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  premade boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create trigger menu_meals_set_updated_at before update on public.menu_meals
for each row execute function public.set_updated_at();

-- Which kinds of meal (the categories: Tacos, Meat & veggies…) a meal shows under.
create table public.menu_meal_categories (
  menu_meal_id uuid not null,
  category_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (menu_meal_id, category_id),
  foreign key (menu_meal_id, household_id) references public.menu_meals (id, household_id) on delete cascade,
  foreign key (category_id, household_id) references public.meal_categories (id, household_id) on delete cascade
);

create index menu_meal_categories_category_idx on public.menu_meal_categories (category_id);

create table public.menu_meal_spots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  menu_meal_id uuid not null,
  position integer not null default 0,
  -- What the spot is (Main, Starch, Veggie…); it limits what you can pick.
  kind_id uuid,
  -- The set dish; blank = you pick one (from the kind) each time.
  recipe_id uuid,
  batches smallint not null default 1 check (batches between 1 and 3),
  constraint menu_meal_spots_has_something check (kind_id is not null or recipe_id is not null),
  foreign key (menu_meal_id, household_id) references public.menu_meals (id, household_id) on delete cascade,
  foreign key (kind_id, household_id) references public.dish_kinds (id, household_id) on delete cascade,
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade
);

create index menu_meal_spots_meal_idx on public.menu_meal_spots (menu_meal_id, position);
create index menu_meal_spots_recipe_idx on public.menu_meal_spots (recipe_id);

-- Planned meals hold dishes ----------------------------------------------------

alter table public.meals
  add column menu_meal_id uuid,
  add constraint meals_menu_meal_fk foreign key (menu_meal_id, household_id)
    references public.menu_meals (id, household_id) on delete set null (menu_meal_id);

-- A custom meal has no kind or menu meal, only dishes.
alter table public.meals drop constraint meals_has_something;

comment on column public.meals.recipe_id is 'The first dish (kept in step with meal_dishes); blank while nothing is picked.';
comment on column public.meals.servings is 'No longer used: each dish has batches (meal_dishes.batches).';

create table public.meal_dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  meal_id uuid not null,
  position integer not null default 0,
  kind_id uuid,
  -- Blank = still to pick (an open spot).
  recipe_id uuid,
  batches smallint not null default 1 check (batches between 1 and 3),
  -- Which spot of the menu meal it fills (for "last time's pick"); blank = added on the day.
  spot_position integer,
  constraint meal_dishes_has_something check (kind_id is not null or recipe_id is not null),
  foreign key (meal_id, household_id) references public.meals (id, household_id) on delete cascade,
  foreign key (kind_id, household_id) references public.dish_kinds (id, household_id) on delete cascade,
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade
);

create index meal_dishes_meal_idx on public.meal_dishes (meal_id, position);
create index meal_dishes_recipe_idx on public.meal_dishes (recipe_id);

-- meals.recipe_id follows the first picked dish, so Today, the calendar and
-- Cooking mode always know the meal's main dish.
create function public.meal_dishes_set_main()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := coalesce(new.meal_id, old.meal_id);
  first_dish uuid;
begin
  select d.recipe_id into first_dish
  from public.meal_dishes d
  where d.meal_id = target and d.recipe_id is not null
  order by d.position, d.id
  limit 1;
  update public.meals set recipe_id = first_dish where id = target and recipe_id is distinct from first_dish;
  return null;
end;
$$;

create trigger meal_dishes_set_main after insert or update or delete on public.meal_dishes
for each row execute function public.meal_dishes_set_main();

-- The grocery list ---------------------------------------------------------------

alter table public.task_lists
  add column is_groceries boolean not null default false;

create unique index task_lists_one_grocery_list on public.task_lists (household_id) where is_groceries;

insert into public.task_lists (household_id, name, icon, sort_order, is_groceries)
select h.id, 'Groceries', '🛒', 0, true from public.households h;

-- New households get it with their other starter lists.
create or replace function public.add_starter_chores(target_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (household_id, name, icon, sort_order, is_chores, is_groceries) values
    (target_household, 'Groceries', '🛒', 0, false, true),
    (target_household, 'To-do', '📝', 1, false, false),
    (target_household, 'Errands', '🚗', 2, false, false),
    (target_household, 'Chores', '🧹', 100, true, false);
$$;

revoke execute on function public.add_starter_chores(uuid) from public, anon, authenticated;

-- Neither the Chores list nor the grocery list can be removed (except with the household).
create or replace function public.task_lists_keep_chores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.is_chores or old.is_groceries) and exists (select 1 from public.households where id = old.household_id) then
    raise exception 'The % list can''t be removed', case when old.is_chores then 'Chores' else 'grocery' end using errcode = '23514';
  end if;
  return old;
end;
$$;

-- Each line remembers what it's for: [{"label":"Beef tacos ×2 · Tue","amount":2,"unit":null}].
-- More than one part = added together (the list shows a small mark).
alter table public.shopping_list
  add column parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  -- Cleared off the list (Clear ticked) but kept, so the week's menu doesn't put it back.
  add column hidden boolean not null default false,
  alter column status set default 'approved';

-- Waiting suggestions are made again (straight onto the list) the next time the review is saved.
delete from public.shopping_list where status = 'suggested';

-- Security -------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['dish_kinds', 'recipe_kinds', 'menu_meals', 'menu_meal_categories', 'menu_meal_spots', 'meal_dishes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "Households manage their own %s" on public.%I for all to authenticated '
      'using (household_id = (select public.current_household_id())) '
      'with check (household_id = (select public.current_household_id()))',
      replace(t, '_', ' '), t);
  end loop;
end;
$$;

-- Starters ------------------------------------------------------------------------

-- A grocery item by name, made if the household doesn't have it yet.
create function public.starter_item(target_household uuid, item_name text, item_aisle text, item_icon text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found uuid;
begin
  select id into found from public.items where household_id = target_household and lower(name) = lower(item_name) limit 1;
  if found is null then
    insert into public.items (household_id, name, aisle, icon) values (target_household, item_name, item_aisle, item_icon) returning id into found;
  end if;
  return found;
end;
$$;

revoke execute on function public.starter_item(uuid, text, text, text) from public, anon, authenticated;

-- A starter side dish (skipped if the household already has one by that name).
create function public.starter_dish(target_household uuid, dish_name text, dish_icon text, kind_name text, ingredients text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  dish uuid;
  kind uuid;
  line text;
  pos integer := 0;
begin
  select id into dish from public.recipes where household_id = target_household and lower(name) = lower(dish_name) limit 1;
  if dish is not null then
    return dish;
  end if;
  insert into public.recipes (household_id, name, icon, premade, serves) values (target_household, dish_name, dish_icon, true, 4) returning id into dish;
  select id into kind from public.dish_kinds where household_id = target_household and lower(name) = lower(kind_name);
  if kind is not null then
    insert into public.recipe_kinds (recipe_id, kind_id, household_id) values (dish, kind, target_household);
  end if;
  -- Each line: amount|unit|name|aisle|icon
  foreach line in array ingredients loop
    insert into public.recipe_ingredients (household_id, recipe_id, item_id, amount, unit, position)
    values (
      target_household, dish,
      public.starter_item(target_household, split_part(line, '|', 3), split_part(line, '|', 4), nullif(split_part(line, '|', 5), '')),
      nullif(split_part(line, '|', 1), '')::numeric,
      nullif(split_part(line, '|', 2), ''),
      pos
    );
    pos := pos + 1;
  end loop;
  return dish;
end;
$$;

revoke execute on function public.starter_dish(uuid, text, text, text, text[]) from public, anon, authenticated;

-- Kinds, a few sides, and a one-dish meal for every dish that had a
-- category. A brand-new household's "Meat & potatoes" meals come with sides.
create function public.add_starter_menu(target_household uuid, fresh boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  main_kind uuid;
  starch uuid;
  veggie uuid;
  rec record;
  meal uuid;
  mashed uuid;
  baked uuid;
  broccoli uuid;
  potatoes_cat uuid;
begin
  insert into public.dish_kinds (household_id, name, icon, sort_order) values
    (target_household, 'Main', '🍖', 1),
    (target_household, 'Starch', '🥔', 2),
    (target_household, 'Veggie', '🥦', 3),
    (target_household, 'Salad', '🥗', 4),
    (target_household, 'Starter', '🧀', 5),
    (target_household, 'Dessert', '🍰', 6),
    (target_household, 'Bread', '🍞', 7)
  on conflict do nothing;
  select id into main_kind from public.dish_kinds where household_id = target_household and name = 'Main';
  select id into starch from public.dish_kinds where household_id = target_household and name = 'Starch';
  select id into veggie from public.dish_kinds where household_id = target_household and name = 'Veggie';

  -- Every dish so far was planned as a whole meal: it's a Main.
  insert into public.recipe_kinds (recipe_id, kind_id, household_id)
  select r.id, main_kind, target_household from public.recipes r
  where r.household_id = target_household and not r.is_backup
    and not exists (select 1 from public.recipe_kinds k where k.recipe_id = r.id);

  -- Each dish with a category becomes a one-dish meal under the same categories.
  for rec in
    select r.id, r.premade from public.recipes r
    where r.household_id = target_household and not r.is_backup
      and exists (select 1 from public.recipe_categories rc where rc.recipe_id = r.id)
      and not exists (select 1 from public.menu_meal_spots s where s.recipe_id = r.id)
  loop
    insert into public.menu_meals (household_id, premade) values (target_household, rec.premade) returning id into meal;
    insert into public.menu_meal_spots (household_id, menu_meal_id, position, kind_id, recipe_id) values (target_household, meal, 0, main_kind, rec.id);
    insert into public.menu_meal_categories (menu_meal_id, category_id, household_id)
    select meal, rc.category_id, target_household from public.recipe_categories rc where rc.recipe_id = rec.id;
  end loop;

  -- A few sides to build plates with.
  mashed := public.starter_dish(target_household, 'Mashed potatoes', '🥔', 'Starch', array['1|kg|Potatoes|Produce|🥔', '2|tbsp|Butter|Dairy|🧈', '0.5|cup|Milk|Dairy|🥛']);
  baked := public.starter_dish(target_household, 'Baked potatoes', '🥔', 'Starch', array['4||Baking potatoes|Produce|🥔']);
  perform public.starter_dish(target_household, 'Rice', '🍚', 'Starch', array['1|cup|Rice|Pantry|🍚']);
  broccoli := public.starter_dish(target_household, 'Steamed broccoli', '🥦', 'Veggie', array['1|head|Broccoli|Produce|🥦']);
  perform public.starter_dish(target_household, 'Glazed carrots', '🥕', 'Veggie', array['500|g|Carrots|Produce|🥕', '1|tbsp|Butter|Dairy|🧈', '1|tbsp|Brown sugar|Pantry|']);
  perform public.starter_dish(target_household, 'Corn on the cob', '🌽', 'Veggie', array['4||Corn on the cob|Produce|🌽']);
  perform public.starter_dish(target_household, 'Green salad', '🥗', 'Salad', array['1|head|Lettuce|Produce|🥬', '1||Cucumber|Produce|🥒', '2||Tomatoes|Produce|🍅']);
  perform public.starter_dish(target_household, 'Caesar salad', '🥗', 'Salad', array['1|head|Romaine lettuce|Produce|🥬', '0.25|cup|Caesar dressing|Pantry|', '1|cup|Croutons|Pantry|']);

  if not fresh then
    return;
  end if;

  -- A new household's starter "Meat & potatoes" meals get their sides.
  select id into potatoes_cat from public.meal_categories where household_id = target_household and name = 'Meat & potatoes' and premade;
  if potatoes_cat is null then
    return;
  end if;
  update public.meal_categories set name = 'Meat & veggies' where id = potatoes_cat;
  for rec in
    select m.id as meal_id, r.name from public.menu_meals m
    join public.menu_meal_spots s on s.menu_meal_id = m.id
    join public.recipes r on r.id = s.recipe_id
    join public.menu_meal_categories c on c.menu_meal_id = m.id and c.category_id = potatoes_cat
    where m.household_id = target_household
  loop
    if rec.name = 'Pork chops' then
      insert into public.menu_meal_spots (household_id, menu_meal_id, position, kind_id, recipe_id) values
        (target_household, rec.meal_id, 1, starch, mashed),
        (target_household, rec.meal_id, 2, veggie, null);
    elsif rec.name = 'Roast chicken' then
      insert into public.menu_meal_spots (household_id, menu_meal_id, position, kind_id, recipe_id) values
        (target_household, rec.meal_id, 1, starch, null),
        (target_household, rec.meal_id, 2, veggie, null);
    elsif rec.name = 'Steak' then
      update public.menu_meals set name = 'Steak and baked potatoes' where id = rec.meal_id;
      insert into public.menu_meal_spots (household_id, menu_meal_id, position, kind_id, recipe_id) values
        (target_household, rec.meal_id, 1, starch, baked),
        (target_household, rec.meal_id, 2, veggie, broccoli);
    end if;
  end loop;
end;
$$;

revoke execute on function public.add_starter_menu(uuid, boolean) from public, anon, authenticated;

select public.add_starter_menu(id, false) from public.households;

-- Planned meals so far: one dish each (the recipe), from its one-dish meal.
update public.meals m
set menu_meal_id = s.menu_meal_id
from public.menu_meal_spots s
where s.recipe_id = m.recipe_id and s.position = 0
  and (select count(*) from public.menu_meal_spots x where x.menu_meal_id = s.menu_meal_id) = 1;

insert into public.meal_dishes (household_id, meal_id, position, kind_id, recipe_id, batches, spot_position)
select m.household_id, m.id, 0,
  (select k.kind_id from public.recipe_kinds k where k.recipe_id = m.recipe_id limit 1),
  m.recipe_id,
  -- Servings become whole batches.
  least(3, greatest(1, ceil(coalesce(m.servings, r.serves)::numeric / r.serves)))::smallint,
  case when m.menu_meal_id is null then null else 0 end
from public.meals m
join public.recipes r on r.id = m.recipe_id
where m.recipe_id is not null;

-- New households: after their starter meals are made (triggers run in name order: meals, then menu).
create function public.households_add_starter_menu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_starter_menu(new.id, true);
  return new;
end;
$$;

revoke execute on function public.households_add_starter_menu() from public, anon, authenticated;

create trigger households_add_starter_menu
after insert on public.households
for each row execute function public.households_add_starter_menu();
