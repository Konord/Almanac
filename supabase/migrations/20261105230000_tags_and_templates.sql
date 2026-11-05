-- Tags, several people per event, people pictures and event templates
-- (data entry, step 3).
--
-- event_members   who an event is for. An event can be for several people
--                 (Mom and Ava at karate); none means everyone. Replaces
--                 events.member_id, which is copied over and then dropped.
-- tags            labels you stick on events, like Work or Work from home,
--                 each with a picture. An event can have any number.
-- event_tags      which tags are on which event.
-- event_templates ready-made events, like Court: tapping one fills in the
--                 add card (name, picture, length, person, tags).
-- members.icon    an optional picture for a person, shown instead of
--                 the letter in a coloured circle.
--
-- Connor chose tags over layers (2026-11-05): layers stay in the database
-- for now (every event still has one, set quietly), and later come back
-- as saved filters over tags. Each existing layer becomes a tag of the
-- same name, so nothing is lost; events aren't tagged automatically.

-------------------------------------------------------------------------------
-- People pictures
-------------------------------------------------------------------------------
alter table public.members add column icon text check (char_length(icon) <= 16);
comment on column public.members.icon is 'An emoji shown for this person. Null: the first letter of their name in their colour.';
-- Members have column-by-column permissions (so PINs stay hidden); add the new one.
grant select (icon), insert (icon), update (icon) on public.members to authenticated;

-------------------------------------------------------------------------------
-- tags
-------------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  icon text check (char_length(icon) <= 16),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

-- No two tags in a household with the same name (ignoring capitals).
create unique index tags_household_name_idx on public.tags (household_id, lower(trim(name)));

create trigger tags_set_updated_at
before update on public.tags
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- event_tags
-------------------------------------------------------------------------------
create table public.event_tags (
  event_id uuid not null,
  tag_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (event_id, tag_id),
  foreign key (event_id, household_id) references public.events (id, household_id) on delete cascade,
  foreign key (tag_id, household_id) references public.tags (id, household_id) on delete cascade
);

create index event_tags_tag_id_idx on public.event_tags (tag_id);
create index event_tags_household_id_idx on public.event_tags (household_id);

-------------------------------------------------------------------------------
-- event_members
-------------------------------------------------------------------------------
create table public.event_members (
  event_id uuid not null,
  member_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (event_id, member_id),
  foreign key (event_id, household_id) references public.events (id, household_id) on delete cascade,
  foreign key (member_id, household_id) references public.members (id, household_id) on delete cascade
);

create index event_members_member_id_idx on public.event_members (member_id);
create index event_members_household_id_idx on public.event_members (household_id);

insert into public.event_members (event_id, member_id, household_id)
select id, member_id, household_id from public.events where member_id is not null;

alter table public.events drop column member_id;

-------------------------------------------------------------------------------
-- event_templates
-------------------------------------------------------------------------------
create table public.event_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- What the event is called when added (also the template's name).
  title text not null check (length(trim(title)) between 1 and 120),
  icon text check (char_length(icon) <= 16),
  -- Usual start time; null means "wherever you tapped".
  start_time time,
  minutes smallint not null default 60 check (minutes between 5 and 1440),
  all_day boolean not null default false,
  -- People to put it on; ones that have since been removed are ignored.
  member_ids uuid[] not null default '{}',
  -- Tags to stick on; ones that have since been removed are ignored.
  tag_ids uuid[] not null default '{}',
  notes text check (length(notes) <= 2000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_templates_household_id_idx on public.event_templates (household_id);

create trigger event_templates_set_updated_at
before update on public.event_templates
for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Security
-------------------------------------------------------------------------------
alter table public.tags enable row level security;
alter table public.event_tags enable row level security;
alter table public.event_members enable row level security;
alter table public.event_templates enable row level security;

revoke all on public.tags, public.event_tags, public.event_members, public.event_templates from anon;

create policy "Households manage their own tags"
on public.tags for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own event tags"
on public.event_tags for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage who their events are for"
on public.event_members for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

create policy "Households manage their own event templates"
on public.event_templates for all to authenticated
using (household_id = (select public.current_household_id()))
with check (household_id = (select public.current_household_id()));

-------------------------------------------------------------------------------
-- Layers become tags
-------------------------------------------------------------------------------
insert into public.tags (household_id, name, icon, sort_order)
select
  household_id,
  name,
  case lower(name)
    when 'court' then '⚖️'
    when 'appointments' then '🩺'
    when 'kids' then '🧒'
    when 'family' then '🏡'
  end,
  sort_order
from public.layers
on conflict do nothing;
