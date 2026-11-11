-- App launcher (2026-11-11, thread "Launch server apps from the menu tray").
--
-- Connor: open Jellyfin, Actual, FreeTube, Steam and the like from the
-- kitchen screen as if Almanac were a phone's home screen, with an "up"
-- dot for the server apps and a heads-up when one goes down. Only the
-- kitchen screen (the mini PC running the launcher helper) shows them.
--
-- launcher_apps   one tile in the tray's apps tier.
--   kind 'web'    a web app on the server (Jellyfin, Actual): its address
--                 opens full screen, and Almanac checks it's answering.
--   kind 'local'  a program on the kitchen PC itself (Steam, FreeTube):
--                 local_key names it in the helper's own list, so the
--                 helper only ever starts programs it was set up with.
--   failures, checked_at, down_since: the latest up check. Two failed
--                 checks in a row count as down (src/lib/launcher.ts).

create table public.launcher_apps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  icon text check (icon is null or length(icon) <= 16),
  colour text not null default 'slate' check (colour in ('blue', 'pink', 'teal', 'purple', 'orange', 'green', 'slate')),
  kind text not null check (kind in ('web', 'local')),
  address text check (address is null or (address ~ '^https?://' and length(address) <= 300)),
  local_key text check (local_key is null or local_key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  check_up boolean not null default true,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'adults', 'just_me')),
  sort_order integer not null default 0,
  failures integer not null default 0 check (failures >= 0),
  checked_at timestamptz,
  down_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'web' and address is not null) or (kind = 'local' and local_key is not null))
);

create index launcher_apps_household_idx on public.launcher_apps (household_id, sort_order);
create trigger launcher_apps_set_updated_at before update on public.launcher_apps
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.launcher_apps enable row level security;
revoke all on public.launcher_apps from anon;
grant select, insert, update, delete on public.launcher_apps to authenticated;

create policy "Households manage their own apps" on public.launcher_apps for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
