-- Art screen saver (2026-11-12, thread "Plan the art screen saver").
--
-- Connor: like a Samsung Frame TV, the kitchen screen shows a painting in
-- a thin white mat when nobody's using it, during dinner, at set times and
-- overnight. The paintings are files in folders on the computer running
-- Almanac (General, the seasons, a folder per holiday and per birthday),
-- found by name. See src/lib/screen-saver.ts.
--
-- The screen saver's own settings live in households.settings
-- (screenSaver), like the other household settings.
--
-- holidays.art_only_days   for this many days before the holiday (and on
--                          the day), only its own art shows.
-- holidays.art_mix_days    for this many days before it, its art is mixed
--                          in with the season's and General.
-- art_shown                which painting each household showed for each
--                          "slot" (a day, half day, two hours or each
--                          start), so every screen shows the same one and
--                          nothing repeats until its turn comes round.

alter table public.holidays
  add column art_only_days smallint not null default 0 check (art_only_days between 0 and 14),
  add column art_mix_days smallint not null default 14 check (art_mix_days between 0 and 60);

create table public.art_shown (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  slot text not null check (length(slot) between 1 and 60),
  file text not null check (length(file) between 1 and 600),
  shown_at timestamptz not null default now(),
  unique (household_id, slot)
);

create index art_shown_household_idx on public.art_shown (household_id, shown_at desc);

alter table public.art_shown enable row level security;
revoke all on public.art_shown from anon;
grant select, insert, delete on public.art_shown to authenticated;

create policy "Households see their own paintings" on public.art_shown for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
