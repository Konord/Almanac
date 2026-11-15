-- Spotify (2026-11-15, thread "Build the Spotify widget").
--
-- Connor: the Today panel shows the song playing on his Spotify account,
-- with pause and skip. The music itself plays from his phone; Almanac only
-- shows it and sends play/pause/skip to whatever is playing.
--
-- spotify_connections  one Spotify account per household (Connor's).
--   access_token   a short-lived key (one hour) for asking Spotify things.
--   refresh_token  a long-lived key that gets a new access_token when the
--                  old one runs out, so nobody has to sign in again.
--   expires_at     when access_token stops working.
--   spotify_user_id, display_name  whose account it is, to show in Settings.
--
-- The keys are only ever read on the server (src/lib/spotify.ts). Like every
-- table, a household can only see its own row.

create table public.spotify_connections (
  household_id uuid primary key references public.households (id) on delete cascade,
  spotify_user_id text not null check (length(spotify_user_id) between 1 and 200),
  display_name text check (display_name is null or length(display_name) <= 200),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger spotify_connections_set_updated_at before update on public.spotify_connections
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.spotify_connections enable row level security;
revoke all on public.spotify_connections from anon;
grant select, insert, update, delete on public.spotify_connections to authenticated;

create policy "Households manage their own Spotify" on public.spotify_connections for all to authenticated
using (household_id = (select public.current_household_id())) with check (household_id = (select public.current_household_id()));
