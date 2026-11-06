-- Checks for heads-ups. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('93939393-9393-9393-9393-939393939393', 'heads-a@test', 'authenticated', 'authenticated'),
  ('94949494-9494-9494-9494-949494949494', 'heads-b@test', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"93939393-9393-9393-9393-939393939393","role":"authenticated"}', true);
select public.create_household('Heads House');
insert into public.events (household_id, layer_id, title, starts_at, ends_at, timezone)
select public.current_household_id(), id, 'Hockey game', '2026-11-14 18:00-05', '2026-11-14 19:30-05', 'America/Toronto' from public.layers limit 1;

insert into public.heads_ups (household_id, event_id, label, minutes_before)
select public.current_household_id(), id, 'Pack the bag', 1440 from public.events;
select is((select count(*)::int from public.heads_ups), 1, 'An event can have a heads-up');

select throws_ok(
  $$insert into public.heads_ups (household_id, label, minutes_before) values (public.current_household_id(), 'Nothing', 60)$$,
  '23514', null, 'A heads-up needs an event or a chore'
);

insert into public.task_instances (household_id, list_id, title, due_date, heads_up_id, heads_up_for)
select public.current_household_id(), (select id from public.task_lists limit 1), 'Pack the bag', '2026-11-13', id, '2026-11-14' from public.heads_ups;
select throws_ok(
  $$insert into public.task_instances (household_id, list_id, title, due_date, heads_up_id, heads_up_for)
    select public.current_household_id(), (select id from public.task_lists limit 1), 'Pack the bag', '2026-11-13', id, '2026-11-14' from public.heads_ups$$,
  '23505', null, 'Each heads-up makes one to-do per date'
);

delete from public.events;
select is((select count(*)::int from public.task_instances where heads_up_for is not null), 0, 'Removing the event removes what its heads-ups made');

select set_config('request.jwt.claims', '{"sub":"94949494-9494-9494-9494-949494949494","role":"authenticated"}', true);
select public.create_household('Other House');
select is((select count(*)::int from public.heads_ups), 0, 'Other households cannot see heads-ups');

select * from finish();
rollback;
