-- Meals (design: "Almanac Meals: design", agreed with Connor 2026-11-05).
--
-- meal_times          the times of day you plan, e.g. Lunch and Dinner (rows on the planner)
-- meal_categories     kinds of meal with a picture, e.g. Tacos, Pasta
-- meal_presets        "Tuesday dinner is Tacos": placed automatically each week
-- recipes             variants inside categories, e.g. Beef tacos (also backup meals)
-- recipe_categories   which categories a variant sits in
-- meal_tags           Quick, Vegetarian, Kid favourite, Budget …
-- recipe_tags         which tags a variant has
-- items               one shared list of grocery items, with their aisle
-- recipe_ingredients  what a variant needs
-- recipe_steps        how to make it, one step per row
-- step_helpers        timers, heads-ups, oven and doneness checks on a step
-- meals               one variant at one meal time on one day (several can share a cell)
-- meal_members        who a meal is for (none = everyone)
-- meal_weeks          weeks the presets have already been placed in
-- backup_parts        the parts of a backup meal you keep on hand, with counts
-- weekly_buys         things that go on the grocery list every week or few
-- shopping_list       grocery lines: suggested first, then approved onto the list
-- days                each date's energy mode (normal, low, survival)
--
-- Only the parts of backup meals are counted. Almanac never tracks what's
-- in the cupboards; ingredients exist so the grocery list can add them up.

-------------------------------------------------------------------------------
-- Meal times
-------------------------------------------------------------------------------
create table public.meal_times (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  icon text check (icon is null or length(icon) <= 16),
  -- When you usually eat it.
  usual_time time not null default '18:00',
  -- Hidden meal times keep their meals but get no row on the planner.
  show_on_planner boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index meal_times_household_id_idx on public.meal_times (household_id);
create trigger meal_times_set_updated_at before update on public.meal_times
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Categories and presets
-------------------------------------------------------------------------------
create table public.meal_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 16),
  -- The meal times it suits (for the tray's tabs). Empty = any.
  meal_time_ids uuid[] not null default '{}',
  active boolean not null default true,
  premade boolean not null default false,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index meal_categories_household_id_idx on public.meal_categories (household_id);
create trigger meal_categories_set_updated_at before update on public.meal_categories
for each row execute function public.set_updated_at();

create table public.meal_presets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday
  weekday smallint not null check (weekday between 0 and 6),
  meal_time_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  unique (household_id, weekday, meal_time_id, category_id),
  foreign key (meal_time_id, household_id) references public.meal_times (id, household_id) on delete cascade,
  foreign key (category_id, household_id) references public.meal_categories (id, household_id) on delete cascade
);

-------------------------------------------------------------------------------
-- Recipes (variants) and what's in them
-------------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  icon text check (icon is null or length(icon) <= 16),
  serves smallint not null default 4 check (serves between 1 and 50),
  -- Minutes of actual cooking work, and from start to table.
  hands_on_minutes smallint check (hands_on_minutes is null or hands_on_minutes between 0 and 1440),
  total_minutes smallint check (total_minutes is null or total_minutes between 0 and 2880),
  -- A ready-to-go fallback for hard days (see backup_parts).
  is_backup boolean not null default false,
  notes text check (length(notes) <= 4000),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  last_cooked_on date,
  premade boolean not null default false,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index recipes_household_id_idx on public.recipes (household_id);
create trigger recipes_set_updated_at before update on public.recipes
for each row execute function public.set_updated_at();

