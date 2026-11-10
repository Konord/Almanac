-- Routine templates (thread "Share routines across people", step 2, 2026-11-10).
--
-- A routine saved as a template is a starting point, like an event
-- template: "Start from" copies it (steps and all) into a new routine you
-- then change on its own. Templates are never on anyone's day, so they
-- never show on the calendar or the daily list.
--
-- (The table is still called routine_templates from Phase 3, when every
-- routine was a "template" for its daily checklists. is_template marks the
-- ones that are templates in today's sense.)
alter table public.routine_templates
  add column is_template boolean not null default false;

comment on column public.routine_templates.is_template is 'A starting point for new routines (Start from), never given to anyone.';

-- A template can't be on anyone's day.
create function public.routine_assignment_not_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.routine_templates t where t.id = new.template_id and t.is_template) then
    raise exception 'A routine template can''t be given to someone; start a routine from it instead.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger routine_assignments_not_template
before insert or update on public.routine_assignments
for each row execute function public.routine_assignment_not_template();
