-- Checks for the app launcher (2026-11-11). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('66666666-6666-6666-6666-666666666661', 'apps-a@test', 'authenticated', 'authenticated'),
  ('66666666-6666-6666-6666-666666666662', 'apps-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666661","role":"authenticated"}', true);
select public.create_household('Apps House');

insert into public.launcher_apps (household_id, name, icon, colour, kind, address)
values (public.current_household_id(), 'Jellyfin', '🍿', 'purple', 'web', 'http://192.168.2.10:8096/');
insert into public.launcher_apps (household_id, name, kind, local_key)
values (public.current_household_id(), 'Steam', 'local', 'steam');
select is((select count(*)::int from public.launcher_apps), 2, 'A household adds a web app and a program');

select throws_ok(
  $$ insert into public.launcher_apps (household_id, name, kind) values (public.current_household_id(), 'Nowhere', 'web') $$,
  '23514', null, 'A web app needs an address');
select throws_ok(
  $$ insert into public.launcher_apps (household_id, name, kind, address) values (public.current_household_id(), 'Sneaky', 'web', 'javascript:alert(1)') $$,
  '23514', null, 'Only http and https addresses');
select throws_ok(
  $$ insert into public.launcher_apps (household_id, name, kind, local_key) values (public.current_household_id(), 'Shell', 'local', 'rm -rf') $$,
  '23514', null, 'A program is named by a simple key, never a command');

-- Another household sees none of them.
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666662","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.launcher_apps), 0, 'Apps are private to their household');
update public.launcher_apps set name = 'Mine now';
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666661","role":"authenticated"}', true);
select is((select count(*)::int from public.launcher_apps where name = 'Mine now'), 0, 'Another household can''t change them');

select * from finish();
rollback;
