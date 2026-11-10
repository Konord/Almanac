-- Kinds of day instead of event tags, step 6 (Connor, 2026-11-10):
-- a dish can "go with" kinds of meal. Caesar salad goes with Pasta, Pizza
-- and more; in a Pasta meal's side spot it's offered first.
--
-- recipe_categories already links dishes to kinds of meal (from before
-- dishes and meals were split, 2026-11-11), and nothing else reads it now,
-- so it takes on this meaning: links made then (a dish that used to sit
-- under Pasta) start as "goes with Pasta".

comment on table public.recipe_categories is 'Which kinds of meal a dish goes with: it is offered first in their spots.';
