-- A meal can have its own name (Connor, 2026-11-12): the + beside Meals on
-- the Planner adds an extra meal tile for one day ("Snack", "Party food").
-- It still sits in a meal block for its time; the name is what it's called
-- until a dish is picked. Empty means "use the meal block's name".
alter table public.meals
  add column name text check (name is null or char_length(name) between 1 and 60);