create table public.recipe_categories (
  recipe_id uuid not null,
  category_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (recipe_id, category_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (category_id, household_id) references public.meal_categories (id, household_id) on delete cascade
);

create index recipe_categories_category_idx on public.recipe_categories (category_id);

create table public.meal_tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  icon text check (icon is null or length(icon) <= 16),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create unique index meal_tags_household_name_idx on public.meal_tags (household_id, lower(trim(name)));

create table public.recipe_tags (
  recipe_id uuid not null,
  tag_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (recipe_id, tag_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (tag_id, household_id) references public.meal_tags (id, household_id) on delete cascade
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  icon text check (icon is null or length(icon) <= 16),
  aisle text not null default 'Other' check (length(trim(aisle)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create unique index items_household_name_idx on public.items (household_id, lower(trim(name)));
create trigger items_set_updated_at before update on public.items
for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  item_id uuid not null,
  -- Blank for "salt to taste".
  amount numeric(10, 3) check (amount is null or amount > 0),
  unit text check (unit is null or length(unit) <= 20),
  note text check (note is null or length(note) <= 80),
  -- Fresh things (thawed meat) that need putting away if the meal is swapped.
  put_away_if_skipped boolean not null default false,
  position integer not null default 0,
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  position integer not null default 0,
  text text not null check (length(trim(text)) between 1 and 400),
  unique (id, household_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade
);

create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

create table public.step_helpers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  step_id uuid not null,
  kind text not null check (kind in ('timer', 'heads_up', 'oven', 'doneness')),
  -- timer: its length. heads_up: how long before eating it's due.
  minutes integer check (minutes is null or minutes between 1 and 4320),
  -- oven and doneness: the temperature, in the household's unit.
  temperature smallint check (temperature is null or temperature between 1 and 600),
  -- What it says, e.g. "Thaw the ground beef" or "Chicken".
  label text check (label is null or length(label) <= 80),
  foreign key (step_id, household_id) references public.recipe_steps (id, household_id) on delete cascade,
  constraint step_helpers_needs_value check (
    (kind = 'timer' and minutes is not null)
    or (kind = 'heads_up' and minutes is not null and label is not null)
    or (kind in ('oven', 'doneness') and temperature is not null)
  )
);

create index step_helpers_step_idx on public.step_helpers (step_id);

-------------------------------------------------------------------------------
-- Planned meals
-------------------------------------------------------------------------------
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date date not null,
  meal_time_id uuid not null,
  category_id uuid,
  -- Blank = "decide later".
  recipe_id uuid,
  -- Blank = what the recipe serves.
  servings smallint check (servings is null or servings between 1 and 50),
  status text not null default 'planned' check (status in ('planned', 'cooked', 'swapped', 'skipped')),
  -- A swapped meal points at the backup that replaced it.
  swapped_for_id uuid,
  from_preset boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (meal_time_id, household_id) references public.meal_times (id, household_id) on delete cascade,
  foreign key (category_id, household_id) references public.meal_categories (id, household_id) on delete set null (category_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete set null (recipe_id),
  foreign key (swapped_for_id, household_id) references public.meals (id, household_id) on delete set null (swapped_for_id),
  constraint meals_has_something check (category_id is not null or recipe_id is not null)
);

create index meals_household_date_idx on public.meals (household_id, date);
create trigger meals_set_updated_at before update on public.meals
for each row execute function public.set_updated_at();

create table public.meal_members (
  meal_id uuid not null,
  member_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (meal_id, member_id),
  foreign key (meal_id, household_id) references public.meals (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);

create index meal_members_member_idx on public.meal_members (member_id);

create table public.meal_weeks (
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  primary key (household_id, week_start)
);

-------------------------------------------------------------------------------
-- Backup meals, weekly buys and the grocery list
-------------------------------------------------------------------------------
create table public.backup_parts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  item_id uuid not null,
  -- How many one meal uses, how many you have, and the least you want to keep.
  uses numeric(8, 2) not null default 1 check (uses > 0),
  on_hand numeric(8, 2) not null default 0 check (on_hand >= 0),
  keep_at_least numeric(8, 2) not null default 1 check (keep_at_least >= 0),
  position integer not null default 0,
  unique (id, household_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade
);

create index backup_parts_recipe_idx on public.backup_parts (recipe_id);

create table public.weekly_buys (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  amount numeric(8, 2) check (amount is null or amount > 0),
  unit text check (unit is null or length(unit) <= 20),
  every_weeks smallint not null default 1 check (every_weeks between 1 and 12),
  -- The last week it went on a list (for every-few-weeks items).
  last_week date,
  created_at timestamptz not null default now(),
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade
);

create table public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  amount numeric(10, 3) check (amount is null or amount > 0),
  unit text check (unit is null or length(unit) <= 20),
  source text not null default 'manual' check (source in ('manual', 'meal', 'weekly', 'backup')),
  -- Where it came from, in words, e.g. "Beef tacos, Chili".
  detail text check (detail is null or length(detail) <= 200),
  -- A backup part bought here goes back into its count when ticked off.
  backup_part_id uuid,
  week_of date not null,
  -- Suggested lines wait for approval before they're on the list.
  status text not null default 'suggested' check (status in ('suggested', 'approved')),
  checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  foreign key (backup_part_id, household_id) references public.backup_parts (id, household_id) on delete set null (backup_part_id)
);

create index shopping_list_household_idx on public.shopping_list (household_id, status, checked);

-------------------------------------------------------------------------------
-- Energy modes
-------------------------------------------------------------------------------
create table public.days (
  household_id uuid not null references public.households (id) on delete cascade,
  date date not null,
  energy_mode text not null default 'normal' check (energy_mode in ('normal', 'low', 'survival')),
  updated_at timestamptz not null default now(),
  primary key (household_id, date)
);

create trigger days_set_updated_at before update on public.days
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Tasks made by meals: heads-ups, and must-dos like "put the beef away"
-------------------------------------------------------------------------------
alter table public.task_instances
  add column must_do boolean not null default false,
  add column meal_id uuid,
  add constraint task_instances_meal_fk foreign key (meal_id, household_id)
    references public.meals (id, household_id) on delete cascade;

create index task_instances_meal_idx on public.task_instances (meal_id);

-------------------------------------------------------------------------------
-- Security: each household only sees and changes its own.
-------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'meal_times', 'meal_categories', 'meal_presets', 'recipes', 'recipe_categories', 'meal_tags',
    'recipe_tags', 'items', 'recipe_ingredients', 'recipe_steps', 'step_helpers', 'meals',
    'meal_members', 'meal_weeks', 'backup_parts', 'weekly_buys', 'shopping_list', 'days'
  ] loop
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

-------------------------------------------------------------------------------
-- Starters: Lunch and Dinner, a few categories with variant names (no
-- recipes: those are personal), tags, and some weekly buys. All editable.
-------------------------------------------------------------------------------
create function public.add_starter_meals(target_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  insert into public.weekly_buys (household_id, item_id, amount, unit)
  select target_household, id, null, null from public.items where household_id = target_household;
end;
$$;

revoke execute on function public.add_starter_meals(uuid) from public, anon, authenticated;

select public.add_starter_meals(id) from public.households;

create function public.households_add_starter_meals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_starter_meals(new.id);
  return new;
end;
$$;

revoke execute on function public.households_add_starter_meals() from public, anon, authenticated;

create trigger households_add_starter_meals
after insert on public.households
for each row execute function public.households_add_starter_meals();
