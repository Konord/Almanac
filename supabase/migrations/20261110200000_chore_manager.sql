-------------------------------------------------------------------------------
-- Chore Manager (2026-11-09).
--
-- Chores come in two kinds, now called regular and occasional on screen
-- (kind 'preset' and 'generated' in the database):
--
--   - A regular chore belongs to exactly one chore day and shows every time
--     that day comes round. It has no tags. It can have a time it's due by
--     that day (at_time). The same job on two chore days is two chores.
--   - An occasional chore comes due on its repeat rule (unchanged).
--
-- This moves existing regular chores over to that shape.
-------------------------------------------------------------------------------

-- 1. A regular chore with no chore day goes on the Free day.
insert into public.task_template_chore_days (template_id, chore_day_id, household_id)
select t.id, d.id, t.household_id
from public.task_templates t
join public.chore_days d on d.household_id = t.household_id and d.is_free
where t.kind = 'preset'
  and not exists (select 1 from public.task_template_chore_days l where l.template_id = t.id);

-- 2. A regular chore on several chore days keeps the first one (and its
-- history). Each other chore day gets its own copy of the chore.
create temporary table chore_manager_extra as
select ranked.template_id, ranked.chore_day_id, ranked.household_id, gen_random_uuid() as new_id
from (
  select l.template_id, l.chore_day_id, l.household_id,
         row_number() over (partition by l.template_id order by d.sort_order, d.name, d.id) as n
  from public.task_template_chore_days l
  join public.task_templates t on t.id = l.template_id and t.kind = 'preset'
  join public.chore_days d on d.id = l.chore_day_id
) ranked
where ranked.n > 1;

insert into public.task_templates
select (jsonb_populate_record(
  null::public.task_templates,
  to_jsonb(t) || jsonb_build_object('id', e.new_id, 'created_at', now(), 'updated_at', now())
)).*
from chore_manager_extra e
join public.task_templates t on t.id = e.template_id;

delete from public.task_template_chore_days l
using chore_manager_extra e
where l.template_id = e.template_id and l.chore_day_id = e.chore_day_id;

insert into public.task_template_chore_days (template_id, chore_day_id, household_id)
select new_id, chore_day_id, household_id from chore_manager_extra;

drop table chore_manager_extra;

-- 3. Regular chores have no tags.
update public.task_templates set tags = '{}' where kind = 'preset' and tags <> '{}';
