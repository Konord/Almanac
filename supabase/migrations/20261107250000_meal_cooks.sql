-- Scheduling model, step 6: meals as prep, eat and tidy.
--
-- A meal can have a cook, chosen when planning (or left for later). The
-- cook gets the prep time before the meal on their own timeline; everyone
-- eating gets the meal and the tidy-up after it (tidying isn't tracked).
-- The meal only moves for its cook's plans or a whole-family event.

alter table public.meals
  add column cook_id uuid,
  add constraint meals_cook_fk foreign key (cook_id, household_id)
    references public.members (id, household_id) on delete set null (cook_id);
