-- Checks for the bright style (Phase 3, step 2). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('55555555-5555-5555-5555-555555555555', 'style@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select public.create_household('Bright House');

select is((select settings ->> 'activeTheme' from public.households), 'bright', 'A new household uses the bright theme');
select is((select settings -> 'handwriting' from public.households), 'true'::jsonb, 'Handwriting is on by default');
select is((select tokens -> 'colors' ->> 'personBlueSoft' from public.themes where slug = 'bright'), '#CFE3F8', 'The bright theme has the person colours');
select is((select colour from public.layers where name = 'Family'), 'orange', 'Starter layers use the person colours');

insert into public.members (household_id, name, role) values (public.current_household_id(), 'Ava', 'child');
select is((select colour from public.members where name = 'Ava'), 'blue', 'People start out blue');
select throws_ok(
  $$ update public.members set colour = 'marker-blue' where name = 'Ava' $$,
  '23514', null, 'Old marker colours are refused');

select * from finish();
rollback;
