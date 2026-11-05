-- Checks for tags, event templates and people pictures. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, aud, role) values
  ('66666666-6666-6666-6666-666666666661', 'tags-a@test', 'authenticated', 'authenticated'),
  ('66666666-6666-6666-6666-666666666662', 'tags-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666661","role":"authenticated"}', true);
select public.create_household('Tag House');

insert into public.tags (household_id, name, icon) values (public.current_household_id(), 'Work', '💼');
select throws_ok(
  $$ insert into public.tags (household_id, name) values (public.current_household_id(), ' work ') $$,
  '23505', null, 'Two tags cannot share a name');

insert into public.events (household_id, layer_id, title, starts_at, ends_at, timezone)
select public.current_household_id(), id, 'Shift', now(), now() + interval '1 hour', 'America/Toronto' from public.layers limit 1;
insert into public.event_tags (event_id, tag_id, household_id)
select e.id, t.id, public.current_household_id() from public.events e, public.tags t;
select is((select count(*)::int from public.event_tags), 1, 'An event can be tagged');

delete from public.tags where name = 'Work';
select is((select count(*)::int from public.event_tags), 0, 'Removing a tag takes it off events');

insert into public.members (household_id, name, role, icon) values (public.current_household_id(), 'Ava', 'child', '🦄');
select is((select icon from public.members where name = 'Ava'), '🦄', 'A person can have a picture');

insert into public.members (household_id, name, role) values (public.current_household_id(), 'Mom', 'parent');
insert into public.event_members (event_id, member_id, household_id)
select e.id, m.id, public.current_household_id() from public.events e, public.members m;
select is((select count(*)::int from public.event_members), 2, 'An event can be for several people');

insert into public.event_templates (household_id, title, icon, minutes, member_ids)
select public.current_household_id(), 'Court', '⚖️', 480, array_agg(id) from public.members where name = 'Ava';
select is((select minutes from public.event_templates), 480::smallint, 'Templates keep their length');
select throws_ok(
  $$ insert into public.event_templates (household_id, title, minutes) values (public.current_household_id(), 'Too long', 5000) $$,
  '23514', null, 'Template lengths are checked');

-- Another household sees none of it.
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666662","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.event_templates), 0, 'Templates are private to a household');

select * from finish();
rollback;
